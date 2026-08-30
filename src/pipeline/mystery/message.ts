import type { MysteryChannel } from "../types";

// ניסוח הפנייה של הלקוח הסמוי (משימה 10): לקוח רגיל ששואל שאלה רגילה - בלי להזמין, בלי לקנות,
// בלי להתחייב. הניסוח קבוע ודטרמיניסטי (בלי LLM): הבדיקה נמדדת בזמן התגובה, לא ביצירתיות.
// אפס ספרות בגוף ההודעה בכוונה - שום מספר לא ייחשב בטעות כנתון של העסק

export interface Persona { name: string; feminine: boolean }

// שמות ישראליים נפוצים, ללא שם משפחה - כמו פנייה אמיתית של לקוח
export const PERSONAS: readonly Persona[] = [
  { name: "נועה", feminine: true },
  { name: "דניאל", feminine: false },
  { name: "מאיה", feminine: true },
  { name: "יונתן", feminine: false },
  { name: "שירה", feminine: true },
  { name: "עומר", feminine: false },
];

// מה הלקוח מבקש, לפי הענף (הסלאגים מ-src/pipeline/industry.ts). ענף לא מזוהה = בקשה כללית
const ASK_BY_INDUSTRY: Record<string, string> = {
  beauty_grooming: "לקבוע תור בשבוע הקרוב ולשמוע מה המחירים בערך",
  food_dine_in: "לשמוע אם אפשר להזמין שולחן לקבוצה קטנה בסוף השבוע ואם יש תפריט מיוחד",
  food_takeaway: "לשאול אם אתם עושים הזמנה גדולה לאירוע קטן ומה המחיר בערך",
  health_clinic: "לקבוע תור ראשון ולשמוע מה עלות הביקור",
  fitness_studio: "לשמוע על אימון ניסיון ומה המחירים של המנויים",
  auto_service: "לשאול על טיפול לרכב ומתי אפשר להגיע",
  trades_onsite: "לקבל הצעת מחיר לעבודה קטנה בבית ולשמוע מתי אפשר להגיע",
  retail_store: "לשאול אם מוצר מסוים במלאי ומה שעות הפתיחה",
  professional_services: "לקבוע פגישת ייעוץ ראשונה ולשמוע איך זה עובד",
  education_training: "לשמוע על הקורס הקרוב, המחיר ומתי מתחילים",
};
const ASK_DEFAULT = "לשמוע על השירות שלכם ומה המחירים בערך";

export interface Inquiry {
  senderName: string;
  subject: string;
  body: string;
}

// נושא המייל של הפנייה - קבוע, כדי שהחשיפה תוכל לענות באותו נושא ("Re: ...")
export const INQUIRY_SUBJECT = "שאלה קטנה";

export function pickPersona(random: () => number): Persona {
  return PERSONAS[Math.min(PERSONAS.length - 1, Math.floor(random() * PERSONAS.length))];
}

/**
 * הפנייה עצמה. במייל ובטופס מבקשים תשובה במייל (זו הכתובת שאנחנו מודדים); בוואטסאפ ובטלפון
 * ההודעה קצרה יותר, כי מישהו מהחברה שולח אותה ביד ומתעד את התשובה במסך הניהול
 */
export function composeInquiry(channel: MysteryChannel, industry: string, persona: Persona): Inquiry {
  const ask = ASK_BY_INDUSTRY[industry] ?? ASK_DEFAULT;
  const available = persona.feminine ? "זמינה" : "זמין";
  if (channel === "whatsapp" || channel === "phone") {
    return {
      senderName: persona.name,
      subject: "שאלה",
      body: `היי, ראיתי אתכם בגוגל ורציתי ${ask}. תודה, ${persona.name}`,
    };
  }
  return {
    senderName: persona.name,
    subject: INQUIRY_SUBJECT,
    body: [
      "שלום,",
      `ראיתי אתכם בגוגל ורציתי ${ask}.`,
      `אפשר לחזור אליי במייל? אני פחות ${available} בטלפון.`,
      "תודה,",
      persona.name,
    ].join("\n"),
  };
}

/** הודעת החשיפה אחרי הבדיקה - תמיד נשלחת, בלי אפשרות לבטל (הכרעת מייסד 30.8) */
export function disclosureText(businessName: string): string {
  return [
    "שלום,",
    `הפנייה הקודמת הייתה בדיקת לקוח סמוי מטעם בדק עסק, בהזמנת בעל העסק ${businessName}.`,
    "לא היה כאן לקוח אמיתי ואין צורך להמשיך לטפל בפנייה. תודה על המענה.",
    "בדק עסק",
  ].join("\n");
}
