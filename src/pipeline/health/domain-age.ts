// מתי פג הרישום של הדומיין של העסק.
//
// למה זו הבדיקה היקרה ביותר בסבב הזה: זה האות היחיד שמנבא שהאתר והדואר ייפלו יחד
// בתאריך ידוע מראש. שום דבר אחר במוצר לא רואה את זה - סורק, PSI וביקורות מתארים את
// ההווה, וכאן יש עובדה מדודה על העתיד. מודול הנתונים בלבד: הוא מחזיר מה שנמדד,
// ושכבת הניקוד היא זו שמחליטה מה נאמר למשתמש.
//
// פרטיות (חריג מודע ומכוון ל"שמירת payload מלא" שנוהג בשאר הצינור): גוף התשובה
// מ-whois מכיל פרטי בעלים, איש קשר מנהלי וטכני - מידע אישי של אדם אמיתי שלא ביקש
// שנשמור אותו. לכן הגוף הגולמי לא נשמר, לא מוחזר ולא נכתב ללוג בשום מסלול. מחלצים
// את שלושת השדות שצריך ומשחררים את הטקסט לאיסוף זבל.
//
// כנות: שדה שלא נקרא בוודאות נשאר undefined ("לא נבדק"). ברישום ה-il לחלק לא מבוטל
// מהרשומות אין תוקף שמיש בכלל (ורשומות ותיקות מחזירות ממש "validity: N/A"), ואסור
// שזה יתורגם לאפס או ל"פג היום".
//
// מגבלה שדורשת אימות חי לפני שסומכים על הבדיקה: whois רץ על TCP פורט 43 גולמי, ויש
// סיכוי שסביבת הריצה של Vercel חוסמת אותו. כל כשל רשת מתורגם כאן ל-undefined ולא
// לחריגה, כך שהמצב הגרוע הוא "לא נבדק" - אבל צריך בדיקה אחת על preview חי כדי לדעת
// אם הבדיקה בכלל עובדת בייצור
import { createConnection } from "node:net";
import type { DomainHealth } from "../types";
import { registrableDomain } from "./registrable";
import { shortFailureReason } from "./failure-reason";

export interface DomainDeps {
  /** מחזיר את גוף התשובה הגולמי משרת ה-whois, או זורק */
  query: (server: string, domain: string) => Promise<string>;
  /** now מוזרק כדי שהבדיקות לא יהיו תלויות תאריך */
  now: () => Date;
}

// הרישום הישראלי מוגש ישירות, בלי הפניה. שאר הסיומות מתגלות דרך IANA
const IL_WHOIS_SERVER = "whois.isoc.org.il";
const IANA_WHOIS_SERVER = "whois.iana.org";
const WHOIS_PORT = 43;
const QUERY_TIMEOUT_MS = 10_000;
// תקרת קריאה: שרת whois עוין או תקול יכול להזרים בלי סוף. אין תשובה לגיטימית בסדר גודל כזה
const MAX_RESPONSE_BYTES = 256 * 1024;
const DAY_MS = 86_400_000;

// שנה מחוץ לטווח = כשל פענוח, לא עובדה. 1985 היא שנת הדומיין הראשון שנרשם אי פעם,
// ו-30 שנה קדימה חורגת מכל תקופת רישום אפשרית - ערך כזה הוא זבל פרסור, לא תוקף
const MIN_YEAR = 1985;
const MAX_YEARS_AHEAD = 30;

/**
 * ברירת המחדל: סוקט TCP גולמי לפורט 43. פרוטוקול whois הוא שורה אחת פנימה וזרם טקסט
 * החוצה עד שהשרת סוגר. ההזרקה חובה - הבדיקות רצות אופליין ולעולם לא פותחות סוקט
 */
export const socketQuery: DomainDeps["query"] = (server, domain) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const socket = createConnection({ host: server, port: WHOIS_PORT });

    // טיימאאוט קשיח על כל הבקשה ולא רק על חוסר פעילות: שרת whois שמזרים בייט בכל
    // שנייה היה תוקע את הסריקה כולה
    const hardTimeout: ReturnType<typeof setTimeout> = setTimeout(() => {
      fail(new Error("whois timeout"));
    }, QUERY_TIMEOUT_MS);

    function finish(): void {
      clearTimeout(hardTimeout);
      socket.destroy();
    }
    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    }
    function done(): void {
      if (settled) return;
      settled = true;
      finish();
      resolve(Buffer.concat(chunks).toString("utf8"));
    }

    socket.setTimeout(QUERY_TIMEOUT_MS);
    socket.on("connect", () => {
      socket.write(`${domain}\r\n`);
    });
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      chunks.push(chunk);
      if (size >= MAX_RESPONSE_BYTES) done();
    });
    socket.on("timeout", () => fail(new Error("whois timeout")));
    socket.on("error", (error: Error) => fail(error));
    socket.on("end", () => done());
    socket.on("close", () => done());
  });

// שמות שדות משתנים בין רישומים, ולכן רשימה מסודרת לפי עדיפות ולא ניחוש. הכתיב כאן
// מנורמל (אותיות קטנות, רווחים מכווצים) והשוואה היא מדויקת - לא חיפוש חופשי בטקסט,
// כדי שכתב ויתור משפטי שמזכיר "expiration" לא ייקרא בטעות כתאריך
const EXPIRY_KEYS: readonly string[] = [
  "registry expiry date",
  "registrar registration expiration date",
  "expiration date",
  "expiry date",
  "expires on",
  "expires",
  "expire",
  "expiry",
  "paid-till",
  "renewal date",
  "valid until",
  "validity",
];

const CREATED_KEYS: readonly string[] = [
  "creation date",
  "created on",
  "created date",
  "registration date",
  "registered on",
  "record created",
  "created",
  "registered",
];

const REGISTRAR_KEYS: readonly string[] = [
  "registrar name",
  "sponsoring registrar",
  "registrar organization",
  "registrar",
];

// ערכים שהרישומים משתמשים בהם כדי לומר "אין נתון". הם חייבים להיקרא כחוסר ולא כערך
const PLACEHOLDER_VALUES: readonly string[] = [
  "n/a", "na", "-", "--", "none", "null", "unknown", "not available",
  "redacted for privacy", "data redacted", "not disclosed",
];

/** ערך השדה הראשון שנמצא לפי סדר העדיפות, או undefined */
function fieldValue(body: string, keys: readonly string[]): string | undefined {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const line of body.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim().toLowerCase().replace(/\s+/g, " ");
    const value = line.slice(at + 1).trim();
    if (value.length === 0) continue;
    pairs.push({ key, value });
  }
  for (const key of keys) {
    const hit = pairs.find((pair) => pair.key === key);
    if (hit != null && !PLACEHOLDER_VALUES.includes(hit.value.toLowerCase())) return hit.value;
  }
  return undefined;
}

/** בונה תאריך UTC ומאמת שהרכיבים שרדו - כך 31-02 נדחה במקום לגלוש למרץ */
function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * פענוח תאריך whois. Date חדש על מחרוזת חופשית אסור כאן - הוא תלוי מימוש ומחזיר
 * Invalid Date בשקט, ולכן כל צורה מזוהה בתבנית מפורשת. מחרוזת שלא מפוענחת מוחזרת
 * כ-null, כלומר "לא נבדק" - לעולם לא Invalid Date ולא אפס
 */
function parseWhoisDate(value: string | undefined, now: Date): Date | null {
  if (value == null) return null;
  const text = value.trim();

  let parsed: Date | null = null;

  // ISO 8601 עם שעה (רוב רישומי ה-gTLD). בלי אזור זמן מפורש מניחים UTC
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (iso != null) {
    const normalized = `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6] ?? "00"}${(iso[7] ?? "Z").replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")}`;
    const ms = Date.parse(normalized);
    parsed = Number.isNaN(ms) ? null : new Date(ms);
  }

  // תאריך בלבד שמתחיל בשנה: 2027-11-30 וגם 2027.11.30 או 2027/11/30
  if (parsed == null) {
    const ymd = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text);
    if (ymd != null) parsed = utcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  // תאריך בלבד שמסתיים בשנה: 30-11-2027, 30/11/2027, 30.11.2027.
  // יום-לפני-חודש בכוונה: זו הצורה של רישום ה-il (validity) ושל רישומים אירופיים,
  // וצורת ארה"ב לא מופיעה בשדות שאנחנו קוראים. כשהראשון גדול מ-12 אין ספק בכלל
  if (parsed == null) {
    const dmy = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(text);
    if (dmy != null) parsed = utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  if (parsed == null) return null;

  // שנה מחוץ לטווח האפשרי היא כשל פענוח ולא עובדה על העסק
  const year = parsed.getUTCFullYear();
  if (year < MIN_YEAR || year > now.getUTCFullYear() + MAX_YEARS_AHEAD) return null;
  return parsed;
}

/** שרת ה-whois המוסמך לפי רשומת ה-TLD של IANA */
function referralServer(body: string): string | null {
  const server = fieldValue(body, ["refer", "whois"]);
  if (server == null) return null;
  const host = server.trim().toLowerCase();
  // שם מארח בלבד. ערך אחר ברשומה הוא זבל או נסיון הזרקה, ולא פונים אליו
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

/**
 * צורת ASCII של הדומיין. שתי סיבות: דומיין בעברית חייב punycode כדי ש-whois יבין
 * אותו, ופרוטוקול whois הוא שורתי - תו שורה חדשה בתוך השאילתה הוא הזרקת פקודה
 */
function toAsciiDomain(domain: string | null): string | null {
  if (domain == null) return null;
  let ascii: string;
  try {
    ascii = new URL(`https://${domain}`).hostname;
  } catch {
    return null;
  }
  return /^[a-z0-9.-]+$/.test(ascii) ? ascii : null;
}

/** קפיצת הפניה אחת בדיוק דרך IANA, לעולם לא לולאה */
async function queryViaIana(query: DomainDeps["query"], domain: string): Promise<string | null> {
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  const root = await query(IANA_WHOIS_SERVER, tld);
  const server = referralServer(root);
  if (server == null) return null;
  return query(server, domain);
}

function buildHealth(body: string, now: Date): DomainHealth | undefined {
  const health: DomainHealth = {};

  const registrar = fieldValue(body, REGISTRAR_KEYS);
  // תקרת אורך: שם רשם אמיתי קצר בהרבה, וערך ארוך הוא שורה שנקראה לא נכון
  if (registrar != null) health.registrar = registrar.slice(0, 120);

  const created = parseWhoisDate(fieldValue(body, CREATED_KEYS), now);
  if (created != null) health.createdAt = created.toISOString();

  const expires = parseWhoisDate(fieldValue(body, EXPIRY_KEYS), now);
  if (expires != null) {
    health.expiresAt = expires.toISOString();
    // חשבון על שני ערכים מדודים בלבד (תאריך מהרישום מול now מוזרק). בלי תקופת חסד
    // ובלי עיגול לטובתנו. ערך שלילי הוא תשובה נכונה ומועברת כמו שהיא לקורא
    health.daysToExpiry = Math.floor((expires.getTime() - now.getTime()) / DAY_MS);
  }

  // שום שדה לא נקרא: הבדיקה רצה אבל לא ידועה ממנה עובדה. undefined ולא אובייקט ריק,
  // כדי ששכבת הניקוד תדווח known=false בדיוק כמו בכשל רשת
  return Object.keys(health).length > 0 ? health : undefined;
}

export async function readDomainHealth(
  hostname: string,
  deps: Partial<DomainDeps> = {},
): Promise<DomainHealth | undefined> {
  const domain = toAsciiDomain(registrableDomain(hostname));
  // אתר על פלטפורמה, כתובת IP או שם לא תקין: אין דומיין של העסק לבדוק
  if (domain == null) return undefined;

  const query = deps.query ?? socketQuery;
  const now = deps.now ?? (() => new Date());

  try {
    const body = domain.endsWith(".il")
      ? await query(IL_WHOIS_SERVER, domain)
      : await queryViaIana(query, domain);
    if (body == null) return undefined;
    return buildHealth(body, now());
  } catch (err) {
    // כשל תשתית - סוקט חסום, timeout, שרת שלא עונה - נזרק הלאה כדי שהסיבה תגיע להערות
    // האיסוף דרך collectHealth (תחקיר 21.8: חשד שפורט 43 חסום בוורסל נבלע כאן בשקט).
    // shortFailureReason מעדיף את קוד השגיאה, כך שגוף תשובה לא נגרר להודעה (ראו הערת
    // הפרטיות בראש הקובץ). שכבת הניקוד עדיין רואה "לא נבדק" - הזריקה אינה ענישה
    throw new Error(`whois נכשל: ${shortFailureReason(err)}`);
  }
}
