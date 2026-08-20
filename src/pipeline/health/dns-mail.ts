// קריאת רשומות ה-DNS שמעידות אם הדואר של העסק מוגדר מקצועית ומוגן מהתחזות:
// MX (מי מקבל את הדואר), SPF ו-DMARC (מי מורשה לשלוח בשם הדומיין).
//
// שלוש מלכודות דיוק שנצפו מול DNS חי, וכל אחת מהן משנה את מה שמותר לנו לכתוב בדוח:
//
// 1. NODATA אינו NXDOMAIN, ושניהם אינם כישלון. בקוד השגיאה של Node: ENOTFOUND פירושו
//    שהשם לא קיים ו-ENODATA פירושו שהשם קיים בלי רשומה מהסוג הזה. שניהם ממצא אמיתי
//    "אין רשומה" -> false. כל קוד אחר (SERVFAIL, timeout, EAI_AGAIN) פירושו שהבדיקה לא
//    הושלמה, והשדה חייב להישאר חסר ("לא נבדק") - לעולם לא false. זה כלל הכנות בקוד:
//    false הוא טענה על העסק, וטענה כזו אסור להסיק מרזולבר שלא ענה.
//
// 2. היעדר MX אינו אומר שהדואר נופל. דומיין בלי MX אבל עם רשומת A מקבל דואר דרך MX
//    משתמע (RFC 5321). לכן hasMx=false הוא תיעוד עובדה בלבד, ואסור לגזור ממנו "הדואר
//    לא עובד" בשום מסך או ניסוח.
//
// 3. SPF ו-DMARC יושבים במקומות שונים. SPF הוא רשומת TXT על הדומיין עצמו, וזו הרשומה
//    שערכה מתחיל ב-v=spf1 - לא כל TXT שמופיעה בו המילה spf. DMARC הוא TXT על
//    _dmarc.<domain> שמתחיל ב-v=DMARC1.
//
// 4. "יש רשומה" אינו "ההגנה עובדת", וזו לא קפדנות תיאורטית אלא ממצא חי (jems.co.il, 20.8):
//    שתי רשומות SPF על אותו דומיין, אחת של Microsoft 365 ואחת של elasticemail. בשני
//    התקנים ריבוי רשומות מבטל את הבדיקה ולא מחזק אותה - SPF מחזיר permerror (RFC 7208
//    סעיף 4.5) ומדיניות DMARC נזרקת (RFC 7489 סעיף 6.6.3). לכן סופרים ולא רק בודקים קיום,
//    והתוצאה נשמרת בשדה נפרד: הקיום נשאר עובדה נכונה, והתקלה היא ממצא בפני עצמו.
import { resolveMx, resolveTxt } from "node:dns/promises";
import type { MailHealth } from "../types";
import { registrableDomain } from "./registrable";

export interface MailDeps {
  resolveMx: (host: string) => Promise<{ exchange: string; priority: number }[]>;
  resolveTxt: (host: string) => Promise<string[][]>;
}

// הרזולברים מוזרקים כדי שהבדיקות ירוצו אופליין לחלוטין - לעולם לא DNS אמיתי בבדיקות
// (אותה תבנית הזרקה כמו LookupLike ב-resolve-guard.ts)
export const defaultMailDeps: MailDeps = { resolveMx, resolveTxt };

// קודי DNS שמשמעותם "אין רשומה כזו" - ראו מלכודת 1 בראש הקובץ. כל קוד אחר = לא נבדק
const NO_RECORD_CODES: ReadonlySet<string> = new Set(["ENOTFOUND", "ENODATA"]);

// טביעות אצבע של ספקי דואר לפי שם המארח ב-MX, באותה פילוסופיה של signals.ts: התאמה
// לדומיין תשתית ספציפי של הספק, לא ניחוש ממילים חופשיות. כל תבנית כאן נצפתה מול DNS חי
// (בעיקר על דומיינים ישראליים) - שם ספק שגוי בדוח הוא טענה שקרית על עסק אמיתי.
// שם מארח שלא מתאים לאף תבנית לא מדווח בכלל: אסור להחזיר את ה-MX הגולמי כאילו הוא שם ספק.
const PROVIDER_FINGERPRINTS: readonly { readonly provider: string; readonly re: RegExp }[] = [
  // גוגל: משפחת aspmx.l.google.com (כולל alt1 עד alt4), aspmx2/3.googlemail.com,
  // והרשומה היחידה החדשה smtp.google.com
  { provider: "Google Workspace", re: /(^|\.)aspmx\.l\.google\.com$|(^|\.)googlemail\.com$|^smtp\.google\.com$/ },
  // מיקרוסופט: הצורה הוותיקה mail.protection.outlook.com והחדשה mail.eo.outlook.com
  // (נצפתה חי על aroma.co.il) - שתיהן Exchange Online
  { provider: "Microsoft 365", re: /(^|\.)mail\.(protection|eo)\.outlook\.com$/ },
  { provider: "Zoho Mail", re: /(^|\.)zoho\.(com|eu|in|jp|com\.au|com\.cn)$/ },
  { provider: "Proofpoint", re: /(^|\.)(pphosted\.com|ppe-hosted\.com)$/ },
  { provider: "Mimecast", re: /(^|\.)mimecast(-offshore)?\.com$/ },
  // שערי אבטחת דואר נוספים שנצפו על דומיינים ישראליים גדולים
  { provider: "Cisco Secure Email", re: /(^|\.)iphmx\.com$/ },
  { provider: "Symantec Email Security.cloud", re: /(^|\.)messagelabs\.com$/ },
  { provider: "Forcepoint", re: /(^|\.)mailcontrol\.com$/ },
  { provider: "Trend Micro Email Security", re: /(^|\.)tmes\.trendmicro\.com$/ },
  { provider: "Sophos Email", re: /(^|\.)hydra\.sophos\.com$/ },
  { provider: "Barracuda", re: /(^|\.)barracudanetworks\.com$/ },
  // ספקים ישראליים: inbox.co.il מארח דואר לדומיינים ישראליים (נצפה כ-MX ראשי של
  // upress.co.il), dtnt.email הוא הדואר של DomainTheNet, ושלושת ה-ISP הוותיקים
  // (013 נטוויז'ן, בזק בינלאומי, 012) עדיין מופיעים כ-MX של דומיינים עסקיים
  { provider: "Inbox.co.il", re: /(^|\.)inbox\.co\.il$/ },
  { provider: "DomainTheNet", re: /(^|\.)dtnt\.email$/ },
  { provider: "013 Netvision", re: /(^|\.)013net\.net$/ },
  { provider: "Bezeq International", re: /(^|\.)bezeqint\.net$/ },
  { provider: "012 Smile", re: /(^|\.)012\.net\.il$/ },
  // ספקים בינלאומיים נפוצים נוספים
  { provider: "Amazon SES", re: /^inbound-smtp\.[a-z0-9-]+\.amazonaws\.com$/ },
  { provider: "GoDaddy", re: /(^|\.)secureserver\.net$/ },
  { provider: "Namecheap Private Email", re: /(^|\.)privateemail\.com$/ },
  { provider: "Titan", re: /(^|\.)titan\.email$/ },
  { provider: "Fastmail", re: /(^|\.)messagingengine\.com$/ },
  { provider: "Proton Mail", re: /(^|\.)protonmail\.(ch|com)$/ },
  { provider: "iCloud Mail", re: /(^|\.)mail\.icloud\.com$/ },
  { provider: "OVH", re: /(^|\.)ovh\.net$/ },
  { provider: "Yandex 360", re: /(^|\.)yandex\.(ru|net|com)$/ },
];

// שלוש התוצאות האפשריות של שאילתה, בניגוד לשתיים: הצליחה, אין רשומה, או לא הושלמה.
// המצב השלישי הוא הסיבה שהמודול לא מסתפק ב-try/catch עם false בקאץ'
type Attempt<T> = { readonly done: true; readonly value: T } | { readonly done: false; readonly noRecord: boolean };

function isNoRecordError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && NO_RECORD_CODES.has(code);
}

async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { done: true, value: await run() };
  } catch (err) {
    return { done: false, noRecord: isNoRecordError(err) };
  }
}

// רשומת TXT ארוכה נחתכת למקטעים של 255 בתים, ולכן resolveTxt מחזיר מערך מקטעים לכל
// רשומה. בדיקה על המקטע הראשון בלבד מפספסת רשומות ארוכות - חיבור לפני ההשוואה הוא חובה
function joinChunks(record: readonly string[]): string {
  return record.join("").trim();
}

// סופרים ולא מסתפקים ב-some: ההפרש בין אחת לשתיים הוא ההפרש בין הגנה שעובדת להגנה
// מבוטלת (ראו מלכודת 4 בראש הקובץ)
function countRecordsStartingWith(records: string[][], prefix: string): number {
  return records.filter((record) => joinChunks(record).toLowerCase().startsWith(prefix)).length;
}

// נרמול שם מארח מ-MX: DNS מחזיר אותו בכל צורת אותיות (webit.co.il מחזיר בפועל
// ASPMX.L.GOOGLE.COM) ולעתים עם נקודה סופית, ובלי נרמול טביעות האצבע היו מפספסות.
// מארח ריק או "." הוא null MX (RFC 7505): הצהרה מפורשת שהדומיין אינו מקבל דואר, ולכן
// הוא אינו נספר כרשומת MX ואינו מועמד לזיהוי ספק
function normalizeExchange(exchange: string): string {
  return exchange.trim().replace(/\.+$/, "").toLowerCase();
}

// הרשימה מגיעה ממוינת לפי priority, כך שהמארח הראשון הוא נתיב הדואר הנכנס בפועל.
// זה משנה כשיש שער אבטחה לפני תיבת הדואר (מקרה חי: upress.io עם Trend Micro לפני
// Microsoft 365) - מדווח מי שמקבל את הדואר ראשון, לא הרשומה שנשלפה במקרה ראשונה
function detectProvider(hosts: readonly string[]): string | undefined {
  for (const host of hosts) {
    for (const { provider, re } of PROVIDER_FINGERPRINTS) {
      if (re.test(host)) return provider;
    }
  }
  return undefined;
}

/**
 * בדיקת תקינות הדואר של דומיין העסק.
 * מחזיר undefined כשאין מה לדווח בכלל: אין דומיין רשום של העסק (IP, שם מארח פגום, או
 * אתר שיושב על פלטפורמה - ראו registrable.ts), או שכל השאילתות לא הושלמו.
 * שדה חסר בתוצאה פירושו "לא נבדק", לעולם לא "אין".
 */
export async function readMailHealth(hostname: string, deps: Partial<MailDeps> = {}): Promise<MailHealth | undefined> {
  const domain = registrableDomain(hostname);
  // בלי דומיין של העסק אין על מה לדווח: רשומות הדואר של הפלטפורמה אינן שלו
  if (domain == null) return undefined;

  const mxImpl = deps.resolveMx ?? defaultMailDeps.resolveMx;
  const txtImpl = deps.resolveTxt ?? defaultMailDeps.resolveTxt;

  // שלוש השאילתות במקביל - אין ביניהן תלות, וכל אחת נכשלת בנפרד בלי להפיל את השאר
  const [mx, txt, dmarcTxt] = await Promise.all([
    attempt(() => mxImpl(domain)),
    attempt(() => txtImpl(domain)),
    attempt(() => txtImpl(`_dmarc.${domain}`)),
  ]);

  const mail: MailHealth = {};

  if (mx.done) {
    const hosts = [...mx.value]
      .sort((a, b) => a.priority - b.priority)
      .map((record) => normalizeExchange(record.exchange))
      .filter((host) => host.length > 0);
    // רשומה שהוחזרה כמערך ריק שקולה ל-ENODATA: אין MX. אין כאן שום טענה על תקינות
    // הדואר עצמו - ראו מלכודת 2 בראש הקובץ
    mail.hasMx = hosts.length > 0;
    const provider = detectProvider(hosts);
    if (provider != null) mail.provider = provider;
  } else if (mx.noRecord) {
    mail.hasMx = false;
  }

  // הדגל הנוסף נכתב בדיוק באותם מסלולים שבהם נכתב hasSpf/hasDmarc: כשהשאילתה לא הושלמה
  // שניהם נשארים חסרים ("לא נבדק"), וכשאין רשומה כלל אין גם התנגשות
  if (txt.done) {
    const spf = countRecordsStartingWith(txt.value, "v=spf1");
    mail.hasSpf = spf > 0;
    mail.spfConflict = spf > 1;
  } else if (txt.noRecord) {
    mail.hasSpf = false;
    mail.spfConflict = false;
  }

  if (dmarcTxt.done) {
    const dmarc = countRecordsStartingWith(dmarcTxt.value, "v=dmarc1");
    mail.hasDmarc = dmarc > 0;
    mail.dmarcConflict = dmarc > 1;
  } else if (dmarcTxt.noRecord) {
    mail.hasDmarc = false;
    mail.dmarcConflict = false;
  }

  // כל השאילתות לא הושלמו: אובייקט ריק היה נראה כמו בדיקה שרצה ולא מצאה כלום
  return Object.keys(mail).length === 0 ? undefined : mail;
}
