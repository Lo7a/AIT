import type { HealthSignals } from "../types";
import { readDomainHealth } from "./domain-age";
import { readMailHealth } from "./dns-mail";
import { readSafeBrowsing } from "./safe-browsing";

// שלוש בדיקות עצמאיות שרצות במקביל: תוקף רישום הדומיין, תקינות הדואר, וסימון ברשימת
// האתרים המסוכנים של גוגל. הבדיקה הרביעית, סימון schema.org, נקראת בזמן הזחילה מתוך
// ה-HTML שכבר הורד (crawler/crawl.ts) ומצטרפת לכאן ב-scan.ts.
//
// אף בדיקה לא מפילה את חברתה ואף אחת לא מפילה סריקה: allSettled, וכישלון פירושו שדה
// חסר. שדה חסר = "לא נבדק" בחוקי הניקוד, לעולם לא "אין" - זה כל ההבדל.
export async function collectHealth(website: string | undefined): Promise<HealthSignals | undefined> {
  if (!website) return undefined;

  const [domain, mail, safeBrowsing] = await Promise.allSettled([
    readDomainHealth(website),
    readMailHealth(website),
    readSafeBrowsing(website),
  ]);

  const out: HealthSignals = {};
  if (domain.status === "fulfilled" && domain.value != null) out.domain = domain.value;
  if (mail.status === "fulfilled" && mail.value != null) out.mail = mail.value;
  if (safeBrowsing.status === "fulfilled" && safeBrowsing.value != null) out.safeBrowsing = safeBrowsing.value;

  return Object.keys(out).length > 0 ? out : undefined;
}
