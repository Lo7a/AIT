import type { DomainHealth, HealthSignals, MailHealth, SafeBrowsingCheck } from "../types";
import { readDomainHealth } from "./domain-age";
import { readMailHealth } from "./dns-mail";
import { readSafeBrowsing } from "./safe-browsing";

// שלוש בדיקות עצמאיות שרצות במקביל: תוקף רישום הדומיין, תקינות הדואר, וסימון ברשימת
// האתרים המסוכנים של גוגל. הבדיקה הרביעית, סימון schema.org, נקראת בזמן הזחילה מתוך
// ה-HTML שכבר הורד (crawler/crawl.ts) ומצטרפת לכאן ב-scan.ts.
//
// אף בדיקה לא מפילה את חברתה ואף אחת לא מפילה סריקה: allSettled, וכישלון פירושו שדה
// חסר. שדה חסר = "לא נבדק" בחוקי הניקוד, לעולם לא "אין" - זה כל ההבדל.
//
// סיבות הדחייה לא נבלעות יותר (תחקיר 21.8: סריקת ייצור הסתיימה report_ready בלי מפתח
// health בכלל, ובלי שום עקבה שתגיד מי משלוש הבדיקות נפלה ולמה - פורט 43 חסום, DNS של
// סביבת הפונקציות, או מפתח חסר). כל דחייה חוזרת ב-failures עם שם הבדיקה והסיבה,
// ו-scan.ts רושם אותן בהערות האיסוף. תיעוד איסוף בלבד - לא ממצא ולא ענישה.

// כשל של תת-בדיקה אחת: מי נכשלה ולמה. reason הוא הודעת השגיאה המקורית, קטומה
export interface HealthFailure {
  check: "domain" | "mail" | "safeBrowsing";
  reason: string;
}

// signals מתנהג בדיוק כמו ערך ההחזרה הקודם (undefined כשאף עובדה לא נקראה);
// failures מצטרף לצדו ואינו נשמר בתוך findings.health - הוא זורם לדגלי partial בלבד
export interface HealthCollectResult {
  signals?: HealthSignals;
  failures: HealthFailure[];
}

// תת-הבדיקות מוזרקות כדי שבדיקות collectHealth ירוצו אופליין - בלי whois, DNS או רשת
export interface HealthDeps {
  domain: (website: string) => Promise<DomainHealth | undefined>;
  mail: (website: string) => Promise<MailHealth | undefined>;
  safeBrowsing: (website: string) => Promise<SafeBrowsingCheck | undefined>;
}

const defaultDeps: HealthDeps = {
  domain: (website) => readDomainHealth(website),
  mail: (website) => readMailHealth(website),
  safeBrowsing: (website) => readSafeBrowsing(website),
};

// שיקוף של reasonOf ב-scan.ts (אותה קטימה). אין ייבוא משם - scan.ts מייבא מכאן,
// וייבוא הפוך היה יוצר תלות מעגלית
function rejectionReason(reason: unknown): string {
  return (reason instanceof Error ? reason.message : String(reason)).slice(0, 200);
}

export async function collectHealth(
  website: string | undefined,
  deps: Partial<HealthDeps> = {},
): Promise<HealthCollectResult> {
  if (!website) return { failures: [] };
  const impl: HealthDeps = { ...defaultDeps, ...deps };

  const [domain, mail, safeBrowsing] = await Promise.allSettled([
    impl.domain(website),
    impl.mail(website),
    impl.safeBrowsing(website),
  ]);

  const out: HealthSignals = {};
  const failures: HealthFailure[] = [];

  if (domain.status === "fulfilled") {
    if (domain.value != null) out.domain = domain.value;
  } else {
    failures.push({ check: "domain", reason: rejectionReason(domain.reason) });
  }
  if (mail.status === "fulfilled") {
    if (mail.value != null) out.mail = mail.value;
  } else {
    failures.push({ check: "mail", reason: rejectionReason(mail.reason) });
  }
  if (safeBrowsing.status === "fulfilled") {
    if (safeBrowsing.value != null) out.safeBrowsing = safeBrowsing.value;
  } else {
    failures.push({ check: "safeBrowsing", reason: rejectionReason(safeBrowsing.reason) });
  }

  return { signals: Object.keys(out).length > 0 ? out : undefined, failures };
}
