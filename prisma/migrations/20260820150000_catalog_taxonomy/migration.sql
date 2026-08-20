-- טקסונומיה לספרייה + ארכוב (20.8). אדיטיבי בלבד: שלוש עמודות NULL-able, בלי ברירת
-- מחדל ובלי מגע בנתונים קיימים - כל 18 הפריטים שורדים בדיוק כפי שהם.
ALTER TABLE "opportunity_catalog" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "opportunity_catalog" ADD COLUMN IF NOT EXISTS "phase" TEXT;
ALTER TABLE "opportunity_catalog" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- הספרייה נסרקת לפי סוג שירות ולפי "מה פעיל", ושתי אלה הן השאילתות של מסך הניהול
CREATE INDEX IF NOT EXISTS "opportunity_catalog_service_type_idx" ON "opportunity_catalog"("service_type");
CREATE INDEX IF NOT EXISTS "opportunity_catalog_archived_at_idx" ON "opportunity_catalog"("archived_at");
