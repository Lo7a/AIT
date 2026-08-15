import { normalizeSiteUrl } from "../pipeline/site-url";
import { socialPresenceOf } from "../pipeline/social-hosts";

// מפתח הזהות של עסק אתר-בלבד (שער 2א, דרישה 3): host מנורמל - lowercase, בלי www.
// ה-path נזרק בכוונה: ב-MVP עסק = דומיין (שני עמודים באותו דומיין הם אותו עסק);
// תת-דומיינים שונים נשארים מפתחות שונים (חנות מול אתר תדמית יכולים להיות עסקים שונים).
//
// יוצא מן הכלל (אבן דרך 4, משימה 0): דומיין חברתי (facebook.com וכו') הוא לא "עסק אחד לכל הדומיין" -
// אלפי עסקים שונים חולקים אותו host. בלי מקטע ה-path הראשון שני עמודי פייסבוק שונים היו מתמזגים
// לאותו מפתח (באג זהות אמיתי, ממצא מייסד). דומיין חברתי חשוף בלי path (למשל "facebook.com" בלבד,
// בלי עמוד ספציפי) נשאר כמו היום - אין מה לבודד.
export function websiteKeyOf(input: string): string {
  const url = normalizeSiteUrl(input);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (socialPresenceOf(url.href)) {
    const firstSegment = url.pathname.split("/").find((seg) => seg.length > 0);
    if (firstSegment) return `${host}/${firstSegment.toLowerCase()}`;
  }
  return host;
}
