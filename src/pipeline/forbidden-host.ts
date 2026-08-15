// חסימת SSRF: מארחים פנימיים/מקומיים נדחים. מודול-עלה טהור (בלי תלויות) כדי שגם קוד
// הפייפליין יוכל לייבא אותו - קוד פייפליין לא מייבא מ-src/server. הבדיקה מבוססת-שם בלבד:
// הקשחת DNS-resolution (שם ציבורי שמצביע לכתובת פנימית) נדרשת לפני deploy ציבורי (חסם-deploy)
export function isForbiddenHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // URL.hostname שומר על הסוגריים המרובעים סביב כתובות IPv6 (נבדק אמפירית: new
  // URL("http://[::1]").hostname === "[::1]") - הסוגריים הם הסימן שזו כתובת IPv6 ולא שם דומיין.
  // מזהים לפניהם, ורק אז מסירים אותם לצורך ההשוואה
  const isIpv6Literal = lower.startsWith("[") && lower.endsWith("]");
  const h = isIpv6Literal ? lower.slice(1, -1) : lower;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // IPv6: לופבק, link-local, unique-local. הבדיקות האלה חלות אך ורק על ליטרל IPv6 אמיתי -
  // בלי התנאי הזה כל דומיין ציבורי שמתחיל ב-fc/fd נחסם בטעות (fcbarcelona.com, fdny.org).
  // הזיהוי כפול בכוונה: סוגריים מרובעים (הצורה של URL.hostname) או נקודתיים (ליטרל חשוף)
  if (isIpv6Literal || h.includes(":")) {
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  }
  return false;
}

// בדיקה שקטה על כתובת מלאה: מחזירה את שם המארח החסום, או null (גם לכתובת לא תקינה - מי
// שרוצה שגיאה על כתובת פגומה מטפל בזה בעצמו). שימושית להחלטת דילוג בלי לזרוק
export function forbiddenHostOf(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  return isForbiddenHost(parsed.hostname) ? parsed.hostname : null;
}

// השער היחיד לפני כל בקשת רשת יוצאת של הסורק: סכמה מותרת + מארח מותר. base מאפשר לפתור
// כתובת יחסית (כותרת Location של הפניה) מול הכתובת הנוכחית, ולבדוק את התוצאה.
// היגיינת הודעות: נחשפים רק שם המארח או הסכמה - לעולם לא הנתיב, הפורט או ה-query
export function assertFetchableUrl(rawUrl: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, base);
  } catch {
    throw new Error("כתובת לא תקינה לבקשה");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`סכמה לא נתמכת לבקשה (רק http/https): ${parsed.protocol}`);
  }
  if (isForbiddenHost(parsed.hostname)) {
    throw new Error(`מארח חסום (פנימי או מקומי): ${parsed.hostname}`);
  }
  return parsed;
}
