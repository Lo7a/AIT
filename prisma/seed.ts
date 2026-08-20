import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// verified_at קבוע - מתי נבדקו הטווחים מול השוק. מתעדכן ידנית בכל רענון מחירים.
// מקורות הטווחים: docs/research/2026-08-13-catalog-prices.md (10 סוכני מחקר + ביקורת אדוורסרית,
// 6 מקורות מרכזיים אומתו חיים). כלל מחייב מהמייסדים: תמיד טווחים, לעולם לא מחיר נקודתי.
// שער ההמרה של AIT: **3.0 שקל לדולר, קבוע** (הכרעת מייסד 20.8.2026). זו החלטה מוצרית
// מכוונת ולא שער שוק: מחירים לא מרצדים לפי מטבע חוץ. עד 20.8 היה כאן שער מונח של 3.4,
// שהתיישן והציג כל מחיר מומר כגבוה מדי (השער היציג של בנק ישראל ב-19.8.2026 היה 2.985).
// סיכון מוכר: אם הדולר יעלה מהותית, שער קבוע של 3.0 יציג מחירים נמוכים מדי - וזה הכיוון
// המסוכן. בדיקת שפיות תקופתית מול boi.org.il/PublicApi/GetExchangeRates (עובד; עמודי האתר חסומים)
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
  // verifiedAt פר-בנצ'מרק: פריטים שנחקרו בסבב מאוחר לא "יורשים" את תאריך האימות הגלובלי הישן
  benchmarks?: { metric: string; range: string; source: string; verifiedAt?: Date }[];
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
    costRange: "₪400-1,800 חד-פעמי",
    savingRange: "4-8 שעות הקמה ואימות שנחסכות + חשיפה מקומית שאובדת היום לגמרי",
    complexity: "low",
    installTime: "1-4 שבועות (כולל אימות גוגל)",
    benchmarks: [
      { metric: "הקמת פרופיל Google Business", range: "₪400-800 פרילנסר · ₪900-1,800 סוכנות", source: "360i-marketing.co.il (₪450 + מע\"מ, אומת חי) · Merchynt/Dotit ($300-600) מומר לפי שער AIT הקבוע 3.0 (08/2026)" },
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
  {
    // אושר על ידי המייסדים 16.8 על בסיס docs/research/a11y-pricing-2026-08.md (כל מספר ממוקור שם).
    // המספר 50,000 אומת 16.8 מול נוסח ממשלתי של החוק (PDF משרד החינוך): סעיף 19נא(ב) קיים
    // כלשונו ("פיצויים בסכום שלא יעלה על... בלא הוכחת נזק"); ספרות הסכום בחילוץ מעוותות
    // בקידוד הגופן אך המבנה תואם וכל המקורות המשניים פה-אחד על הסכום
    name: "הנגשת אתר + הצהרת נגישות",
    problem: "האתר לא עומד בתקן הנגישות הישראלי ואין בו הצהרת נגישות - חשיפה לתביעה, ולקוחות שלא מצליחים להשתמש באתר",
    solution: "תוסף נגישות + הצהרת נגישות משפטית מותאמת, ובאתרים שדורשים זאת גם תיקוני קוד ידניים לתקן 5568 ברמת AA",
    conditions: { gapKeys: ["a11y_statement", "site_a11y"] },
    costRange: "תוסף + הצהרה ₪300-1,200 לשנה · הנגשה מלאה לפי התקן ₪1,500-10,000 חד-פעמי",
    savingRange: "הסרת חשיפה לפיצוי של עד ₪50,000 ללא הוכחת נזק בכל תביעה + אתר שכל לקוח יכול להשתמש בו",
    complexity: "medium",
    installTime: "תוסף והצהרה: ימים בודדים · הנגשה מלאה: 1-2 שבועות לאתר קטן, 3-6 שבועות לחנות",
    benchmarks: [
      { metric: "רישיון תוסף נגישות שנתי (ספק ישראלי, אתר עסק קטן)", range: "₪299-1,200 לשנה (לפני מע\"מ)", source: "enable.co.il ₪299 · vee.co.il ₪500-1,200 · accessible.org.il ₪480 (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "מנוי תוסף נגישות חודשי (ישראל)", range: "₪49-250 לחודש", source: "tabnav.com מ-₪60 · accessible.org.il ₪60-79 (סתירה בין עמודי הספק) · digitouch.co.il מ-₪250 · ziko.co.il ₪49-169 (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "וידג'ט בינלאומי - מחיר מדף", range: "$490-3,990 לשנה (accessiBe) · UserWay מ-$49 לחודש", source: "accessibe.com/pricing · userway.org (08/2026) - לא הומר לשקלים", verifiedAt: new Date("2026-08-16") },
      { metric: "הקמה + ניסוח הצהרת נגישות משפטית", range: "₪450-1,000 חד-פעמי", source: "accessible.org.il ₪450 (הקמה + נוסח + הצהרה) · nagishbareshet.co.il ₪1,000 (הטמעת תיקון 13) - שני מחירי מדף בלבד (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "הנגשה מלאה לתקן 5568 AA - אתר תדמית 5-15 עמודים", range: "₪1,500-10,000 חד-פעמי", source: "sgo.co.il ₪1,500-4,000 (עד 10 עמודים) / ₪4,000-10,000 (בינוני) · accessible.org.il ₪3,500-8,600 · tabnav.com ₪800-2,000 לתבנית (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "זמן ביצוע הנגשה מלאה", range: "1-2 שבועות לאתר קטן · 3-6 שבועות לחנות אונליין", source: "sgo.co.il (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "דוח או ביקורת נגישות תקופתית", range: "₪299-3,000", source: "nagishbareshet.co.il ₪299 דוח חד-פעמי · ziko.co.il ₪1,000-3,000 ביקורת שנתית (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "חשיפה משפטית - פיצוי ללא הוכחת נזק", range: "עד ₪50,000 לתביעה", source: "סעיף 19נא(ב) לחוק שוויון זכויות לאנשים עם מוגבלות - אומת מול נוסח ממשלתי (meyda.education.gov.il) + isoc.org.il · din.co.il (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "סף פטור מחובת הנגשה לפי מחזור", range: "אתר קיים: עד ₪1,000,000 · אתר שהוקם מ-27.10.2017: עד ₪100,000", source: "isoc.org.il (איגוד האינטרנט הישראלי) · aisrael.org (08/2026)", verifiedAt: new Date("2026-08-16") },
    ],
  },
  {
    // אושר על ידי המייסד 16.8 (סבב ה-AI) על בסיס docs/research/ai-agents-pricing-2026-08.md.
    // מחירון KIVOICE אומת חי פעמיים (סוכן המחקר + אימות עצמאי של הבקר). נתוני השיחות האבודות
    // אמריקאיים - מסומנים ככאלה בכל טקסט מוצג, אין נתון ישראלי מקביל.
    name: "סוכן AI קולי למענה טלפוני",
    problem: "שיחות בשעות עומס או אחרי שעות הפעילות לא נענות - הלקוח לא משאיר הודעה, הוא מתקשר למתחרה",
    solution: "סוכן קולי AI בעברית שעונה לכל שיחה, מתעד את הפנייה, קובע תור ומעביר לבן אדם כשצריך",
    conditions: { gapKeys: ["lead_handling"] },
    costRange: "הקמה ₪0-3,500 + ₪500-2,500 לחודש לפי חבילת דקות",
    savingRange: "בארה\"ב 62% מהשיחות לעסקים קטנים לא נענות על ידי אדם, ו-85% ממי שלא נענה לא מתקשר שוב",
    complexity: "medium",
    installTime: "2-4 שבועות",
    benchmarks: [
      { metric: "מנוי חודשי לסוכן קולי AI בעברית (חבילת דקות לעסק קטן)", range: "₪500-2,500 לחודש (לפני מע\"מ)", source: "kinetiq.co.il ₪499-1,749 (אומת חי) · stsiconic.com ₪1,000-2,500 · bot-10.com מ-₪650 (משני) (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "הקמת סוכן קולי", range: "₪0-3,500", source: "kinetiq.co.il הטמעה ללא עלות · stsiconic.com ₪1,500 · achiya-automation.com מ-₪3,500 (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "שיחות אבודות בעסקים קטנים (ארה\"ב)", range: "62% לא נענות על ידי אדם; 85% מהלא-נענים לא מתקשרים שוב", source: "411 Locals (מחקר 85 עסקים, 58 ענפים) · PATLive/Forbes - אין נתון ישראלי (08/2026)", verifiedAt: new Date("2026-08-16") },
    ],
  },
  {
    // אושר על ידי המייסד 16.8 (סבב ה-AI), docs/research/ai-agents-pricing-2026-08.md. העוגן
    // החזק הוא החלופה האנושית הישראלית (מחירוני ניהול סושיאל חיים); נתוני שעות הבעלים אמריקאיים
    // ומסומנים. פריט מונע-ראיון - הסורק לא בודק פעילות ברשתות.
    name: "סוכן AI לתוכן ורשתות חברתיות",
    problem: "הנוכחות ברשתות גוזלת שעות כל שבוע או לא קורית בכלל - והעסק נעלם מהפיד של הלקוחות",
    solution: "סוכן AI שמייצר טיוטות פוסטים בקול של העסק, מתזמן פרסום ומשאיר לבעל העסק רק אישור",
    conditions: { gapKeys: ["manual_tasks"] },
    costRange: "כלי בניהול עצמי ₪45-90 לחודש · סוכן מותאם: הקמה ₪3,500-12,500 + ₪100-800 לחודש",
    savingRange: "3-10 שעות עבודת תוכן בשבוע (סקרים בארה\"ב) או מיקור חוץ שעולה ₪1,500-4,000 לחודש",
    complexity: "medium",
    installTime: "כלי מדף: ימים בודדים · סוכן מותאם: 2-4 שבועות",
    benchmarks: [
      { metric: "כלי AI לתוכן סושיאל (SaaS, ניהול עצמי)", range: "₪45-90 לחודש (הומר מ-$15-30 לפי שער AIT הקבוע 3.0)", source: "Ocoya מ-$15 · Predis.ai מ-$29 · ChatGPT Team $30 למשתמש - דרך bestai.co.il ומדריכי השוואה (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "סוכן תוכן מותאם בעברית (הקמה + חודשי)", range: "₪3,500-12,500 הקמה + ₪100-800 לחודש", source: "achiya-automation.com ₪3,500-6,500 · doctorai.co.il ₪4,500-12,500 + ₪200-500 (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "ניהול סושיאל אנושי בישראל (החלופה)", range: "₪1,500-4,000 לחודש לעסק קטן", source: "ckdigital360.co.il (אומת חי) · miktzoan.co.il · natanelimelech.co.il (08/2026)", verifiedAt: new Date("2026-08-16") },
    ],
  },
  {
    // אושר על ידי המייסד 16.8 (סבב ה-AI) בגרסה ללא REV (הכרעת מייסד: העוגן הייעודי היחיד היה
    // מחיר מבצע של ספק יחיד - הושמט). ה-solution מנוסח בכנות "סיוע AI בניסוח" - רכיב ה-AI בשוק
    // הישראלי דק (docs/research/ai-agents-pricing-2026-08.md, סעיף 3). פריט מונע-ראיון.
    name: "סוכן AI להצעות מחיר",
    problem: "כל הצעת מחיר נכתבת ידנית מאפס - עוברים ימים עד שהיא נשלחת, והלקוח סוגר עם מי שהגיב ראשון",
    solution: "הפקה אוטומטית של הצעות מחיר ממותגות מתבניות, עם מעקב סטטוס וסיוע AI בניסוח",
    conditions: { gapKeys: ["manual_tasks"] },
    costRange: "מודול בתוכנת ניהול ₪29-155 לחודש · תוכנה ייעודית עם AI ₪57-147 למשתמש לחודש",
    savingRange: "35-50% מהעסקאות נסגרות אצל מי שמגיב ראשון (InsideSales) - הצעה שיוצאת באותו יום במקום אחרי שבוע",
    complexity: "low",
    installTime: "כלי מדף: יום · מערכת ייעודית: עד שבועיים",
    benchmarks: [
      { metric: "מודול הצעות מחיר בתוכנת ניהול ישראלית", range: "₪29-155 לחודש (לפני מע\"מ)", source: "greeninvoice.co.il (morning, אומת חי - הצעות מחיר בכל המסלולים) (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "תוכנת הצעות בינלאומית עם AI", range: "$19-49 למשתמש לחודש (כ-₪57-147 לפי שער AIT הקבוע 3.0)", source: "PandaDoc דרך proposify.com · g2.com (08/2026)", verifiedAt: new Date("2026-08-16") },
      { metric: "אפקט מהירות תגובה על סגירה", range: "35-50% מהעסקאות למגיב הראשון", source: "InsideSales.com דרך expertise.ai (הגרסה הממוקורת; הנתון הוויראלי 78% נפסל שם כחסר מקור) (08/2026)", verifiedAt: new Date("2026-08-16") },
    ],
  },
  {
    // אושר על ידי המייסד 17.8 (סבב אתרים ומערכות, docs/research/website-and-systems-pricing-2026-08.md;
    // הממצא: מסעדה בלי אתר קיבלה Roadmap ריק). הכרעת מייסד על הניסוח: מסלול הוורדפרס מוצג
    // כשירות שאנחנו מביאים, לא "פרילנסר חיצוני" - הטווח עצמו הוא מחיר שוק ישראלי מחומש מקורות.
    // בוני ה-AI הושמטו מה-solution בכוונה עד אימות תמיכת עברית (הכרעת מחקר). נתון Deloitte
    // הושמט (שלושה סייגים - ראו סעיף "מה דק" במסמך). פריט מונע-סריקה: שני המפתחות known תמיד.
    name: "הקמת אתר ראשון לעסק",
    problem: "לעסק אין אתר משלו - מי שמחפש מוצא לכל היותר עמוד ברשת חברתית, ואין דף שהעסק שולט בו, מציג בו מחירים וסוגר ממנו לידים",
    solution: "הקמת אתר תדמית בעברית: בונה אתרים בניהול עצמי לתקציב קטן, או הקמת אתר וורדפרס מלאה דרכנו - מהעיצוב ועד העלייה לאוויר",
    conditions: { gapKeys: ["has_website", "own_website"] },
    costRange: "בונה אתרים כ-₪51-117 לחודש · הקמת וורדפרס דרכנו ₪1,500-8,000 חד-פעמי + דומיין ואחסון ₪450-1,350 לשנה",
    savingRange: "נוכחות שהעסק שולט בה: דף משלו למחירים, לתיאום ולסגירת לידים, בלי תלות בפלטפורמות של אחרים",
    complexity: "medium",
    installTime: "בונה אתרים: ימים בודדים · וורדפרס דרכנו: 2-7 שבועות",
    benchmarks: [
      { metric: "מנוי בונה אתרים (מסלולי עסק קטן)", range: "כ-₪51-117 לחודש (הומר מ-$17-39 לפי שער AIT הקבוע 3.0, חיוב שנתי)", source: "wix.com דרך websitebuilderexpert.com + מגזין greeninvoice.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "הקמת אתר תדמית וורדפרס (מחיר שוק ישראלי)", range: "₪1,500-8,000 חד-פעמי", source: "webitnow.co.il · sgo.co.il · talsa.co.il · avinu.co.il · digitizer.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "אתר רב-עמודים מקצועי", range: "₪7,000-18,000", source: "avinu.co.il · talsa.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "עלויות שוטפות לאתר (דומיין + אחסון)", range: "₪450-1,350 לשנה", source: "avinu.co.il · sgo.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
    ],
  },
  {
    // אושר על ידי המייסד 17.8. savingRange לפי הכרעת המייסד: ערך של סדר, זמן ומעקב לידים
    // (לא כספי מומצא) - שתי טענות ה-ROI הכספיות נפסלו במחקר על היעדר מקור ראשוני.
    // פריט מונע-ראיון: internal_tools נחשף רק בשאלת הכלים - הסורק לא רואה מה קורה בפנים.
    name: "מערכת CRM לניהול לקוחות",
    problem: "הלקוחות והפניות מנוהלים בראש, בוואטסאפ ובאקסל - אין תמונה אחת של מי בטיפול, מי חיכה יותר מדי ומי שווה מעקב",
    solution: "הטמעת CRM מוכן לעסק קטן עם צינור מכירה, תיעוד פניות ותזכורות מעקב",
    conditions: { gapKeys: ["internal_tools"] },
    costRange: "מסלול חינמי קיים · בתשלום כ-₪21-171 למשתמש לחודש, ברוב המערכות מינימום 3 משתמשים · הטמעה ₪1,500-8,000",
    savingRange: "סדר ושליטה במקום ניהול בראש: כל פנייה מתועדת עם אחראי ותאריך חזרה, ורואים אילו לידים נסגרו ולמה - כך הפניות הבאות לא הולכות לאיבוד",
    complexity: "medium",
    installTime: "2-4 שבועות כולל הגדרה והרגלת צוות",
    benchmarks: [
      { metric: "מנוי CRM לעסק קטן (למשתמש לחודש)", range: "חינם (מסלולי Free) · בתשלום כ-₪21-171 (הומר מ-$7-57 לפי שער AIT הקבוע 3.0)", source: "fireberry.com/pricing (אומת חי) · monday.com/pricing (אומת חי) · bigin.com (אומת חי) (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "עלות צוות מינימלי בפועל (3 משתמשים)", range: "כ-₪108-405 לחודש (הומר לפי שער AIT הקבוע 3.0)", source: "monday CRM Basic 3 מושבים · Fireberry Standard 3 משתמשים (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "תוכנת ניהול עסק ישראלית (חלופת ERP קל)", range: "₪29-200 לחודש (לפני מע\"מ היכן שצוין)", source: "greeninvoice.co.il (אומת חי) · rivhit.co.il (אומת חי) · Priority Zoom דרך qama.co.il (מפיץ מורשה) (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "הטמעת CRM לעסק קטן", range: "₪1,500-8,000 הקמה", source: "achiya-automation.com (אומת חי) · bizrunner.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
    ],
  },
  {
    // אושר על ידי המייסד 17.8 (הכריע לזרוע למרות היותו שלישי על manual_tasks - כיסוי רחב עדיף,
    // הדירוג מסדר). savingRange בלי ספרות - טענות "חוסך X שעות" בשוק הן מקרי לקוח של ספקים.
    name: "אוטומציה בין המערכות הקיימות",
    problem: "המערכות לא מדברות ביניהן - כל ליד, חשבונית או עדכון מועתקים ידנית ממערכת למערכת, וטעות אחת שוברת את השרשרת",
    solution: "חיבור המערכות הקיימות (טפסים, יומן, חשבוניות, CRM) באוטומציות שרצות לבד, בהקמה מלאה דרכנו",
    conditions: { gapKeys: ["manual_tasks"] },
    costRange: "פלטפורמה ₪0-90 לחודש · הקמה חד-פעמית ₪1,200-8,000 לפי מספר האוטומציות",
    savingRange: "פחות העתקות ידניות ופחות טעויות אנוש: העדכונים עוברים לבד בין המערכות, והצוות מתפנה לעבודה עצמה",
    complexity: "medium",
    installTime: "3-14 ימים לאוטומציה ממוקדת",
    benchmarks: [
      { metric: "פלטפורמת אוטומציה (SaaS)", range: "חינם (מסלולים מוגבלים) · בתשלום כ-₪27-90 לחודש (הומר מ-$9-29.99 לפי שער AIT הקבוע 3.0)", source: "make.com/pricing (אומת חי) · zapier.com/pricing (אומת חי) · n8n.io (אומת חי) (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "הקמת אוטומציה ממוקדת (מיישם ישראלי)", range: "₪1,200-8,000 לפי היקף", source: "achiya-automation.com/pricing (אומת חי, מחיר מדף) · bizrunner.co.il (08/2026)", verifiedAt: new Date("2026-08-17") },
      { metric: "תפעול חודשי (שרת + API)", range: "₪100-600 לחודש", source: "achiya-automation.com/pricing (אומת חי) (08/2026)", verifiedAt: new Date("2026-08-17") },
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
      const { verifiedAt, ...bench } = b;
      await prisma.benchmark.create({ data: { ...bench, catalogId: row.id, verifiedAt: verifiedAt ?? VERIFIED } });
    }
  }
  const count = await prisma.opportunityCatalog.count();
  const benchCount = await prisma.benchmark.count();
  console.log(`קטלוג: ${count} פריטים · ${benchCount} בנצ'מרקים`);
}

main().finally(() => prisma.$disconnect());
