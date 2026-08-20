// סוג השירות: *מה* אנחנו מוכרים. ציר אחד לפריט, במכוון - פריט שהוא גם "AI" וגם
// "אוטומציה" הוא פריט שלא הוחלט מה הוא, וספרייה כזו נהיית בלתי ניתנת לסינון.
//
// הציר השני, *למי*, הוא הענף (industry.ts) והוא רב-ערכי: בוט AI אחד משרת מסעדה,
// מספרה ומוסך. שני הצירים חיים בנפרד בדיוק בגלל זה (הנחיית מייסד 20.8).
//
// הרשימה נגזרה מ-20 הפריטים שכבר בקטלוג ולא הומצאה מראש - כל ערך כאן הוא סוג שבאמת
// יש לו פריט. הוספת סוג היא שינוי קוד בכוונה: כך אי אפשר ליצור בטעות שני סוגים
// שנכתבו קצת אחרת ולפצל את הספרייה בלי לשים לב
export const SERVICE_TYPES = [
  "ai",
  "automation",
  "website",
  "booking",
  "channels",
  "reviews",
  "crm",
  "measurement",
  "presence",
  "accessibility",
  "infrastructure",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABEL_HE: Record<ServiceType, string> = {
  ai: "סוכני AI ובוטים",
  automation: "אוטומציה וחיבור מערכות",
  website: "אתר",
  booking: "תורים והזמנות",
  channels: "ערוצי פנייה",
  reviews: "מוניטין וביקורות",
  crm: "ניהול לקוחות",
  measurement: "מדידה ונתונים",
  presence: "נוכחות ונראות",
  accessibility: "נגישות",
  infrastructure: "תשתית ואבטחה",
};

const SERVICE_TYPE_SET = new Set<string>(SERVICE_TYPES);

/** ערך מהמסד או מטופס. כל דבר שאינו סוג מוכר חוזר null - "לא מסווג", לא ניחוש */
export function parseServiceType(value: unknown): ServiceType | null {
  return typeof value === "string" && SERVICE_TYPE_SET.has(value) ? (value as ServiceType) : null;
}

/** התווית לתצוגה. פריט בלי סוג מוצג ככזה במפורש ולא נדחף לקטגוריה כלשהי */
export function serviceTypeLabel(value: unknown): string {
  const parsed = parseServiceType(value);
  return parsed == null ? "לא מסווג" : SERVICE_TYPE_LABEL_HE[parsed];
}
