import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ניקוי סלקטיבי של נתוני בדיקה (חוסם פריסה מתועד: התחלה נקייה לפני עלייה לאוויר).
// כלל ברזל: opportunity_catalog ו-benchmarks לא נמחקים לעולם - אין להם שום נתיב מחיקה בקובץ הזה,
// הם נקראים כאן אך ורק לספירת אימות (לפני/אחרי) שמוודאת שלא נפגעו.
// ברירת המחדל היא הרצת בדיקה (dry-run) שמדפיסה ספירות בלבד. מחיקה אמיתית רק עם הדגל --confirm.

type Db = Prisma.TransactionClient;

// סדר מחיקה בטוח מול מפתחות זרים (ילדים לפני הורים), נגזר מ-prisma/schema.prisma:
// briefs -> roadmap_items -> roadmaps -> business_models -> interview_messages -> scans -> diagnoses -> businesses
// roadmap_items מפנה גם ל-opportunity_catalog - מחיקת השורות מסירה את ההפניה בלבד, הקטלוג לא נגוע.
const WIPE_STEPS: {
  table: string;
  count: (db: Db) => Promise<number>;
  wipe: (db: Db) => Promise<{ count: number }>;
}[] = [
  { table: "briefs", count: (db) => db.brief.count(), wipe: (db) => db.brief.deleteMany() },
  { table: "roadmap_items", count: (db) => db.roadmapItem.count(), wipe: (db) => db.roadmapItem.deleteMany() },
  { table: "roadmaps", count: (db) => db.roadmap.count(), wipe: (db) => db.roadmap.deleteMany() },
  { table: "business_models", count: (db) => db.businessModelRow.count(), wipe: (db) => db.businessModelRow.deleteMany() },
  { table: "interview_messages", count: (db) => db.interviewMessage.count(), wipe: (db) => db.interviewMessage.deleteMany() },
  { table: "scans", count: (db) => db.scan.count(), wipe: (db) => db.scan.deleteMany() },
  { table: "diagnoses", count: (db) => db.diagnosis.count(), wipe: (db) => db.diagnosis.deleteMany() },
  { table: "businesses", count: (db) => db.business.count(), wipe: (db) => db.business.deleteMany() },
];

// ספירת הטבלאות המוגנות - קריאה בלבד, לצורך אימות אי-פגיעה
async function preservedCounts(db: Db) {
  return {
    catalog: await db.opportunityCatalog.count(),
    benchmarks: await db.benchmark.count(),
  };
}

async function printCounts(db: Db): Promise<number> {
  let total = 0;
  for (const step of WIPE_STEPS) {
    const n = await step.count(db);
    total += n;
    console.log(`  ${step.table}: ${n}`);
  }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--confirm");
  if (unknown.length > 0) {
    console.error(`ארגומנט לא מוכר: ${unknown.join(" ")}`);
    console.error('שימוש: npm run db:cleanup (הרצת בדיקה בלבד) או npm run db:cleanup -- --confirm (מחיקה אמיתית; ב-PowerShell לצטט: "--")');
    process.exitCode = 1;
    return;
  }
  const confirm = args.includes("--confirm");

  const before = await preservedCounts(prisma);

  if (!confirm) {
    console.log("מצב: הרצת בדיקה (dry-run) - שום דבר לא נמחק");
    console.log("שורות שיימחקו בהרצה עם --confirm:");
    const total = await printCounts(prisma);
    console.log(`סך הכל: ${total} שורות`);
    console.log(`נשמרים ולא נמחקים לעולם: opportunity_catalog (${before.catalog}) ו-benchmarks (${before.benchmarks})`);
    // ב-PowerShell התו -- נבלע על ידי המעטפת, לכן צריך לצטט אותו; בלעדיו הדגל לא מגיע לסקריפט
    // והריצה נשארת הרצת בדיקה (כיוון כשל בטוח - לעולם לא מחיקה בטעות)
    console.log('למחיקה אמיתית: npm run db:cleanup -- --confirm (ב-PowerShell לצטט את המקפים: npm run db:cleanup "--" --confirm)');
    return;
  }

  console.log("מצב: מחיקה אמיתית (--confirm)");
  console.log("ספירות לפני מחיקה:");
  const totalBefore = await printCounts(prisma);
  console.log(`סך הכל למחיקה: ${totalBefore} שורות`);
  console.log(`מוגנים - קטלוג: ${before.catalog} · בנצ'מרקים: ${before.benchmarks}`);

  await prisma.$transaction(
    async (tx) => {
      for (const step of WIPE_STEPS) {
        const res = await step.wipe(tx);
        console.log(`  נמחקו ${res.count} שורות מ-${step.table}`);
      }
      // אימות בתוך הטרנזקציה: אם ספירת הקטלוג או הבנצ'מרקים זזה - חריגה מיידית,
      // הטרנזקציה מתגלגלת אחורה וכל המחיקה מתבטלת
      const during = await preservedCounts(tx);
      if (during.catalog !== before.catalog || during.benchmarks !== before.benchmarks) {
        throw new Error(
          `עצירה: ספירת הטבלאות המוגנות השתנתה בזמן הריצה (קטלוג ${before.catalog} -> ${during.catalog}, בנצ'מרקים ${before.benchmarks} -> ${during.benchmarks}) - כל המחיקה בוטלה (rollback)`,
        );
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  console.log("ספירות אחרי מחיקה:");
  const totalAfter = await printCounts(prisma);
  console.log(`סך הכל שנותר בטבלאות נתוני הבדיקה: ${totalAfter}`);

  const after = await preservedCounts(prisma);
  if (after.catalog !== before.catalog || after.benchmarks !== before.benchmarks) {
    console.error(
      `אזהרה חמורה: ספירת הטבלאות המוגנות השתנתה אחרי הריצה (קטלוג ${before.catalog} -> ${after.catalog}, בנצ'מרקים ${before.benchmarks} -> ${after.benchmarks}) - לבדוק מיד מול המייסד`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`אימות: opportunity_catalog ו-benchmarks ללא שינוי (${after.catalog} פריטי קטלוג, ${after.benchmarks} בנצ'מרקים)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
