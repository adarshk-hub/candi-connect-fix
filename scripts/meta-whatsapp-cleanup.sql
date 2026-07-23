-- ============================================================
-- Run this once every client has been fully cut over to direct Meta
-- Cloud API (no more AiSensy calls anywhere in the app — confirmed by
-- deleting lib/aisensy.ts and lib/aisensyTemplates.ts, and by every
-- WhatsApp send going through lib/metaWhatsapp.ts).
--
-- Safe to run any time after that: nothing reads aisensy_phone_number
-- from here on. AISENSY_API_KEY / AISENSY_SENDER /
-- AISENSY_SESSION_MESSAGE_URL env vars can also be removed from your
-- deployment once this has run.
-- ============================================================

ALTER TABLE clients DROP COLUMN IF EXISTS aisensy_phone_number;
