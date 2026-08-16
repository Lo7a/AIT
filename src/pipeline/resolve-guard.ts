// הקשחת DNS-resolution נגד SSRF - ההשלמה ל-forbidden-host, שסוגרת את חסם-ה-deploy המתועד:
// הבדיקה שם תחבירית בלבד, ולכן שם מארח ציבורי שנפתר לכתובת פנימית (למשל A record שמצביע
// ל-10.0.0.5) עבר אותה. כאן פותרים את השם בפועל ודוחים אם ולו כתובת אחת מהתוצאה אסורה.
// מודול נפרד מ-forbidden-host בכוונה: הוא תלוי ב-node:dns, ו-forbidden-host נשאר עלה טהור.
//
// כנות (מגבלה ידועה, נדחתה בכוונה): הכתובת שנבדקה כאן אינה מוצמדת (pin) לחיבור שהבקשה
// תפתח בפועל - fetch מריץ resolve משלו, ולכן נשאר חלון DNS-rebinding קטן בין הבדיקה
// לבקשה (שרת DNS זדוני שמחזיר כתובת ציבורית לבדיקה ופנימית לבקשה). סגירה מלאה דורשת
// lookup מותאם ברמת ה-agent/dispatcher של undici, והיא מתועדת כאן כמגבלה ידועה
import { lookup } from "node:dns/promises";
import { isForbiddenIp } from "./forbidden-host";

// חתימה מינימלית של dns.promises.lookup עם all:true - שתי המשפחות, כל הכתובות.
// ה-resolver מוזרק כדי שהבדיקות ירוצו אופליין עם resolver מזויף - לעולם לא DNS אמיתי בבדיקות
export type LookupLike = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

export const defaultLookup: LookupLike = lookup;

// ליטרל IP לא נשלח ל-DNS - הוא כבר נבדק תחבירית ב-isForbiddenHost. הזיהוי בטוח כי הכתובת
// מגיעה מ-new URL: ליטרל v4 מנורמל לצורה עשרונית נקודתית (גם 0x7f.1 וכדומה), וליטרל v6
// תמיד עטוף בסוגריים מרובעים
function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

// השער האסינכרוני: רץ אחרי assertFetchableUrl (השער התחבירי הזול) ולפני כל בקשה בפועל,
// כולל כל קפיצת הפניה. כשל DNS (למשל NXDOMAIN) מחלחל כמו שהוא - זה אותו כשל רשת שהיה
// קורה ממילא ב-fetch על מארח לא קיים, לא מסלול שגיאה חדש.
// היגיינת הודעות כמו ב-forbidden-host: נחשף רק שם המארח - לא הנתיב ולא הכתובת שנפתרה
export async function assertResolvesPublic(url: URL, lookupImpl: LookupLike = defaultLookup): Promise<void> {
  const hostname = url.hostname;
  if (isIpLiteral(hostname)) return;
  const addresses = await lookupImpl(hostname, { all: true });
  for (const { address } of addresses) {
    if (isForbiddenIp(address)) {
      throw new Error(`מארח חסום (נפתר לכתובת פנימית או מקומית): ${hostname}`);
    }
  }
}
