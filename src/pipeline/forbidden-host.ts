// חסימת SSRF: מארחים פנימיים/מקומיים נדחים. מודול-עלה טהור (בלי תלויות) כדי שגם קוד
// הפייפליין יוכל לייבא אותו - קוד פייפליין לא מייבא מ-src/server. הבדיקה כאן תחבירית בלבד
// (שם מארח או ליטרל IP); ההשלמה שסוגרת את חסם-ה-deploy המתועד - שם ציבורי שנפתר (resolve)
// לכתובת פנימית - נמצאת ב-resolve-guard.ts, שער אסינכרוני שרץ בשכבת ה-fetch לכל קפיצה

// טווחי IPv4 אסורים: לופבק, רשתות פרטיות, link-local ,0.x. משמש גם לשם מארח (הצורה
// הנקודתית בתחילת שם נחסמת ממילא) וגם לכתובת שנפתרה מ-DNS
function isForbiddenIpv4(addr: string): boolean {
  return /^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(addr);
}

// בדיקת כתובת IP בודדת בשתי המשפחות - ליטרל שנוקה מסוגריים או כתובת שחזרה מ-DNS.
// צורות v4-ממופה נבדקות לפי חוקי v4 בשני הסריאלים הקיימים: הנקודתי (::ffff:10.0.0.1 -
// כך dns.lookup מחזיר) וה-hex (::ffff:a00:1 - כך new URL מסריאל ליטרל v6 ממופה)
export function isForbiddenIp(address: string): boolean {
  const a = address.toLowerCase();
  if (!a.includes(":")) return isForbiddenIpv4(a);
  // IPv6: unspecified, לופבק, link-local, unique-local
  if (a === "::" || a === "::1" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
  const mappedDotted = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isForbiddenIpv4(mappedDotted[1]);
  const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isForbiddenIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  return false;
}

export function isForbiddenHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // URL.hostname שומר על הסוגריים המרובעים סביב כתובות IPv6 (נבדק אמפירית: new
  // URL("http://[::1]").hostname === "[::1]") - הסוגריים הם הסימן שזו כתובת IPv6 ולא שם דומיין.
  // מזהים לפניהם, ורק אז מסירים אותם לצורך ההשוואה
  const isIpv6Literal = lower.startsWith("[") && lower.endsWith("]");
  const h = isIpv6Literal ? lower.slice(1, -1) : lower;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isForbiddenIpv4(h)) return true;
  // IPv6: לופבק, link-local, unique-local וצורות ממופות. הבדיקות האלה חלות אך ורק על ליטרל
  // IPv6 אמיתי - בלי התנאי הזה כל דומיין ציבורי שמתחיל ב-fc/fd נחסם בטעות (fcbarcelona.com,
  // fdny.org). הזיהוי כפול בכוונה: סוגריים מרובעים (הצורה של URL.hostname) או נקודתיים (ליטרל חשוף)
  if (isIpv6Literal || h.includes(":")) return isForbiddenIp(h);
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
