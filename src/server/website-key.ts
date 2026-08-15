import { normalizeSiteUrl } from "../pipeline/site-url";
import { canonicalSocialHost, identityPathOf } from "../pipeline/social-hosts";

// מפתח הזהות של עסק אתר-בלבד (שער 2א, דרישה 3): host מנורמל - lowercase, בלי www.
// ה-path נזרק בכוונה: ב-MVP עסק = דומיין (שני עמודים באותו דומיין הם אותו עסק);
// תת-דומיינים שונים נשארים מפתחות שונים (חנות מול אתר תדמית יכולים להיות עסקים שונים).
//
// יוצא מן הכלל (אבן דרך 4, משימה 0+סקירת קוד): דומיין חברתי (facebook.com וכו') הוא לא "עסק אחד
// לכל הדומיין" - אלפי עסקים שונים חולקים אותו host. לדומיין חברתי מוסיפים את מקטע הזהות של העמוד
// הספציפי (identityPathOf - לפעמים זה יותר ממקטע path אחד, ולפעמים המזהה האמיתי הוא ב-query string,
// ראו social-hosts.ts) וגם מקפלים כינויי תת-דומיין ידועים (m./web./business., canonicalSocialHost) כדי
// ש-m.facebook.com/x ו-facebook.com/x לא ייחשבו שני עסקים. דומיין חברתי חשוף בלי path נשאר כמו היום.
export function websiteKeyOf(input: string): string {
  const url = normalizeSiteUrl(input); // נרמול יחיד - גם identityPathOf וגם ה-host נגזרים מאותו url
  const hostNoWww = url.hostname.toLowerCase().replace(/^www\./, "");
  const canonicalHost = canonicalSocialHost(hostNoWww);
  if (canonicalHost) {
    const identity = identityPathOf(url);
    return identity ? `${canonicalHost}/${identity}` : canonicalHost;
  }
  return hostNoWww;
}
