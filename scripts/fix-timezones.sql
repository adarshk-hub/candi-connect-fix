-- Converts every TIMESTAMP (timezone-naive) column to TIMESTAMPTZ.
-- Run once in Supabase SQL Editor. Safe to re-run — ALTER COLUMN TYPE
-- is a no-op if the column is already TIMESTAMPTZ.
-- Existing values are assumed to be UTC wall-clock (since Postgres now()
-- defaults to UTC) and are reinterpreted as such, not shifted.

ALTER TABLE clients ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE pipeline_stages ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE client_option_items ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE lead_form_fields ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE client_field_settings ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE campaigns ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE ad_spend_weekly
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at AT TIME ZONE 'UTC',
  ALTER COLUMN entered_at TYPE TIMESTAMPTZ USING entered_at AT TIME ZONE 'UTC';

ALTER TABLE leads
  ALTER COLUMN nurture_started_at TYPE TIMESTAMPTZ USING nurture_started_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN stage_updated_at TYPE TIMESTAMPTZ USING stage_updated_at AT TIME ZONE 'UTC';

ALTER TABLE events
  ALTER COLUMN reminder_48h_sent_at TYPE TIMESTAMPTZ USING reminder_48h_sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN reminder_24h_sent_at TYPE TIMESTAMPTZ USING reminder_24h_sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN noshow_reschedule_sent_at TYPE TIMESTAMPTZ USING noshow_reschedule_sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE enrollments ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE follow_ups ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE activity_log ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE lead_actions
  ALTER COLUMN sent_at TYPE TIMESTAMPTZ USING sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN r1_at TYPE TIMESTAMPTZ USING r1_at AT TIME ZONE 'UTC',
  ALTER COLUMN r2_at TYPE TIMESTAMPTZ USING r2_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE whatsapp_messages
  ALTER COLUMN link_clicked_at TYPE TIMESTAMPTZ USING link_clicked_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE email_messages ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';