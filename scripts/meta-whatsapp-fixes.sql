-- ============================================================
-- Fixes on top of scripts/meta-whatsapp-migration.sql
-- Run this once, after that migration, before deploying the updated
-- lib/waSequenceEngine.ts.
--
-- 1. Double-send bug fix: advanceDueMessages() used to run a lone
--    `SELECT ... FOR UPDATE SKIP LOCKED` through the connection pool with
--    no explicit transaction. Because each pool.query() call auto-commits
--    on its own, the row lock was released the instant that SELECT
--    finished — before the message was actually sent and marked 'sent'.
--    Two overlapping cron invocations could both select and both send the
--    same due message.
--
--    Fixed by claiming rows with a single atomic
--    `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`
--    statement, which needs an extra 'processing' status as a transient
--    state between 'pending' and 'sent'/'failed'.
--
-- 2. Per-client WhatsApp template code, used to namespace template names
--    as {CODE}_day0_welcome etc. so two clients never collide on the same
--    Meta template name.
-- ============================================================

ALTER TABLE wa_sequence_messages DROP CONSTRAINT IF EXISTS wa_sequence_messages_status_check;
ALTER TABLE wa_sequence_messages ADD CONSTRAINT wa_sequence_messages_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

-- 6-char code used to prefix this client's WhatsApp template names
-- (e.g. "ACADMY" -> ACADMY_day0_welcome). Auto-filled from the client's
-- name on first save if left blank; editable in Settings > WhatsApp.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS wa_template_code VARCHAR(10);

-- Lets POST /api/clients/[id]/whatsapp-templates/seed-defaults use
-- ON CONFLICT DO NOTHING to stay idempotent on re-run (e.g. re-seeding
-- after editing a template body) instead of piling up duplicate rows.
ALTER TABLE wa_templates DROP CONSTRAINT IF EXISTS wa_templates_client_name_unique;
ALTER TABLE wa_templates ADD CONSTRAINT wa_templates_client_name_unique UNIQUE (client_id, name);
