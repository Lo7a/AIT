import type { ScanFindings } from "../types";
import type { BusinessModel, ModelSection } from "../model/business-model";

// בנק השאלות המונחות (אפיון מסך 4): כל שאלה נפתחת בהקשר מהסריקה כשיש, והתקרה קשיחה - 12.
// pains בכוונה בלי שאלה ישירה: כאבים אמיתיים עולים מתוך תשובות וכתיבה חופשית.
export const MAX_GUIDED_QUESTIONS = 12;

export interface GuidedQuestion {
  key: string;
  section: ModelSection;
  text: (f: ScanFindings, m: BusinessModel) => string;
}

// סדר עדיפות הסקציות לראיון - מיושר עם INTERVIEW_PRIORITY של recommendNextStep
// (ארבע הראשונות זהות), ואחריהן שאר הסקציות שהסריקה משאירה חסרות
const SECTION_ORDER: ModelSection[] = [
  "lead_flow", "service", "billing", "manual_tasks",
  "profile", "channels", "scheduling", "retention", "tools",
];

export const QUESTION_BANK: GuidedQuestion[] = [
  {
    key: "lead_flow_intake", section: "lead_flow",
    text: (f) => f.websiteSignals?.hasContactForm
      ? "ראינו שיש טופס יצירת קשר באתר. מי מקבל את הפניות האלה, ותוך כמה זמן אתם חוזרים ללקוח בדרך כלל?"
      : "איך מגיעות אליכם פניות חדשות (טלפון, וואטסאפ, פייסבוק), ומי מטפל בהן?",
  },
  {
    key: "lead_flow_lost", section: "lead_flow",
    text: () => "קורה שפנייה הולכת לאיבוד או נענית באיחור? איפה זה קורה הכי הרבה?",
  },
  {
    key: "service_repeat", section: "service",
    text: () => "אילו שאלות חוזרות אתם עונים עליהן שוב ושוב כל שבוע?",
  },
  {
    key: "service_load", section: "service",
    text: () => "מה החלק הכי עמוס ביום העבודה שלכם מבחינת שירות ללקוחות?",
  },
  {
    key: "billing_flow", section: "billing",
    text: () => "איך אתם גובים תשלום היום? ויש חובות פתוחים שאתם רודפים אחריהם ידנית?",
  },
  {
    key: "billing_tool", section: "billing",
    text: () => "באיזה כלי או תוכנה אתם מפיקים חשבוניות?",
  },
  {
    key: "manual_tasks_top", section: "manual_tasks",
    text: () => "אילו משימות ידניות חוזרות אוכלות לכם הכי הרבה זמן בשבוע, וכמה שעות בערך?",
  },
  {
    key: "profile_basics", section: "profile",
    text: () => "כמה אנשים אתם בצוות, כמה שנים העסק פעיל, ומי הלקוח הטיפוסי שלכם?",
  },
  {
    key: "channels_main", section: "channels",
    text: (f) => (f.business.reviewCount ?? 0) > 0
      ? "רואים שיש לכם נוכחות בגוגל. מאיפה עוד מגיעים אליכם לקוחות, וכמה מכל מקום בערך?"
      : "מאיפה מגיעים אליכם רוב הלקוחות היום?",
  },
  {
    key: "scheduling_how", section: "scheduling",
    text: (f) => f.websiteSignals?.hasOnlineBooking
      ? "יש לכם קביעת תורים אונליין באתר. כמה מהתורים באמת נקבעים דרכה, וכמה עדיין בטלפון?"
      : "אם אתם עובדים עם תורים או פגישות, איך הם נקבעים וכמה זמן ביום הולך על תיאומים?",
  },
  {
    key: "retention_contact", section: "retention",
    text: () => "יש לכם קשר יזום עם לקוחות קיימים (תזכורות, מבצעים, עדכונים), או שהקשר נגמר אחרי השירות?",
  },
  {
    key: "tools_used", section: "tools",
    text: (f, m) => {
      const detected = (m.data.tools?.detected as string[] | undefined) ?? [];
      if (detected.length > 1) return "זיהינו באתר כמה כלים דיגיטליים. אילו עוד מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק?";
      if (detected.length === 1) return "זיהינו באתר כלי דיגיטלי אחד. אילו עוד מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק?";
      return "אילו מערכות או אפליקציות משמשות אתכם ביומיום לניהול העסק (יומן, אקסל, CRM)?";
    },
  },
];

// הבחירה דטרמיניסטית: הסקציה הראשונה בסדר העדיפות שעוד לא הושלמה (קרדיט < 1),
// והשאלה הראשונה בה שטרם נשאלה. null = הראיון מיצה את עצמו (תקרה או הכול הושלם)
export function pickNextQuestion(
  model: BusinessModel,
  findings: ScanFindings,
  askedKeys: string[],
): GuidedQuestion | null {
  if (askedKeys.length >= MAX_GUIDED_QUESTIONS) return null;
  for (const section of SECTION_ORDER) {
    if (model.credits[section] >= 1) continue;
    const q = QUESTION_BANK.find((x) => x.section === section && !askedKeys.includes(x.key));
    if (q) return q;
  }
  return null;
}
