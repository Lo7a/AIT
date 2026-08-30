-- הלקוח הסמוי (משימה 10, הכרעת מייסד 30.8): פנייה אחת בערוץ אחד, סבב = run_id.
-- אדיטיבי: טבלה חדשה בלבד. ההרשאות ל-anon/authenticated לא ניתנות אוטומטית - ברירות
-- המחדל של הסכמה בוטלו במיגרציה 20260820160000_revoke_anon_grants.
CREATE TABLE IF NOT EXISTS "mystery_probes" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "diagnosis_id"    UUID NOT NULL,
  "run_id"          UUID NOT NULL,
  "channel"         TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'planned',
  "target"          TEXT,
  "probe_address"   TEXT,
  "sender_name"     TEXT,
  "message_body"    TEXT,
  "scheduled_for"   TIMESTAMP(3) NOT NULL,
  "sent_at"         TIMESTAMP(3),
  "answered_at"     TIMESTAMP(3),
  "closed_at"       TIMESTAMP(3),
  "reply_excerpt"   TEXT,
  "fail_reason"     TEXT,
  "reported_at"     TIMESTAMP(3),
  "disclosed_at"    TIMESTAMP(3),
  "consent_user_id" UUID NOT NULL,
  "consent_at"      TIMESTAMP(3) NOT NULL,
  "payload"         JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mystery_probes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mystery_probes_probe_address_key" ON "mystery_probes"("probe_address");
CREATE INDEX IF NOT EXISTS "mystery_probes_diagnosis_id_created_at_idx" ON "mystery_probes"("diagnosis_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "mystery_probes_status_scheduled_for_idx" ON "mystery_probes"("status", "scheduled_for");
CREATE INDEX IF NOT EXISTS "mystery_probes_run_id_idx" ON "mystery_probes"("run_id");

DO $$ BEGIN
  ALTER TABLE "mystery_probes" ADD CONSTRAINT "mystery_probes_diagnosis_id_fkey"
    FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
