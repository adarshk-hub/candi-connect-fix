CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  timezone VARCHAR DEFAULT 'Asia/Kolkata',
  -- Bearer token the client's own website/landing-page forms use to POST
  -- into /api/webhooks/landing-page. Not used for Meta or Aisensy, which
  -- authenticate via their own signature/verify-token schemes instead.
  api_key VARCHAR UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Routes an incoming Meta Lead Ads webhook delivery (keyed by Facebook
  -- Page ID) or Aisensy inbound WhatsApp message (keyed by the business
  -- phone number) to the right client/workspace.
  meta_page_id VARCHAR UNIQUE,
  aisensy_phone_number VARCHAR UNIQUE,
  -- Ad account IDs spend sync fetches from. meta_ad_account_id is the
  -- "act_<id>" account (without the "act_" prefix); google_ads_customer_id
  -- is a 10-digit customer ID (digits only, no dashes), accessed through the
  -- agency's Google Ads manager (MCC) account credentials in env.
  meta_ad_account_id VARCHAR,
  google_ads_customer_id VARCHAR,
  -- Institute branding + display preferences, set via Settings > Customize.
  -- Small base64 data URL rather than a cloud-storage URL — there's no
  -- object-storage integration in this project yet, and a logo is small
  -- enough that storing it inline is a reasonable tradeoff for now.
  logo_data_url TEXT,
  leads_per_page INT NOT NULL DEFAULT 250,
  -- Outgoing SMTP account the school sends stage/reminder emails from (set
  -- via Settings > Customize > School Email). smtp_pass is stored as-is —
  -- there's no encryption-at-rest layer in this project yet, so treat this
  -- column as sensitive. school_email is both the SMTP auth username's
  -- domain-of-record and the visible "From" address unless overridden.
  school_email VARCHAR,
  email_from_name VARCHAR,
  smtp_host VARCHAR,
  smtp_port INT,
  smtp_user VARCHAR,
  smtp_pass VARCHAR,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  full_name VARCHAR,
  role VARCHAR CHECK (role IN ('agency_admin', 'agency_staff', 'client_admin', 'client_counsellor')),
  created_at TIMESTAMP DEFAULT now()
);

-- Deactivating a user (Settings > Users) blocks new logins without deleting
-- the row, since users are referenced by leads.assigned_counsellor_id,
-- ad_spend_weekly.entered_by, follow_ups.created_by, etc. and can't always
-- be safely hard-deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Per-institute configurable pipeline. Replaces what used to be a hardcoded
-- 8-stage enum — each client now owns its own ordered stage list, colors,
-- per-stage SLA (max_minutes), and a status_group used for the Kanban
-- Warm/Hot/Cold/Won grouping shown in Settings > Customize > Lead Stages.
-- is_cold_lane marks the one stage (if any) that behaves like the old
-- parallel "Cold" nurture lane — reachable from any stage, not part of the
-- main left-to-right sequence.
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  key VARCHAR NOT NULL,
  label VARCHAR NOT NULL,
  color VARCHAR NOT NULL DEFAULT '#60a5fa',
  status_group VARCHAR NOT NULL DEFAULT 'warm' CHECK (status_group IN ('warm', 'hot', 'cold', 'won')),
  max_minutes INT,
  is_cold_lane BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (client_id, key)
);

-- Generic per-institute option lists (Lead Source, Services, Company Type,
-- and any future simple "pick from a list" dropdown an institute wants to
-- manage) — one table keyed by list_key instead of a new table per list, so
-- adding another customizable list later doesn't need a migration.
CREATE TABLE IF NOT EXISTS client_option_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  list_key VARCHAR NOT NULL,
  value VARCHAR NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (client_id, list_key, value)
);

-- Institute-defined extra lead fields (Notes, Current School, Offer, etc. —
-- anything beyond the built-in leads columns). Values are stored in
-- leads.custom_fields keyed by field_key. options is only used when
-- field_type = 'dropdown'.
CREATE TABLE IF NOT EXISTS lead_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  field_key VARCHAR NOT NULL,
  label VARCHAR NOT NULL,
  field_type VARCHAR NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'dropdown', 'date', 'time', 'number')),
  options JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (client_id, field_key)
);

-- Per-institute label/visibility overrides for the built-in lead columns
-- (Location, Phone, Occupation, ...) — lets an institute rename or hide a
-- field that already has a dedicated leads column, without turning every
-- built-in field into a dynamic custom_fields entry.
CREATE TABLE IF NOT EXISTS client_field_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  field_key VARCHAR NOT NULL,
  label VARCHAR,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (client_id, field_key)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  platform VARCHAR CHECK (platform IN ('meta', 'google')),
  display_name VARCHAR NOT NULL,
  internal_name VARCHAR,
  ad_set_label VARCHAR,
  objective VARCHAR,
  creative_angle VARCHAR,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  -- Raw platform IDs from the Meta Lead Ads payload, used to auto-tag/
  -- auto-create campaign records as new campaign_id/adset_id/ad_id values
  -- show up in incoming webhook deliveries, without agency staff having to
  -- pre-register every campaign by hand.
  platform_campaign_id VARCHAR,
  platform_adset_id VARCHAR,
  platform_ad_id VARCHAR,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (client_id, platform, platform_campaign_id, platform_adset_id, platform_ad_id)
);

-- source distinguishes a counsellor's manual entry from a synced value
-- pulled from the platform's ad API — 'meta_api'/'google_api' rows are
-- overwritten on every sync (the real number always wins over a manual
-- guess), while 'manual' rows are only touched by a human.
CREATE TABLE IF NOT EXISTS ad_spend_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  week_starting DATE NOT NULL,
  spend_amount DECIMAL NOT NULL,
  source VARCHAR NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meta_api', 'google_api')),
  synced_at TIMESTAMP,
  entered_by UUID REFERENCES users(id),
  entered_at TIMESTAMP DEFAULT now(),
  UNIQUE(campaign_id, week_starting)
);

-- source is free-text: 'facebook' | 'instagram' | 'google' | 'website_contact_form'
-- | 'direct_walkin' | 'influencer_referral' | 'manual' | 'other'.
-- campaign_id is only populated for meta/google paid-ad leads; all other
-- sources (organic/inbound/manual) leave it null.
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  full_name VARCHAR NOT NULL,
  child_name VARCHAR,
  whatsapp_number VARCHAR NOT NULL,
  -- Stored/indexed copy of the last-10-digits normalization applied in
  -- lib/leadIntake.ts's normalizePhone(). Having Postgres compute and index
  -- this (rather than running regexp_replace(...) inline in the WHERE
  -- clause on every lookup) turns the dedup check into an index lookup
  -- instead of a full sequential scan, and the accompanying unique index
  -- below closes the check-then-insert race between concurrent webhook
  -- deliveries for the same phone number.
  normalized_phone VARCHAR GENERATED ALWAYS AS (right(regexp_replace(whatsapp_number, '\D', '', 'g'), 10)) STORED,
  second_phone VARCHAR,
  email VARCHAR,
  occupation VARCHAR,
  company_name VARCHAR,
  location VARCHAR,
  grade VARCHAR,
  service_interested_in VARCHAR,
  source VARCHAR NOT NULL DEFAULT 'other',
  timeline VARCHAR CHECK (timeline IN ('this_year', 'next_year', 'exploring')),
  decision_maker VARCHAR,
  competitors_visited VARCHAR,
  key_concern TEXT,
  entry_type VARCHAR,
  urgency_score INT DEFAULT 0,
  program_fit_score INT DEFAULT 0,
  engagement_score INT DEFAULT 0,
  lead_score INT GENERATED ALWAYS AS (urgency_score + program_fit_score + engagement_score) STORED,
  -- References pipeline_stages(client_id, key) below instead of a fixed
  -- CHECK list — each institute defines its own stages via Settings >
  -- Customize > Lead Stages. The stage marked is_cold_lane behaves like the
  -- old parallel "Cold" nurture lane: reachable from any stage, not a
  -- sequential step.
  pipeline_stage VARCHAR DEFAULT 'new_lead',
  -- Institute-defined extra fields (see lead_form_fields), keyed by field_key.
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_counsellor_id UUID REFERENCES users(id),
  -- Idempotency key for webhook-created leads, e.g. "meta:<leadgen_id>" or
  -- "aisensy:<wa_message_id>" — lets a retried webhook delivery no-op instead
  -- of creating a second lead. Null for manually-entered leads.
  external_ref VARCHAR UNIQUE,
  raw_payload JSONB,
  -- WhatsApp nurture drip: which day of the 0/2/4/7/10 sequence this lead is
  -- currently on. Null = sequence not started. Advances via the cron
  -- endpoint or a manual "Advance" click; paused stops auto-advancement
  -- without losing position (e.g. a counsellor has taken over the thread).
  nurture_day INT,
  nurture_paused BOOLEAN DEFAULT false,
  nurture_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  stage_updated_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY (client_id, pipeline_stage) REFERENCES pipeline_stages (client_id, key)
);

-- Normalized-phone lookup index powers the "same number = merge" dedup check
-- webhooks run before creating a new lead. UNIQUE (not just an index) so a
-- second concurrent insert for the same (client, phone) fails at the DB
-- level instead of silently creating a duplicate lead — leadIntake.ts
-- catches that 23505 and merges into the winning row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_client_normalized_phone ON leads (client_id, normalized_phone);

-- Hot-path filter/sort columns on the kanban board and counsellor views.
CREATE INDEX IF NOT EXISTS idx_leads_assigned_counsellor_id ON leads (assigned_counsellor_id);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads (client_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_stage_updated_at ON leads (stage_updated_at);

-- Calendar/scheduling events. event_type 'call_booked' powers the "Call Details"
-- section on the lead card; 'session_booked' is the school-visit equivalent.
-- For visits: 'completed' means the parent showed up (Attended in the UI),
-- 'no_show' means they didn't. outcome is only set once a visit completes.
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  event_type VARCHAR CHECK (event_type IN ('call_booked', 'session_booked')),
  event_date DATE,
  event_time TIME,
  meeting_link VARCHAR,
  status VARCHAR DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'no_show', 'rescheduled', 'cancelled')),
  outcome VARCHAR CHECK (outcome IN ('interested', 'needs_follow_up', 'declined')),
  notes TEXT,
  -- Idempotency guards so the reminder cron and the no-show auto-message
  -- never double-send if it runs more than once for the same event.
  reminder_48h_sent_at TIMESTAMP,
  reminder_24h_sent_at TIMESTAMP,
  noshow_reschedule_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  fee_amount DECIMAL NOT NULL,
  payment_date DATE NOT NULL,
  payment_status VARCHAR CHECK (payment_status IN ('deposit_paid', 'full_paid')),
  created_at TIMESTAMP DEFAULT now()
);

-- Counsellor's manual reminders, shown in the per-lead Follow Up tab and the
-- cross-lead Follow-ups worklist.
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  follow_up_date DATE NOT NULL,
  details TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

-- Per-lead activity timeline: system-generated (lead created, stage changed)
-- and manual entries from the Comment tab.
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  activity_type VARCHAR DEFAULT 'manual' CHECK (activity_type IN ('system', 'manual')),
  title VARCHAR NOT NULL,
  action_type VARCHAR,
  description TEXT,
  actor_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

-- One row per (lead, stage) Aisensy WhatsApp template send. R1/R2 are
-- auto-scheduled reminder timestamps if the parent hasn't replied.
CREATE TABLE IF NOT EXISTS lead_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  stage_key VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_at TIMESTAMP,
  r1_at TIMESTAMP,
  r2_at TIMESTAMP,
  message_ref VARCHAR,
  triggered_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(lead_id, stage_key)
);

-- Full WhatsApp conversation thread per lead — this is what lets a
-- counsellor read and reply without ever opening the Aisensy dashboard.
-- Inbound rows are written by the Aisensy inbound webhook; outbound rows are
-- written either by a counsellor's reply (message_type='session') or by a
-- template/sequence send (message_type='template'), each going through the
-- Aisensy send API.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  direction VARCHAR NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type VARCHAR NOT NULL DEFAULT 'session' CHECK (message_type IN ('template', 'session', 'system')),
  body TEXT NOT NULL,
  template_name VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'replied', 'failed')),
  -- Aisensy/WhatsApp message id, used to correlate delivery/read status
  -- webhooks back to the right row, and to de-duplicate retried webhook
  -- deliveries of the same inbound message.
  external_message_id VARCHAR UNIQUE,
  -- If this message contains a trackable link (e.g. a visit booking link),
  -- it's rewritten to point through /api/track/click/[id] and the click is
  -- recorded here the first time it's followed.
  link_url VARCHAR,
  link_clicked_at TIMESTAMP,
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead ON whatsapp_messages (lead_id, created_at);

-- Outbound email log — the email counterpart to whatsapp_messages. One row
-- per send attempt, whether triggered manually from the lead's Email tab
-- (with a preview/edit step first) or fired automatically alongside a
-- WhatsApp template send (visit reminders, post-visit summary).
-- template_key is null for free-form composed emails.
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  template_key VARCHAR,
  subject VARCHAR NOT NULL,
  body TEXT NOT NULL,
  to_email VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_lead ON email_messages (lead_id, created_at);

CREATE OR REPLACE FUNCTION set_stage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    NEW.stage_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_stage_updated_at ON leads;
CREATE TRIGGER trg_leads_stage_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_stage_updated_at();