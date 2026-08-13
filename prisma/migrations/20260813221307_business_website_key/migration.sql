-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "website_key" TEXT;

-- Backfill: עסקים אתר-בלבד קיימים (יש website, אין place_id) מקבלים מפתח מנורמל —
-- אותו נרמול כמו websiteKeyOf: הסרת סכמה, חיתוך ב-'/', הסרת www, lowercase
UPDATE "businesses"
SET "website_key" = lower(regexp_replace(split_part(regexp_replace("website", '^https?://', ''), '/', 1), '^www\.', ''))
WHERE "website" IS NOT NULL AND "place_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_website_key_key" ON "businesses"("website_key");
