import type { ScanFindings } from "../types";
import type { BusinessModel, ModelSection } from "../model/business-model";
import type { ExtractedUpdate } from "./extract";

// בנק השאלות המונחות (אפיון מסך 4): כל שאלה נפתחת בהקשר מהסריקה כשיש, והתקרה קשיחה - 15
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
  // שם השדה במודל לנתיב הסטטי (הכרעת מייסד 17.8): תשובת צ'יפים היא מידע שידוע מראש - התווית
  // שנבחרה נשמרת verbatim תחת השדה הזה בלי קריאת LLM בכלל (ראו staticUpdateFor למטה).
  // חובה בכל שאלה עם options (נאכף בבדיקה) - שאלה בלי options (שאלת הסיכום) לא צריכה אותו
  field?: string;
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
    key: "lead_flow_intake", field: "intakeChannels", section: "lead_flow",
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
    key: "lead_flow_lost", field: "leadDrop", section: "lead_flow",
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
    key: "lead_flow_volume", field: "weeklyLeads", section: "lead_flow",
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
    key: "lead_flow_response_time", field: "responseTime", section: "lead_flow",
    text: () => "תוך כמה זמן בערך אתם חוזרים ללקוח שפנה?",
    options: [
      { label: "תוך דקות" },
      { label: "תוך שעה-שעתיים" },
      { label: "באותו יום" },
      { label: "יום-יומיים ומעלה" },
    ],
  },
  {
    // שווי לקוח/עסקה (הכרעת מייסד 18.8): השאלה השלישית שסוגרת את המשולש של שורת ההפסד האישי -
    // כמות פניות, מהירות תגובה ושווי. בלעדיה ההפסד נאמר במספר פניות בלבד; איתה מצטרפת אליו
    // גם העובדה כמה שווה אצלו לקוח שנסגר (loss-calc.ts). התווית מצוטטת שם כלשונה ולא מוכפלת
    // בכלום - פנייה היא לא לקוח שנסגר, ומכפלה ביניהן הייתה מניחה שיעור סגירה שאיש לא נתן.
    // חייבות להישאר זהות אות-באות ל-DEAL_VALUE_LABELS ב-loss-calc.ts (בדיקת ההצלבה נועלת).
    // מוצבת אחרי שתי שאלות הכמות בכוונה: שאלת כסף היא האינטימית מבין השלוש, ובאה רק אחרי
    // ששתי השאלות הקלות כבר נענו
    key: "lead_flow_deal_value", field: "avgDealValue", section: "lead_flow",
    text: () => "כמה שווה בממוצע לקוח או עסקה אצלכם?",
    options: [
      { label: "עד 300 שקל" },
      { label: "300-1,000 שקל" },
      { label: "1,000-5,000 שקל" },
      { label: "מעל 5,000 שקל" },
    ],
  },
  {
    key: "service_repeat", field: "repeatQuestions", section: "service",
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
    key: "service_load", field: "peakLoad", section: "service",
    text: () => "מה החלק הכי עמוס ביום העבודה שלכם מבחינת שירות ללקוחות?",
    options: [
      { label: "בבוקר, כשכולם מתקשרים ביחד" },
      { label: "בשעות הצהריים" },
      { label: "לקראת סוף היום" },
      { label: "אין שעה עמוסה מיוחדת, זה מתפרס לאורך היום" },
    ],
  },
  {
    key: "billing_flow", field: "paymentMethods", section: "billing",
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
    key: "billing_tool", field: "invoiceTool", section: "billing",
    text: () => "באיזה כלי או תוכנה אתם מפיקים חשבוניות?",
    options: [
      { label: "חשבונית ירוקה" },
      { label: "חשבשבת" },
      { label: "iCount" },
      { label: "בלי תוכנה קבועה - ידני או אקסל" },
    ],
  },
  {
    key: "manual_tasks_top", field: "topManualTasks", section: "manual_tasks",
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
    key: "profile_basics", field: "teamSize", section: "profile",
    text: () => "כמה אנשים אתם בצוות, כמה שנים העסק פעיל, ומי הלקוח הטיפוסי שלכם?",
    options: [
      { label: "רק אני" },
      { label: "2-3 אנשים" },
      { label: "4-10 אנשים" },
      { label: "יותר מ-10 אנשים" },
    ],
  },
  {
    key: "channels_main", field: "mainChannels", section: "channels",
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
    key: "scheduling_how", field: "bookingMethod", section: "scheduling",
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
    key: "retention_contact", field: "proactiveContact", section: "retention",
    text: () => "יש לכם קשר יזום עם לקוחות קיימים (תזכורות, מבצעים, עדכונים), או שהקשר נגמר אחרי השירות?",
    options: [
      { label: "כן, שולחים תזכורות ועדכונים באופן קבוע" },
      { label: "מדי פעם, לא באופן קבוע" },
      { label: "לא, הקשר נגמר אחרי השירות" },
      { label: "רק כשהלקוח פונה אלינו" },
    ],
  },
  {
    key: "tools_used", field: "chosenTools", section: "tools",
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

// שם ישן נשמר כ-alias ל-QUESTION_BANK.length (16, כולל שאלת הסיכום) - קריאות קיימות
// (snapshotOf/runInterviewTurn ב-run-interview.ts, cli-interview.ts) ממשיכות לעבוד בלי שינוי,
// והמספר נגזר מהבנק בפועל ולא כתוב פעמיים בקוד (למניעת דריפט)
export const MAX_GUIDED_QUESTIONS = QUESTION_BANK.length;

// תקרה קשיחה על הבנק הרגיל בלבד - בלי שאלת הסיכום. הגנת-יתר עצמאית מגודל הבנק בפועל
// (בדיוק כמו שהתקרה הישנה הייתה "יתירה" תיאורטית מול מבנה הבנק, אבל נשמרה בכוונה כרשת ביטחון)
const REGULAR_CAP = REGULAR_BANK.length;

// שאלות חובה (תיקון באג הדילוג): שלוש שאלות הכמות נושאות את הנתונים שעליהם נבנית שורת ההפסד
// האישית בדוח. הן נשלפות לפי questionKey של ההודעה עצמה (getQuantityAnswers ב-interview-repo.ts)
// ומוזנות ל-personalLossLine (roadmap/loss-calc.ts), כלומר בלי שהן נשאלות בפועל אין להן תשובה
// שמורה, והשורה הכי שווה בדוח פשוט לא מתרנדרת.
//
// למה שער פר-שאלה ולא פר-קרדיט של סקציה: applyInterviewUpdates (merge.ts) מעלה את קרדיט
// הסקציה ל-1 על כל עדכון בודד, ותשובת צ'יפים מייצרת תמיד עדכון אחד בדיוק. כלומר תשובה יחידה
// על lead_flow_intake מזכה את כל סקציית lead_flow, והלולאה הרחבה למטה מדלגת מאותו רגע על
// ארבע שאלות ההמשך שלה. קרדיט 1 אומר "התחלנו לאסוף מהסקציה הזו", לא "סיימנו לאסוף ממנה" -
// ולכן שאלה שנושאת נתון שהדוח תלוי בו נמדדת לפי חברות ב-askedKeys בלבד, באותו היגיון בדיוק
// שבו שאלת הסיכום לא נמדדת לפי קרדיט pains.
export const REQUIRED_QUESTION_KEYS: readonly string[] = [
  "lead_flow_volume", "lead_flow_response_time", "lead_flow_deal_value",
];

// סדר הניקוז נגזר מהבנק ולא מהרשימה למעלה: הבנק הוא מקור האמת לסדר (שאלת הכסף אחרי שתי הקלות -
// ראו ההערה ליד lead_flow_deal_value), והרשימה רק מסמנת מי חובה. שינוי סדר בבנק מזיז אוטומטית
// גם את סדר הניקוז, בלי רשימה שנייה שיכולה להתפצל ממנו
const REQUIRED_QUESTIONS: GuidedQuestion[] = REGULAR_BANK.filter(
  (q) => REQUIRED_QUESTION_KEYS.includes(q.key),
);

// תקרת הניקוז: כל הבנק פחות מקום שמור לשאלת הסיכום. REGULAR_CAP בכוונה לא חל על שאלות חובה
// (הן הנתון עצמו, לא "עוד שאלה"), אבל תקרה מוחלטת כן חלה - כך שסך השאלות המונחות חסום
// ב-MAX_GUIDED_QUESTIONS מבנית, גם אם askedKeys מכיל מפתחות שאינם מהבנק. בפועל התקרה הזו לא
// יכולה להרעיב שאלת חובה: runInterviewTurn דוחה questionKey שאינו בבנק, כך ש-askedKeys באורך
// REGULAR_CAP פירושו שכל הבנק הרגיל כבר נשאל - ובתוכו שלוש שאלות החובה
const DRAIN_CAP = MAX_GUIDED_QUESTIONS - 1;

// כמה שאלות פתיחה קודמות לשאלות הכסף (הכרעת מייסד 24.8). אחת: מספיקה כדי לפתוח את השיחה
// בהקשר של בעל העסק ("איך פניות מגיעות אליכם") לפני שנשאל כמה שווה לו לקוח, ולא יותר -
// כל שאלה נוספת לפניהן דוחה את שורת ההפסד בתור אחד. עם אחת שורת ההפסד מלאה בשאלה 4
const OPENING_QUESTIONS = 1;

/** כמה שאלות מהבנק הרגיל כבר נשאלו בסקציה - הבסיס לסבב הרוחב למטה */
function askedInSection(section: ModelSection, askedKeys: string[]): number {
  return REGULAR_BANK.filter((q) => q.section === section && askedKeys.includes(q.key)).length;
}

// הבחירה דטרמיניסטית, בשלושה שלבים: שאלת פתיחה אחת, אחריה שלוש שאלות החובה ברצף, ואז סבב
// רוחב על הסקציות. כשהבנק הרגיל מוצה - שאלת הסיכום, בדיוק פעם אחת.
// null = הראיון המונחה מוצה סופית (שאלת הסיכום כבר נענתה)
//
// **למה זה לא נשען יותר על model.credits (משימה 7, 24.8).** הגרסה הקודמת דילגה על סקציה
// שקרדיטה >= 1, וקרדיט סקציה קופץ ל-1 מכל עדכון בודד (merge.ts). כלומר תשובה אחת על
// lead_flow_intake מחקה את ארבע שאלות ההמשך של הסקציה, ובהן שלוש שאלות הכסף - והן נותרו
// לניקוז בסוף, במקומות 10 עד 12. הדוח החי רץ עשר שאלות בלי שורת הפסד אמיתית. הקרדיטים לא
// שונו כאן בכוונה: הם עדיין מזינים את completenessPct ואת recommendNextStep, שם המשמעות
// "התחלנו לאסוף מהסקציה" נכונה. מה שהוחלף הוא רק מה שבחירת השאלה נשענת עליו.
//
// **למה askedKeys ולא בדיקת שדה במודל.** דילוג לפי model.data[section][field] היה מדלג גם על
// שדה שהסריקה ניחשה, וזה סותר את "הראיון גובר על הסריקה תמיד" - הסריקה מסיקה, בעל העסק יודע.
// askedKeys מודד בדיוק את מה שנשאל בפועל. ההקלטה המונחית (משימה 15) עונה על שאלה מזוהה
// ולכן נכנסת ל-askedKeys כמו תשובת צ'יפ, בלי צורך במעקב מקור פר-שדה ובלי שינוי סכימה
export function pickNextQuestion(
  // נשאר בחתימה: פנקס החוסרים (משימה 19) יצרוך אותו כדי לדעת מה כבר ידוע ומאיזה מקור
  model: BusinessModel,
  findings: ScanFindings,
  askedKeys: string[],
): GuidedQuestion | null {
  // שאלת הסיכום כבר נענתה - סוף סופי, בלי קשר למצב שאר הסקציות
  if (askedKeys.includes(CLOSING_QUESTION_KEY)) return null;
  // שאלות החובה מיד אחרי שאלת הפתיחה, בסדר הבנק (כמות, זמן תגובה, שווי). אין סיכון ללולאה
  // אינסופית - מוחזרת רק שאלה שאינה ב-askedKeys, ו-runInterviewTurn מוסיף כל מפתח שנשאל,
  // כך שכל תור מקטין את מספר המועמדות בדיוק באחת. גם תשובה חופשית שהחילוץ שלה נכשל לא
  // לוכדת את המשתמש: השאלה כבר נספרה כנשאלת
  if (askedKeys.length >= OPENING_QUESTIONS && askedKeys.length < DRAIN_CAP) {
    const required = REQUIRED_QUESTIONS.find((q) => !askedKeys.includes(q.key));
    if (required) return required;
  }
  // סבב רוחב מפורש: הסקציה שנשאלה הכי מעט, ובתוכה השאלה הראשונה שטרם נשאלה. קודם הרוחב היה
  // תופעת לוואי של באג הקרדיטים (סקציה נמחקה אחרי תשובה אחת, ולכן התור התקדם); עכשיו הוא
  // נמדד ישירות, ולכן סקציה עם חמש שאלות נשארת בתור לסיבוב שני במקום להיעלם
  if (askedKeys.length < REGULAR_CAP) {
    const open = SECTION_ORDER
      .map((section) => ({
        asked: askedInSection(section, askedKeys),
        q: REGULAR_BANK.find((x) => x.section === section && !askedKeys.includes(x.key)),
      }))
      .filter((c): c is { asked: number; q: GuidedQuestion } => c.q != null);
    if (open.length > 0) {
      // Math.min ואז find, ולא sort: יציב לפי SECTION_ORDER בלי להסתמך על יציבות המיון
      const fewest = Math.min(...open.map((c) => c.asked));
      return open.find((c) => c.asked === fewest)!.q;
    }
  }
  // ניקוז מאוחר: התקרה הרגילה הושגה לפני ששאלת חובה נשאלה (askedKeys ארוך ממה שהבנק מסביר,
  // למשל מפתחות שאינם מהבנק). שומר על ההבטחה ששלוש שאלות הכסף לא נופלות בשקט
  if (askedKeys.length < DRAIN_CAP) {
    const required = REQUIRED_QUESTIONS.find((q) => !askedKeys.includes(q.key));
    if (required) return required;
  }
  // כל הבנק הרגיל נשאל, או שהתקרה הרגילה הושגה - שאלת הסיכום היא הצעד הבא בכל מקרה, ומובטח
  // שהיא נשאלת פעם אחת בלבד (guard למעלה). היא מעולם לא נשערה לפי model.credits.pains כמו
  // שאר הסקציות, ועכשיו זה נכון לכל הבחירה: pains יכולה לקבל קרדיט 1 מוקדם מדי מתשובה חופשית
  // על שאלה שאינה קשורה בכלל - הפרומפט ב-extract.ts מרשה למודל השפה לבחור כל סקציה, לא רק
  // את זו של השאלה הנוכחית (ראו SECTION_HINTS שם). שיעור לפי חברות ב-askedKeys בלבד מבטיח
  // "בדיוק פעם אחת" בלי תלות בתוכן שחולץ בפועל.
  return CLOSING_QUESTION;
}

// הנתיב הסטטי (הכרעת מייסד 17.8): תשובה שהיא בדיוק אפשרות מהתפריט (או שרשור אפשרויות בבחירה
// מרובה, כפי שה-UI שולח - join ב-", ") לא צריכה LLM. התווית שנבחרה היא מילות בעל העסק
// (הוא בחר אותן במפורש) ונשמרת verbatim תחת השדה של השאלה - אפס המצאה מבנית, והרג'קסים של
// score/dimensions.ts ממשיכים לרוץ על אותו טקסט בדיוק. כל אי-התאמה מחזירה null והתור ממשיך
// למסלול ה-LLM הרגיל - הנתיב הזה רק מקצר, לעולם לא מפרש.
export function staticUpdateFor(q: GuidedQuestion, answer: string): ExtractedUpdate | null {
  if (q.options == null || q.field == null) return null;
  const labels = q.options.map((o) => o.label);
  const matched = matchLabels(answer.trim(), labels, q.multiSelect === true);
  if (matched == null) return null;
  // הערך נבנה מהתוויות שלנו עצמן (לא מהקלט הגולמי) - נקי מבנית, באותו סדר שבו נשלחו
  return { section: q.section, fields: { [q.field]: matched.join(", ") } };
}

// פירוק בהתאמת-רישא מול התוויות עצמן ולא ב-split נאיבי על פסיק: יש בבנק תוויות שמכילות
// בעצמן ", " ("כן, קורה שפנייה מתפספסת") - split היה שובר אותן. תווית לא יכולה להיבחר פעמיים
function matchLabels(answer: string, labels: string[], multi: boolean): string[] | null {
  if (labels.includes(answer)) return [answer];
  if (!multi) return null;
  const out: string[] = [];
  let rest = answer;
  while (rest.length > 0) {
    const hit = labels.find((l) => !out.includes(l) && (rest === l || rest.startsWith(l + ", ")));
    if (hit == null) return null;
    out.push(hit);
    rest = rest === hit ? "" : rest.slice(hit.length + 2);
  }
  return out.length > 0 ? out : null;
}
