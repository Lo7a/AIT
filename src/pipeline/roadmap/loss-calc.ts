// חישוב ההפסד האישי (מדרגה ב של "ההפסד מוביל", אושר על ידי המייסד 16.8): המספרים שבעל העסק
// נתן בראיון כפול השיעור המחקרי, מוצג כהערכה מעוגנת בתשובות שלו. מודול טהור לחלוטין - בלי
// I/O, בלי Date/random; אותו קלט = אותו פלט.
//
// שלוש הכרעות מייסד (16.8, שיחת ניסוח מובנית):
// 1. ניסוח ישיר ומוכר - המשפט מוביל במספר המחושב, המקור מיד אחריו.
// 2. עסק שעונה "תוך דקות" מקבל שורה מפרגנת (כנות מוכרת אמון), לא שורת סיכון.
// 3. השורה מוצגת אך ורק כששתי התשובות (כמות פניות + זמן תגובה) קיימות ותואמות בדיוק לאופציות
//    הידועות מבנק השאלות - תשובת "אחר"/טקסט חופשי לא מפוענחת, אין שורה בכלל.
//
// כלל הכפל המאושר: זה המקום היחיד במערכת שבו מוצג מספר נגזר (תשובת בעלים כפול שיעור מחקרי) -
// לא מספר קטלוג ולא ציטוט ישיר. ההיתר הוא החלטת המייסד על מדרגה ב ("החשבון הכן - המספרים שהוא
// נתן כפול התעריפים המחקריים"); העיגון הכפול (התשובות שלו + המקור) מופיע תמיד לצד המספר.

export interface PersonalLossLine {
  kind: "risk" | "praise";
  lead: string;   // המשפט המוביל - המספר או הפרגון
  anchor: string; // משפט העיגון - התשובות של הבעלים + נתון המחקר ומקורו
}

// טווחי הכמות - חייבים להיות זהים אות-באות לאופציות של lead_flow_volume בבנק השאלות
// (interview/questions.ts); בדיקת הצלבה נועלת את ההתאמה (loss-calc.test.ts). hi=null פירושו
// "מעל" - טווח פתוח מלמעלה, lo=0 פירושו "עד" - פתוח מלמטה
const VOLUME_RANGES: Record<string, { lo: number; hi: number | null }> = {
  "עד 10": { lo: 0, hi: 10 },
  "10-30": { lo: 10, hi: 30 },
  "30-100": { lo: 30, hi: 100 },
  "מעל 100": { lo: 100, hi: null },
};

// מדרגי זמן התגובה - זהים אות-באות לאופציות של lead_flow_response_time בבנק השאלות. phrase
// הוא הניסוח בתוך משפט העיגון ("ותגובה ..."), מותאם דקדוקית לכל מדרג
const RESPONSE_TIERS: Record<string, { kind: "fast" | "slow"; phrase: string }> = {
  "תוך דקות": { kind: "fast", phrase: "תגובה תוך דקות" },
  "תוך שעה-שעתיים": { kind: "slow", phrase: "תגובה תוך שעה-שעתיים" },
  "באותו יום": { kind: "slow", phrase: "תגובה באותו יום" },
  "יום-יומיים ומעלה": { kind: "slow", phrase: "תגובה של יום-יומיים ומעלה" },
};

// 35-50% - אותו נתון מחקרי בדיוק שמופיע בבנצ'מרק "אפקט מהירות תגובה על סגירה" של פריט סוכן
// ההצעות (prisma/seed.ts; InsideSales דרך expertise.ai, אומת 16.8.2026; הגרסה הוויראלית "78%"
// נפסלה שם כחסרת מקור). הקבוע חי גם כאן וגם בזרע - רענון מחירים שמשנה את הנתון חייב לעדכן את
// שני המקומות (בדיקת ההצלבה נועלת את הטקסט המוצג מול הערכים כאן)
const FIRST_RESPONDER_SHARE = { lo: 0.35, hi: 0.5 };
const RESEARCH_SENTENCE = "מחקר InsideSales מצא ש-35-50% מהעסקאות נסגרות אצל מי שמגיב ראשון";

// עיגול כלפי מטה בכוונה בשני הקצוות - ההערכה לעולם לא מגזימה כלפי מעלה, גם במחיר הקטנה קלה
// של הטווח. עקרון הכנות: מוטב להציג פחות ממה שהמחקר מרמז מאשר להיתפס בהגזמה
function atRiskText(volume: { lo: number; hi: number | null }): string {
  if (volume.hi === null) return `מעל ${Math.floor(volume.lo * FIRST_RESPONDER_SHARE.lo)}`;
  if (volume.lo === 0) return `עד ${Math.floor(volume.hi * FIRST_RESPONDER_SHARE.hi)}`;
  return `${Math.floor(volume.lo * FIRST_RESPONDER_SHARE.lo)}-${Math.floor(volume.hi * FIRST_RESPONDER_SHARE.hi)}`;
}

export function personalLossLine(
  volumeAnswer: string | null | undefined,
  responseAnswer: string | null | undefined,
): PersonalLossLine | null {
  const volume = VOLUME_RANGES[volumeAnswer?.trim() ?? ""];
  const tier = RESPONSE_TIERS[responseAnswer?.trim() ?? ""];
  if (!volume || !tier) return null;

  if (tier.kind === "fast") {
    return {
      kind: "praise",
      lead: "סיפרת שאתם עונים תוך דקות - זה נכס אמיתי.",
      anchor: `${RESEARCH_SENTENCE} - ואתם שם.`,
    };
  }

  const volumeLabel = volumeAnswer!.trim();
  return {
    kind: "risk",
    lead: `לפי מה שסיפרת: ${atRiskText(volume)} מהפניות השבועיות שלך בסיכון ממשי.`,
    anchor: `סיפרת על ${volumeLabel} פניות בשבוע ו${tier.phrase}. ${RESEARCH_SENTENCE}.`,
  };
}
