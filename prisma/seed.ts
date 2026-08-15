import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// verified_at קבוע - מתי נבדקו הטווחים מול השוק. מתעדכן ידנית בכל רענון מחירים.
// מקורות הטווחים: docs/research/2026-08-13-catalog-prices.md (10 סוכני מחקר + ביקורת אדוורסרית,
// 6 מקורות מרכזיים אומתו חיים). כלל מחייב מהמייסדים: תמיד טווחים, לעולם לא מחיר נקודתי.
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
    costRange: "הקמה ₪1,800-12,500 + ₪300-1,500 לחודש",
    savingRange: "5-10 שעות מענה בשבוע; מענה תוך דקות מכפיל את סיכויי ההמרה",
    complexity: "medium",
    installTime: "2-4 שבועות",
    benchmarks: [
      { metric: "הקמת סוכן AI בעברית (פרילנסר עד סוכנות)", range: "₪1,800-12,500", source: "lior-ai.com · doctorai.co.il · devshift.biz (08/2026)" },
      { metric: "תחזוקה חודשית לסוכן מותאם", range: "₪300-1,500 לחודש", source: "devshift.biz · doctorai.co.il (08/2026)" },
      { metric: "אפקט מהירות מענה על המרת לידים", range: "פי 21 בהכשרת ליד במענה תוך 5 דקות מול 30 דקות", source: "MIT/InsideSales דרך aimdoc.ai (08/2026)" },
    ],
  },
  {
    name: "בוט וואטסאפ לשירות לקוחות",
    problem: "שאלות חוזרות מעמיסות על הטלפון, ופניות מחוץ לשעות הפעילות אובדות",
    solution: "בוט וואטסאפ שעונה על השאלות הנפוצות 24/7 ומעביר שיחות מורכבות לצוות",
    conditions: { gapKeys: ["whatsapp", "chat_widget"] },
    costRange: "הקמה ₪2,500-12,000 + ₪100-900 לחודש",
    savingRange: "5-10 שעות מענה בשבוע; החזר השקעה תוך 1-2 חודשים בעסק עם 20+ פניות ביום",
    complexity: "medium",
    installTime: "1-6 שבועות לפי מורכבות",
    benchmarks: [
      { metric: "הקמת בוט וואטסאפ (FAQ עד פתרון מלא עם CRM)", range: "₪2,500-12,000", source: "achiya-automation.com (אומת חי) · liveweb.co.il (08/2026)" },
      { metric: "עלות חודשית (פלטפורמה/Meta API)", range: "₪100-900 לחודש", source: "achiya-automation.com · wati.io (08/2026)" },
    ],
  },
  {
    name: "קביעת תורים אונליין",
    problem: "כל תיאום תור דורש שיחת טלפון בשעות הפעילות - חיכוך ללקוח ועומס לצוות",
    solution: "יומן תורים אונליין (תשתית ייעודית) מוטמע באתר ובפרופיל גוגל",
    conditions: { gapKeys: ["online_booking"] },
    costRange: "₪100-500 לחודש",
    savingRange: "2-5 שעות תיאומים בשבוע; הפחתת אי-הגעות ב-30-50%",
    complexity: "low",
    installTime: "עד שבוע",
    benchmarks: [
      { metric: "מנוי חודשי למערכת תורים ישראלית (עסק בודד)", range: "₪100-300 לחודש", source: "clickynder.com (אומת חי) · plannie.co.il · mytor.co.il · yoman.co.il (08/2026)" },
      { metric: "הפחתת אי-הגעות עם תזכורות אוטומטיות", range: "30-50%", source: "booknetic.com + אימות צולב בחיפוש (08/2026)" },
    ],
  },
  {
    name: "הקמת פרופיל Google Business",
    problem: "העסק לא מופיע במפות גוגל - לקוחות שמחפשים בסביבה לא מוצאים אותו",
    solution: "הקמה ומילוי מלא של פרופיל העסק: פרטים, תמונות, שעות, קטגוריות ופוסטים",
    // gbp_rating הוסר (סקירת משימה 10): הוא נבדק רק כשכבר יש פרופיל - סתירה להמלצת "הקמת פרופיל"
    conditions: { gapKeys: ["gbp_exists"] },
    costRange: "₪400-2,000 חד-פעמי",
    savingRange: "4-8 שעות הקמה ואימות שנחסכות + חשיפה מקומית שאובדת היום לגמרי",
    complexity: "low",
    installTime: "1-4 שבועות (כולל אימות גוגל)",
    benchmarks: [
      { metric: "הקמת פרופיל Google Business", range: "₪400-800 פרילנסר · ₪1,000-2,000 סוכנות", source: "360i-marketing.co.il (₪450 + מע\"מ, אומת חי) · Merchynt/Dotit מומר לפי 3.4 (08/2026)" },
    ],
  },
  {
    name: "איסוף ביקורות אוטומטי",
    problem: "לקוחות מרוצים לא משאירים ביקורות, והפרופיל נראה דל מול מתחרים",
    solution: "שליחה אוטומטית של בקשת ביקורת (וואטסאפ/SMS) אחרי כל שירות",
    conditions: { gapKeys: ["has_reviews", "review_volume"] },
    costRange: "הקמה ₪350-3,500 + ₪150-900 לחודש",
    savingRange: "1-3 שעות בשבוע; הגדלת קצב איסוף הביקורות פי 2-4 (לפי ספקים)",
    complexity: "low",
    installTime: "עד שבוע",
    benchmarks: [
      { metric: "הקמת אוטומציית בקשת ביקורות", range: "₪350-3,500", source: "feedbot.co.il · achiya-automation.com · stsiconic.com (08/2026)" },
      { metric: "מנוי חודשי (SaaS עד שירות מנוהל)", range: "₪150-900 לחודש", source: "feedbot.co.il · nicejob.com · truereview.co (08/2026)" },
    ],
  },
  {
    name: "ניהול ומענה לביקורות",
    problem: "ביקורות שליליות עומדות בלי מענה ופוגעות באמון של לקוחות חדשים",
    solution: "ניטור ביקורות + טיוטות מענה מנומס בעברית לכל ביקורת, לאישור בעל העסק",
    conditions: { gapKeys: ["no_problem_themes"] },
    costRange: "₪300-800 לחודש",
    savingRange: "2-5 שעות ניטור וניסוח בחודש; הגנה על המוניטין - הנכס שמביא לקוחות",
    complexity: "low",
    installTime: "ימים בודדים",
    benchmarks: [
      { metric: "מענה לביקורות מנוהל (עד 30 תגובות בחודש)", range: "₪320-770 לחודש", source: "shivuknet.co.il (אומת חי, 08/2026)" },
    ],
  },
  {
    name: "שיפור מהירות האתר",
    problem: "האתר נטען לאט במובייל - גולשים נוטשים לפני שראו בכלל את התוכן",
    solution: "אופטימיזציית תמונות, קאשינג וסקריפטים; יעד: LCP מתחת ל-4 שניות",
    conditions: { gapKeys: ["perf", "lcp"] },
    costRange: "₪700-9,000 חד-פעמי לפי מורכבות האתר",
    savingRange: "אתר מהיר ממיר פי 2.5-3; כ-0.3 נקודת המרה על כל שנייה שנחסכת",
    complexity: "medium",
    installTime: "1-2 שבועות",
    benchmarks: [
      { metric: "האצת אתר תדמית (פרילנסר/סטודיו)", range: "₪700-2,500", source: "kingcode.co.il · maimonweb.com (08/2026)" },
      { metric: "האצת אתר מורכב/חנות (סוכנות)", range: "₪2,500-9,000", source: "digitizer.co.il (אומת חי) · maimonweb.com (08/2026)" },
      { metric: "אפקט מהירות על המרה", range: "פי 2.5-3 המרה באתר שנטען בשנייה מול 5 שניות", source: "portent.com - מחקר על 100M+ צפיות עמוד (08/2026)" },
    ],
  },
  {
    name: "חיבור וואטסאפ לאתר",
    problem: "אין דרך מהירה לפנות לעסק - הערוץ שהלקוח הישראלי הכי מצפה לו חסר",
    solution: "כפתור וואטסאפ צף באתר + קישור ישיר בפרופיל גוגל",
    conditions: { gapKeys: ["whatsapp"] },
    costRange: "₪300-800 חד-פעמי",
    savingRange: "1-2 שעות בשבוע ממעבר לצ'אט + פניות מובייל שהיום פשוט לא נשלחות",
    complexity: "low",
    installTime: "יום",
    benchmarks: [
      { metric: "התקנת כפתור וואטסאפ + עיצוב", range: "₪300-800 (נגזרת תעריפי עבודה קטנה: מינימום ₪300-550)", source: "vadim.co.il · yydevelopment.co.il · digita.co.il (08/2026)" },
    ],
  },
  {
    name: "התקנת מדידה (Analytics + פיקסל)",
    problem: "אין נתונים על מי מבקר באתר ומאיפה - החלטות שיווק מתקבלות באפלה",
    solution: "התקנת GA4 ופיקסל Meta + הגדרת אירועי המרה בסיסיים",
    conditions: { gapKeys: ["analytics", "fb_pixel"] },
    costRange: "₪800-3,500 חד-פעמי",
    savingRange: "מדידת החזר על פרסום ורימרקטינג; הערכה ענפית: מניעת בזבוז 10-30% מהתקציב",
    complexity: "low",
    installTime: "ימים בודדים",
    benchmarks: [
      { metric: "התקנת GA4 + פיקסל + אירועי המרה", range: "₪800-3,500 (נגזרת שעות: ₪250-600 לשעה × 3-8 שעות; אין מחיר מדף מפורסם בישראל)", source: "ppc-israel.co.il · thelist.co.il · digita.co.il (08/2026)" },
    ],
  },
  {
    name: "חיבור לידים ל-CRM והתראות",
    problem: "פניות מהאתר מגיעות למייל ונקברות שם - אין מעקב מי טופל ומי נפל",
    solution: "כל פנייה נרשמת אוטומטית ב-CRM עם התראה מיידית לוואטסאפ של המטפל",
    // email_link נוסף (סקירת משימה 10): מבדיל את הפריט מסוכן ה-AI (פריט 1) שחולק איתו את שני המפתחות האחרים
    conditions: { gapKeys: ["contact_form", "lead_handling", "email_link"] },
    costRange: "הקמה ₪1,500-8,000 + ₪100-500 לחודש פלטפורמות",
    savingRange: "3-8 שעות הזנה ומעקב בשבוע; אפס לידים שנופלים בין הכיסאות",
    complexity: "medium",
    installTime: "1-2 שבועות",
    benchmarks: [
      { metric: "חיבור טפסים/לידים ל-CRM + התראות וואטסאפ", range: "₪1,500-8,000 הקמה", source: "bizrunner.co.il · achiya-automation.com (08/2026)" },
      { metric: "מנויי פלטפורמה שוטפים (Make/Zapier/WhatsApp API)", range: "₪100-500 לחודש", source: "bizrunner.co.il · achiya-automation.com (08/2026)" },
    ],
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
    // רענון מחירים משנה גם שמות metric - מוחקים את כל הבנצ'מרקים של הפריט ויוצרים מחדש,
    // אחרת שורות בשם ישן היו נשארות לצד החדשות (אידמפוטנטי לכל ריצה)
    await prisma.benchmark.deleteMany({ where: { catalogId: row.id } });
    for (const b of benchmarks ?? []) {
      await prisma.benchmark.create({ data: { ...b, catalogId: row.id, verifiedAt: VERIFIED } });
    }
  }
  const count = await prisma.opportunityCatalog.count();
  const benchCount = await prisma.benchmark.count();
  console.log(`קטלוג: ${count} פריטים · ${benchCount} בנצ'מרקים`);
}

main().finally(() => prisma.$disconnect());
