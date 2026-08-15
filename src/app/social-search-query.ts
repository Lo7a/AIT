import { socialPresenceOf } from "../pipeline/social-hosts";
import { normalizeSiteUrl } from "../pipeline/site-url";

// מקטעי נתיב שאינם שם עסק לעולם: profile.php?id=... (מזהה מספרי גולמי של פייסבוק), pages
// (עמוד "pages/<מספר>" הישן), p (קיצור לפוסט בודד באינסטגרם/פייסבוק, לא לעמוד עסק)
const NON_NAME_SEGMENTS = new Set(["profile.php", "pages", "p"]);

// שם החנייה (vanity slug) בנתיב של קישור חברתי - facebook.com/CafeGreg, instagram.com/some.business
// - הוא לרוב *שם העסק עצמו*, ושווה חיפוש Places אמיתי. לעומת זאת profile.php?id=..., pages/<מספר>,
// נתיב ריק (דומיין חשוף) או wa.me/<טלפון> אין בהם שום שם קריא - חיפוש עם "facebook.com" הגולמי
// (כמו שקרה בבאג שתוקן כאן) מחזיר עסקים לא-קשורים לגמרי, לא מידע. null = "אל תחפשו במפות בכלל"
// (גם לכתובת לא-חברתית, שבה הקורא נופל חזרה לחיפוש לפי דומיין הכתובת עצמו)
export function socialSearchQueryOf(url: string): string | null {
  if (!socialPresenceOf(url)) return null;

  let pathname: string;
  try {
    pathname = normalizeSiteUrl(url).pathname;
  } catch {
    return null;
  }

  const rawSlug = pathname.split("/").filter(Boolean)[0];
  if (!rawSlug) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug; // קידוד פסול - עדיף להשתמש בגולמי מאשר לוותר על שם קריא
  }

  if (NON_NAME_SEGMENTS.has(slug.toLowerCase())) return null;
  if (/^\d+$/.test(slug)) return null; // מזהה מספרי גרידא (טלפון וואטסאפ, מזהה pages ישן) - לא שם

  const spaced = slug.replace(/[-_.]+/g, " ").trim();
  return spaced || null;
}
