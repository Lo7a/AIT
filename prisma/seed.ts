import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// verified_at קבוע — מתי נבדקו הטווחים מול השוק. מתעדכן ידנית בכל רענון מחירים
const VERIFIED = new Date("2026-08-13");

interface CatalogSeed {
  name: string;
  problem: string;
  solution: string;
  conditions: { gapKeys: string[] };
  costRange: string;
  savingRange: string;
  complexity: "low" | "medium" | "high";
  installTime: string;
  benchmarks?: { metric: string; range: string; source: string }[];
}

const CATALOG: CatalogSeed[] = [
  {
    name: "סוכן AI לטיפול בלידים",
    problem: "פניות נכנסות לא נענות מהר, לידים מתקררים והולכים למתחרים",
    solution: "סוכן AI בעברית שעונה לכל פנייה תוך שניות, מסנן, מתעד ומעביר לבן אדם רק כשצריך",
    conditions: { gapKeys: ["contact_form", "lead_handling"] },
    costRange: "₪1,000–2,500 לחודש",
    savingRange: "10–20 שעות עבודה בחודש",
    complexity: "medium",
    installTime: "שבוע–שבועיים",
    benchmarks: [{ metric: "עלות חודשית לסוכן AI בעברית", range: "₪1,000–2,500", source: "מחקר שוק AIT 08/2026" }],
  },
  {
    name: "בוט וואטסאפ לשירות לקוחות",
    problem: "שאלות חוזרות מעמיסות על הטלפון, ופניות מחוץ לשעות הפעילות אובדות",
    solution: "בוט וואטסאפ שעונה על השאלות הנפוצות 24/7 ומעביר שיחות מורכבות לצוות",
    conditions: { gapKeys: ["whatsapp", "chat_widget"] },
    costRange: "₪3,500–12,000 הקמה",
    savingRange: "5–15 שעות מענה בשבוע",
    complexity: "medium",
    installTime: "2–4 שבועות",
    benchmarks: [{ metric: "הקמת בוט וואטסאפ מלא", range: "₪3,500–12,000", source: "מחקר שוק AIT 08/2026" }],
  },
  {
    name: "קביעת תורים אונליין",
    problem: "כל תיאום תור דורש שיחת טלפון בשעות הפעילות — חיכוך ללקוח ועומס לצוות",
    solution: "יומן תורים אונליין (תשתית ייעודית) מוטמע באתר ובפרופיל גוגל",
    conditions: { gapKeys: ["online_booking"] },
    costRange: "₪100–400 לחודש",
    savingRange: "3–6 שעות תיאומים בשבוע",
    complexity: "low",
    installTime: "עד שבוע",
  },
  {
    name: "הקמת פרופיל Google Business",
    problem: "העסק לא מופיע במפות גוגל — לקוחות שמחפשים בסביבה לא מוצאים אותו",
    solution: "הקמה ומילוי מלא של פרופיל העסק: פרטים, תמונות, שעות, קטגוריות ופוסטים",
    conditions: { gapKeys: ["gbp_exists", "gbp_rating"] },
    costRange: "₪0–1,500 חד־פעמי",
    savingRange: "חשיפה מקומית שאובדת היום לגמרי",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "איסוף ביקורות אוטומטי",
    problem: "לקוחות מרוצים לא משאירים ביקורות, והפרופיל נראה דל מול מתחרים",
    solution: "שליחה אוטומטית של בקשת ביקורת (וואטסאפ/SMS) אחרי כל שירות",
    conditions: { gapKeys: ["has_reviews", "review_volume"] },
    costRange: "₪150–500 לחודש",
    savingRange: "צמיחה עקבית במאגר הביקורות",
    complexity: "low",
    installTime: "עד שבוע",
  },
  {
    name: "ניהול ומענה לביקורות",
    problem: "ביקורות שליליות עומדות בלי מענה ופוגעות באמון של לקוחות חדשים",
    solution: "ניטור ביקורות + טיוטות מענה מנומס בעברית לכל ביקורת, לאישור בעל העסק",
    conditions: { gapKeys: ["no_problem_themes"] },
    costRange: "₪300–800 לחודש",
    savingRange: "הגנה על המוניטין — הנכס שמביא לקוחות",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "שיפור מהירות האתר",
    problem: "האתר נטען לאט במובייל — גולשים נוטשים לפני שראו בכלל את התוכן",
    solution: "אופטימיזציית תמונות, קאשינג וסקריפטים; יעד: LCP מתחת ל-4 שניות",
    conditions: { gapKeys: ["perf", "lcp"] },
    costRange: "₪1,500–6,000 חד־פעמי",
    savingRange: "פחות נטישה בכניסה — כל התקציב השיווקי עובד יותר",
    complexity: "medium",
    installTime: "1–2 שבועות",
  },
  {
    name: "חיבור וואטסאפ לאתר",
    problem: "אין דרך מהירה לפנות לעסק — הערוץ שהלקוח הישראלי הכי מצפה לו חסר",
    solution: "כפתור וואטסאפ צף באתר + קישור ישיר בפרופיל גוגל",
    conditions: { gapKeys: ["whatsapp"] },
    costRange: "₪200–800 חד־פעמי",
    savingRange: "פניות שהיום פשוט לא נשלחות",
    complexity: "low",
    installTime: "יום",
  },
  {
    name: "התקנת מדידה (Analytics + פיקסל)",
    problem: "אין נתונים על מי מבקר באתר ומאיפה — החלטות שיווק מתקבלות באפלה",
    solution: "התקנת GA4 ופיקסל Meta + הגדרת אירועי המרה בסיסיים",
    conditions: { gapKeys: ["analytics", "fb_pixel"] },
    costRange: "₪800–2,500 חד־פעמי",
    savingRange: "יכולת רימרקטינג ומדידת החזר על פרסום",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "חיבור לידים ל-CRM והתראות",
    problem: "פניות מהאתר מגיעות למייל ונקברות שם — אין מעקב מי טופל ומי נפל",
    solution: "כל פנייה נרשמת אוטומטית ב-CRM עם התראה מיידית לוואטסאפ של המטפל",
    conditions: { gapKeys: ["contact_form", "lead_handling"] },
    costRange: "₪1,200–4,000 הקמה",
    savingRange: "אפס לידים שנופלים בין הכיסאות",
    complexity: "medium",
    installTime: "1–2 שבועות",
  },
];

async function main() {
  for (const item of CATALOG) {
    const { benchmarks, ...fields } = item;
    const row = await prisma.opportunityCatalog.upsert({
      where: { name: fields.name },
      update: { ...fields, conditions: fields.conditions },
      create: { ...fields, conditions: fields.conditions },
    });
    for (const b of benchmarks ?? []) {
      // אין unique טבעי לבנצ'מרק — מוחקים ויוצרים מחדש לאותו קטלוג כדי להישאר אידמפוטנטיים
      await prisma.benchmark.deleteMany({ where: { catalogId: row.id, metric: b.metric } });
      await prisma.benchmark.create({ data: { ...b, catalogId: row.id, verifiedAt: VERIFIED } });
    }
  }
  const count = await prisma.opportunityCatalog.count();
  console.log(`קטלוג: ${count} פריטים`);
}

main().finally(() => prisma.$disconnect());
