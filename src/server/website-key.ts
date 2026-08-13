import { normalizeSiteUrl } from "../pipeline/scan-website";

// מפתח הזהות של עסק אתר-בלבד (שער 2א, דרישה 3): host מנורמל — lowercase, בלי www.
// ה-path נזרק בכוונה: ב-MVP עסק = דומיין (שני עמודים באותו דומיין הם אותו עסק);
// תת-דומיינים שונים נשארים מפתחות שונים (חנות מול אתר תדמית יכולים להיות עסקים שונים).
export function websiteKeyOf(input: string): string {
  return normalizeSiteUrl(input).hostname.toLowerCase().replace(/^www\./, "");
}
