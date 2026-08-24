-- הקשר בין לוח המצב ללוח המשימות (משימה 11, הכרעת מייסד 24.8): שורת הסוכן מצביעה
-- על המשימה שבעבודה במפתח זר אמיתי, לא בטקסט חופשי. אדיטיבי; SET NULL כדי שמחיקת
-- משימה לא תיגע בשורת המצב.
ALTER TABLE "agent_status" ADD COLUMN IF NOT EXISTS "task_num" INTEGER;
DO $$ BEGIN
  ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_task_num_fkey"
    FOREIGN KEY ("task_num") REFERENCES "tasks"("num") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
