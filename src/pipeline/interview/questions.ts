import type { ScanFindings } from "../types";
import type { BusinessModel, ModelSection } from "../model/business-model";

// בנק השאלות המונחות (אפיון מסך 4): כל שאלה נפתחת בהקשר מהסריקה כשיש, והתקרה קשיחה - 12
// שאלות רגילות + שאלת סיכום אחת (ראו CLOSING_QUESTION_KEY למטה, ו-MAX_GUIDED_QUESTIONS בסוף
// הקובץ - נגזר ממספר הפריטים בפועל בבנק, לא כתוב פעמיים).
// pains בכוונה בלי שאלה מונחית רגילה: כאבים אמיתיים עולים מתוך תשובות וכתיבה חופשית - חוץ
// משאלת הסיכום, שממוענת לפגיעה במפורש (אפיון מחדש-ראיון, החלטה B).

export interface QuestionOption { label: string }

export interface GuidedQuestion {
  key: string;
  section: ModelSection;
  text: (f: ScanFindings, m: BusinessModel) => string;
  // אפשרויות בחירה מרובה (אפיון מחדש-ראיון, החלטה 1): כתובות בעברית טבעית של בעל עסק, מודעות
  // לקטלוג המכירות (מיפוי לפערים שהקטלוג פותר). ה-UI מוסיף "אחר - אכתוב בעצמי" בעצמו בסוף -
  // לא נכלל כאן. חסר (undefined) = שאלה בלי אפשרויות מובנות (רק שאלת הסיכום היום).
  options?: QuestionOption[];
  // בחירה מרובה (החלטה 2) רק היכן שטבעי - ערוצים/כלים שיכולים לחול כמה יחד. חסר/false = בחירה
  // בודדת (לחיצה = שליחה מיידית בצד ה-UI).
  multiSelect?: boolean;
}

// סדר עדיפות הסקציות לראיון - מיושר עם INTERVIEW_PRIORITY של recommendNextStep
// (ארבע הראשונות זהות), ואחריהן שאר הסקציות שהסריקה משאירה חסרות. מקור אמת יחיד: גם הסדר
// (SECTION_ORDER) וגם התוויות בעברית לתצוגת ה-UI (משימה 11 - התקדמות פר-סקציה במסך הראיון)
// נגזרים מכאן, כדי שלא יהיו שתי רשימות שיכולות להתפצל. pains לא ביניהן בכוונה - ראו הערה
// ליד CLOSING_QUESTION_KEY למטה על למה שאלת הסיכום לא משתלבת ברשימה הזו.
export const INTERVIEW_SECTIONS: { key: ModelSection; label: string }[] = [
  { key: "lead_flow", label: "טיפול בפניות" },
  { key: "service", label: "שירות ותפעול" },
  { key: "billing", label: "גבייה וחשבוניות" },
  { key: "manual_tasks", label: "עבודה ידנית" },
  { key: "profile", label: "פרופיל העסק" },
  { key: "channels", label: "ערוצי שיווק" },
  { key: "scheduling", label: "יומן ותורים" },
  { key: "retention", label: "שימור לקוחות" },
  { key: "tools", label: "כלים ומערכות" },
];
const SECTION_ORDER: ModelSection[] = INTERVIEW_SECTIONS.map((s) => s.key);

// מפתח שאלת הסיכום (אפיון מחדש-ראיון, החלטה 3): שדה נפרד ולא רק "האיבר האחרון במערך" - כדי
// שקוד שצריך להתייחס אליה במפורש (pickNextQuestion, כאן) יעשה זאת בבירור ולא בהשוואת אינדקס שביר
export const CLOSING_QUESTION_KEY = "closing_pains";

const REGULAR_BANK: GuidedQuestion[] = [
  {
    key: "lead_flow_intake", section: "lead_flow",
    text: (f) => f.websiteSignals?.hasContactForm
      ? "ראינו שיש טופס יצירת קשר באתר. מי מקבל את הפניות האלה, ותוך כמה זמן אתם חוזרים ללקוח בדרך כלל?"
      : "איך מגיעות אליכם פניות חדשות (טלפון, וואטסאפ, פייסבוק), ומי מטפל בהן?",
    options: [
      { label: "בעיקר טלפון" },
      { label: "וואטסאפ" },
      { label: "טופס באתר" },
      { label: "פייסבוק/אינסטגרם" },
    ],
    multiSelect: true,
  },
  {
    key: "lead_flow_lost", section: "lead_flow",
    text: () => "קורה שפנייה הולכת לאיבוד או נענית באיחור? איפה זה קורה הכי הרבה?",
    // האפשרות הראשונה נכתבה במכוון כך שתתאים ל-LEAD_DROP_RE (score/dimensions.ts) - ראו
    // interview-questions.test.ts, בדיקת ההצלבה בין ניסוח האפשרות לרג'קס
    options: [
      { label: "כן, קורה שפנייה מתפספסת" },
      { label: "עונים באיחור לפעמים, אבל בסוף מטפלים בהכל" },
      { label: "בעיקר מחוץ לשעות הפעילות" },
      { label: "לא, אנחנו עונים כמעט תמיד מיד" },
    ],
  },
  {
    // כמות שאלות (תוספת שאושרה על ידי המייסד): נתונים מספריים של בעל העסק, נשמרים verbatim
    // ומיועדים למינוף עתידי בחישובי "מה אתה מפסיד" (המספר של הבעלים כפול בנצ'מרק מחקרי - לא
    // כאן, לא בשלב הזה). טווחים כנים, לא מספרים נקודתיים - בדיוק כמו טווחי המחירים בקטלוג עצמו.
    key: "lead_flow_volume", section: "lead_flow",
    text: () => "כמה פניות בערך מגיעות לעסק בשבוע?",
    options: [
      { label: "עד 10" },
      { label: "10-30" },
      { label: "30-100" },
      { label: "מעל 100" },
    ],
  },
  {
    // זמן תגובה כטווח (תוספת שאושרה על ידי המייסד): השאלה הקיימת (lead_flow_intake) כבר
    // שואלת "תוך כמה זמן חוזרים ללקוח" בטקסט שלה כשיש טופס יצירת קשר, אבל האפשרויות שלה
    // ממוקדות בערוצים (multiSelect) - לא ניתן לערבב שני צירים בבחירה מרובה אחת. שאלה ייעודית
    // עם טווחים כנים במקום ניסוחים מעורפלים ("מהר"/"לא כל כך מהר")
    key: "lead_flow_response_time", section: "lead_flow",
    text: () => "תוך כמה זמן בערך אתם חוזרים ללקוח שפנה?",
    options: [
      { label: "תוך דקות" },
      { label: "תוך שעה-שעתיים" },
      { label: "באותו יום" },
      { label: "יום-יומיים ומעלה" },
    ],
  },
  {
    key: "service_repeat", section: "service",
    text: () => "אילו שאלות חוזרות אתם עונים עליהן שוב ושוב כל שבוע?",
    options: [
      { label: "מחיר ותנאים" },
      { label: "זמינות ותורים" },
      { label: "פרטי מוצר או שירות" },
      { label: "סטטוס הזמנה או טיפול" },
    ],
    multiSelect: true,
  },
  {
    key: "service_load", section: "service",
    text: () => "מה החלק הכי עמוס ביום העבודה שלכם מבחינת שירות ללקוחות?",
    options: [
      { label: "בבוקר, כשכולם מתקשרים ביחד" },
      { label: "בשעות הצהריים" },
      { label: "לקראת סוף היום" },
      { label: "אין שעה עמוסה מיוחדת, זה מתפרס לאורך היום" },
    ],
  },
  {
    key: "billing_flow", section: "billing",
    text: () => "איך אתם גובים תשלום היום? ויש חובות פתוחים שאתם רודפים אחריהם ידנית?",
    options: [
      { label: "מזומן" },
      { label: "אשראי בטלפון או בעמדה" },
      { label: "העברה בנקאית" },
      { label: "יש גם חובות פתוחים שרודפים אחריהם ידנית" },
    ],
    multiSelect: true,
  },
  {
    key: "billing_tool", section: "billing",
    text: () => "באיזה כלי או תוכנה אתם מפיקים חשבוניות?",
    options: [
      { label: "חשבונית ירוקה" },
      { label: "חשבשבת" },
      { label: "iCount" },
      { label: "בלי תוכנה קבועה - ידני או אקסל" },
    ],
  },
  {
    key: "manual_tasks_top", section: "manual_tasks",
    text: () => "אילו משימות ידניות חוזרות אוכלות לכם הכי הרבה זמן בשבוע, וכמה שעות בערך?",
    options: [
      { label: "הזנת נתונים או העתקה בין מערכות" },
      { label: "תיאום תורים ופגישות בטלפון" },
      { label: "מעקב אחרי תשלומים וחובות" },
      { label: "כתיבת חשבוניות או מסמכים ידנית" },
    ],
    multiSelect: true,
  },
  {
    key: "profile_basics", section: "profile",
    text: () => "כמה אנשים אתם בצוות, כמה שנים העסק פעיל, ומי הלקוח הטיפוסי שלכם?",
    options: [
      { label: "רק אני" },
      { label: "2-3 אנשים" },
      { label: "4-10 אנשים" },
      { label: "יותר מ-10 אנשים" },
    ],
  },
  {
    key: "channels_main", section: "channels",
    text: (f) => (f.business.reviewCount ?? 0) > 0
      ? "רואים שיש לכם נוכחות בגוגל. מאיפה עוד מגיעים אליכם לקוחות, וכמה מכל מקום בערך?"
      : "מאיפה מגיעים אליכם רוב הלקוחות היום?",
    options: [
      { label: "המלצות מלקוחות קיימים" },
      { label: "חיפוש בגוגל" },
      { label: "רשתות חברתיות (פייסבוק/אינסטגרם)" },
      { label: "שילוט או מיקום פיזי" },
    ],
    multiSelect: true,
  },
  {
    key: "scheduling_how", section: "scheduling",
    text: (f) => f.websiteSignals?.hasOnlineBooking
      ? "יש לכם קביעת תורים אונליין באתר. כמה מהתורים באמת נקבעים דרכה, וכמה עדיין בטלפון?"
      : "אם אתם עובדים עם תורים או פגישות, איך הם נקבעים וכמה זמן ביום הולך על תיאומים?",
    options: [
      { label: "בטלפון בלבד" },
      { label: "בוואטסאפ או הודעות" },
      { label: "קביעת תור אונליין באתר" },
      { label: "אין לנו תורים קבועים" },
    ],
  },
  {
    key: "retention_contact", section: "retention",
    text: () => "יש לכם קשר יזום עם לקוחות קיימים (תזכורות, מבצעים, עדכונים), או שהקשר נגמר אחרי השירות?",
    options: [
      { label: "כן, שולחים תזכורות ועדכונים באופן קבוע" },
      { label: "מדי פעם, לא באופן קבוע" },
      { label: "לא, הקשר נגמר אחרי השירות" },
      { label: "רק כשהלקוח פונה אלינו" },
    ],
  },
  {
    key: "tools_used", section: "tools",
    text: (f, m) => {
      const detected = (m.data.tools?.detected as string[] | undefined) ?? [];
      if (detected.length > 1) return "זיהינו באתר כמה כלים דיגיטליים. אילו עוד מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק?";
      if (detected.length === 1) return "זיהינו באתר כלי דיגיטלי אחד. אילו עוד מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק?";
      return "אילו מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק (יומן, אקסל, CRM)?";
    },
    options: [
      { label: "יומן או לוח שנה דיגיטלי" },
      { label: "אקסל בלבד" },
      { label: "מערכת CRM לניהול לקוחות" },
      { label: "אין לנו כלי קבוע - הכל בזיכרון או בפתקים" },
    ],
    multiSelect: true,
  },
];

// שאלת הסיכום (אפיון מחדש-ראיון, החלטה 3): כאב + תוספת חופשית במשפט אחד, טקסט חופשי בלבד
// (בלי options - ה-UI נופל אוטומטית לתיבת הטקסט הרגילה כשאין אפשרויות). ממוענת לסקציית pains
// כי החילוץ (extract.ts) כבר יודע לחלץ כאבים מטקסט חופשי אל אותה סקציה בדיוק.
const CLOSING_QUESTION: GuidedQuestion = {
  key: CLOSING_QUESTION_KEY,
  section: "pains",
  text: () => "לפני שמסיימים - מה הכי מציק לך בעסק היום? ואם יש עוד משהו שחשוב שנדע, זה המקום",
};

export const QUESTION_BANK: GuidedQuestion[] = [...REGULAR_BANK, CLOSING_QUESTION];

// שם ישן נשמר כ-alias ל-QUESTION_BANK.length (13, כולל שאלת הסיכום) - קריאות קיימות
// (snapshotOf/runInterviewTurn ב-run-interview.ts, cli-interview.ts) ממשיכות לעבוד בלי שינוי,
// והמספר נגזר מהבנק בפועל ולא כתוב פעמיים בקוד (למניעת דריפט)
export const MAX_GUIDED_QUESTIONS = QUESTION_BANK.length;

// תקרה קשיחה על הבנק הרגיל בלבד (12) - בלי שאלת הסיכום. הגנת-יתר עצמאית מגודל הבנק בפועל
// (בדיוק כמו שהתקרה הישנה הייתה "יתירה" תיאורטית מול מבנה הבנק, אבל נשמרה בכוונה כרשת ביטחון)
const REGULAR_CAP = REGULAR_BANK.length;

// הבחירה דטרמיניסטית: הסקציה הראשונה בסדר העדיפות שעוד לא הושלמה (קרדיט < 1),
// והשאלה הראשונה בה שטרם נשאלה. כשהבנק הרגיל מוצה (כל הסקציות זוכו/נשאלו) או שהתקרה קרובה -
// שאלת הסיכום היא הצעד הבא, בדיוק פעם אחת. null = הראיון המונחה מוצה סופית (שאלת הסיכום כבר נענתה)
export function pickNextQuestion(
  model: BusinessModel,
  findings: ScanFindings,
  askedKeys: string[],
): GuidedQuestion | null {
  // שאלת הסיכום כבר נענתה - סוף סופי, בלי קשר למצב הקרדיטים של שאר הסקציות
  if (askedKeys.includes(CLOSING_QUESTION_KEY)) return null;
  if (askedKeys.length < REGULAR_CAP) {
    for (const section of SECTION_ORDER) {
      if (model.credits[section] >= 1) continue;
      const q = REGULAR_BANK.find((x) => x.section === section && !askedKeys.includes(x.key));
      if (q) return q;
    }
  }
  // הבנק הרגיל מוצה (כל תשע הסקציות זוכו או שאין להן עוד שאלה שלא נשאלה) או שהתקרה הרגילה
  // הושגה - שאלת הסיכום היא הצעד הבא בכל מקרה, ומובטח שהיא נשאלת פעם אחת בלבד (guard למעלה).
  // בכוונה לא משוערת לפי model.credits.pains כמו כל סקציה אחרת ב-SECTION_ORDER: pains יכולה
  // לקבל קרדיט 1 מוקדם מדי מתשובה חופשית על שאלה שאינה קשורה בכלל - הפרומפט ב-extract.ts
  // מרשה למודל השפה לבחור כל סקציה, לא רק את זו של השאלה הנוכחית (ראו SECTION_HINTS שם).
  // שיעור לפי קרדיט היה מסתכן בדילוג שקט על שאלת הסיכום; שיעור לפי חברות ב-askedKeys בלבד
  // (הבדיקה למעלה) מבטיח "בדיוק פעם אחת" בלי תלות בתוכן שחולץ בפועל.
  return CLOSING_QUESTION;
}
