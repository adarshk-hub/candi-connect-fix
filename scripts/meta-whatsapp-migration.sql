-- ============================================================
-- Meta WhatsApp Cloud API migration
-- Run this AFTER scripts/schema.sql, once, before deploying the
-- lib/metaWhatsapp.ts / app/api/webhooks/meta-whatsapp code.
--
-- This migration is additive and non-destructive: it does not drop
-- whatsapp_messages, lead_actions, or the aisensy_phone_number column,
-- so the existing Aisensy path keeps working until you're ready to cut
-- traffic over. Once the Meta integration is verified in production,
-- run scripts/meta-whatsapp-cleanup.sql (not included here) to drop the
-- Aisensy-only columns/tables if you want them gone.
-- ============================================================

-- Per-client WhatsApp Cloud API credentials. One row per client, one
-- WABA/phone-number per client (multi-tenant BYO number model).
CREATE TABLE IF NOT EXISTS wa_client_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID UNIQUE NOT NULL REFERENCES clients(id),
  phone_number_id VARCHAR NOT NULL,
  waba_id VARCHAR NOT NULL,
  -- AES-256-CBC encrypted via lib/waEncryption.ts — never store plaintext.
  access_token TEXT NOT NULL,
  display_phone_number VARCHAR,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Per-client template registry — tracks Meta's approval status for each
-- submitted template so /templates/:client_id can show pending/approved/
-- rejected without re-polling Meta on every page load.
CREATE TABLE IF NOT EXISTS wa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  meta_template_id VARCHAR,
  name VARCHAR NOT NULL,
  category VARCHAR,
  language VARCHAR DEFAULT 'en',
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  components JSONB,
  submitted_at TIMESTAMP DEFAULT now(),
  approved_at TIMESTAMP
);

-- Per-client day -> template mapping for the nurture drip. Replaces the
-- hardcoded NURTURE_STEPS array in lib/nurtureSteps.ts with a DB-driven
-- version so each client can use their own approved template names.
CREATE TABLE IF NOT EXISTS wa_sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  day_number INT NOT NULL,
  template_name VARCHAR NOT NULL,
  language_code VARCHAR DEFAULT 'en',
  UNIQUE(client_id, day_number)
);

-- One active/paused/completed/cancelled sequence per lead. Replaces
-- leads.nurture_day / nurture_started_at / nurture_paused as the source
-- of truth for sequence state (those columns are left in place for
-- backward read compatibility but are no longer written to by the new
-- code path).
CREATE TABLE IF NOT EXISTS wa_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  phone_number VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  paused_note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_sequences_lead ON wa_sequences (lead_id);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS wa_sequence_id UUID REFERENCES wa_sequences(id);

-- Individual scheduled sends within a sequence (Day 0/2/4/7/10). The
-- cron job in app/api/cron/wa-sequence-advance polls this table for
-- rows that are due, rather than recomputing "days since start" on the
-- fly the way the old nurture_started_at model did.
CREATE TABLE IF NOT EXISTS wa_sequence_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES wa_sequences(id),
  day_number INT NOT NULL,
  template_name VARCHAR NOT NULL,
  language_code VARCHAR DEFAULT 'en',
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  wamid VARCHAR,
  sent_at TIMESTAMP,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_wa_sequence_messages_due
  ON wa_sequence_messages (status, scheduled_for);

-- Extend the EXISTING whatsapp_messages table rather than introducing a
-- parallel wa_conversations table — this keeps WhatsAppTab.tsx and the
-- GET /api/leads/[id]/whatsapp/messages route working unchanged, while
-- adding the fields the Meta webhook payload gives us that Aisensy's
-- placeholder payload didn't.
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS wamid VARCHAR;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES wa_sequences(id);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sequence_day INT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid ON whatsapp_messages (wamid);

-- Routing column so the Meta webhook (single shared endpoint for all
-- clients) can map an inbound message's phone_number_id back to a client,
-- the same way clients.aisensy_phone_number does for Aisensy today.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_whatsapp_phone_number_id VARCHAR UNIQUE;
