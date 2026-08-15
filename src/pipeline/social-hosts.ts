import { normalizeSiteUrl } from "./site-url";

// זיהוי נוכחות ברשת חברתית שהוצבה בשדה "אתר" (ממצא מייסד, אבן דרך 4 משימה 0): עסקים רבים שמים
// בגוגל את עמוד הפייסבוק/אינסטגרם שלהם כאילו הוא האתר. רשימה סגורה וגלויה, לא היוריסטיקה -
// כל host שלא ברשימה הזו נחשב אתר עצמאי, גם אם לא הצלחנו לטעון אותו (זה תפקידו של has_website).
export interface SocialPresence {
  platform: string;
}

interface SocialHostEntry {
  platform: string;
  // hosts מדויקים (אחרי הסרת www.) שנחשבים תואמים - הראשון ברשימה הוא הקנוני (לצורך מפתח זהות)
  hosts: string[];
  // בסיסי דומיין שכל תת-דומיין שלהם ייחשב תואם לזיהוי (למשל apps.facebook.com) - לא כל פלטפורמה
  // צריכה את זה: wa.me/linktr.ee הם domains ייעודיים בלי תתי-דומיין עסקיים מוכרים
  subdomainOf?: string[];
}

const SOCIAL_HOSTS: SocialHostEntry[] = [
  { platform: "facebook", hosts: ["facebook.com", "m.facebook.com", "business.facebook.com"], subdomainOf: ["facebook.com"] },
  { platform: "instagram", hosts: ["instagram.com"], subdomainOf: ["instagram.com"] },
  { platform: "tiktok", hosts: ["tiktok.com"], subdomainOf: ["tiktok.com"] },
  { platform: "whatsapp", hosts: ["wa.me", "api.whatsapp.com", "web.whatsapp.com"] },
  { platform: "linktree", hosts: ["linktr.ee"] },
  { platform: "linkedin", hosts: ["linkedin.com"], subdomainOf: ["linkedin.com"] },
  { platform: "x", hosts: ["x.com", "twitter.com"], subdomainOf: ["x.com", "twitter.com"] },
  { platform: "youtube", hosts: ["youtube.com"], subdomainOf: ["youtube.com"] },
];

// תווית עברית לתצוגה לבעל העסק - מפתח יחיד לכל הטקסטים שמצטטים פלטפורמה (הערת evidence.ts:
// כפילות של מיפוי כזה בין מודולים היא בדיוק איך נולדים באגים)
export const SOCIAL_PLATFORM_LABEL_HE: Record<string, string> = {
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  tiktok: "טיקטוק",
  whatsapp: "וואטסאפ",
  linktree: "לינקטרי",
  linkedin: "לינקדין",
  x: "X",
  youtube: "יוטיוב",
};

// התאמה גולמית על hostname כבר מנורמל (lowercase, בלי www.) - פנימי, כדי שקוראים שכבר מחזיקים
// hostname (כמו canonicalSocialHost) לא יצטרכו לעבור שוב דרך normalizeSiteUrl (סקירת קוד: double normalize)
function matchSocialHost(hostname: string): SocialPresence | null {
  for (const entry of SOCIAL_HOSTS) {
    if (entry.hosts.includes(hostname)) return { platform: entry.platform };
    if (entry.subdomainOf?.some((base) => hostname.endsWith(`.${base}`))) return { platform: entry.platform };
  }
  return null;
}

// מזהה אם כתובת היא בעצם עמוד ברשת חברתית ולא אתר עצמאי. לא זורק על קלט פסול - זה פרדיקט סיווג,
// לא נרמול זהות (בניגוד ל-websiteKeyOf); כתובת שלא מנרמלת פשוט אינה נוכחות חברתית מוכרת
export function socialPresenceOf(url: string): SocialPresence | null {
  let hostname: string;
  try {
    hostname = normalizeSiteUrl(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  return matchSocialHost(hostname);
}

// כינויי תת-דומיין ידועים לנוכחות חברתית (www. כבר מטופל גנרית בכל host, כולל לא-חברתי, לפני
// שמגיעים לכאן) - m.facebook.com/web.whatsapp.com/business.facebook.com הם אותה נוכחות בדיוק
// כמו הדומיין הבסיסי, לא ישות נפרדת (סקירת קוד m3: בניגוד למדיניות "תת-דומיין שונה = עסק שונה"
// שחלה על אתרים עצמאיים - שם תת-דומיין באמת יכול להיות עסק/חנות נפרדים; כאן זו רק תשתית טכנית
// של אותה פלטפורמה: קליינט מובייל/ווב/עסקי לאותו עמוד)
const SOCIAL_ALIAS_PREFIXES = ["m.", "web.", "business."];

// host קנוני לצורך מפתח זהות (websiteKeyOf): מקפל כינוי תת-דומיין ידוע לבסיס - null אם לא חברתי בכלל.
// hostnameNoWww כבר עבר הסרת www. אצל הקורא (websiteKeyOf) כדי לא לנרמל את אותה כתובת פעמיים
export function canonicalSocialHost(hostnameNoWww: string): string | null {
  const social = matchSocialHost(hostnameNoWww);
  if (!social) return null;
  for (const prefix of SOCIAL_ALIAS_PREFIXES) {
    if (hostnameNoWww.startsWith(prefix)) {
      const stripped = hostnameNoWww.slice(prefix.length);
      // רק אם מה שנשאר אחרי קילוף הכינוי עדיין מזוהה כאותה פלטפורמה בדיוק - לא ניחוש עיוור
      if (matchSocialHost(stripped)?.platform === social.platform) return stripped;
    }
  }
  return hostnameNoWww;
}

// מקטעי path שהם "קונטיינר" גנרי - מקטע ה-path הראשון לבדו (pages/p/company/in) לא מזהה עמוד
// ספציפי, המזהה האמיתי הוא המקטע השני (שם/מזהה בתוך הקונטיינר). רלוונטי לכמה פלטפורמות בבת אחת
// (facebook /pages/*, /p/*; instagram /p/*; linkedin /company/*, /in/*) - הרשימה גלויה ולא תלוית host
const CONTAINER_SEGMENTS = new Set(["pages", "p", "company", "in"]);

// מקטעי path שהזהות האמיתית שלהם יושבת ב-query string, לא בפועל ה-path - "profile.php" חוזר על עצמו
// בכל עמוד פייסבוק ישן (המזהה האמיתי הוא id=), וכך גם send (וואטסאפ, phone=) ו-watch (יוטיוב, v=).
// ממצא סקירה M1: בלי זה שני עמודים כאלה מתלכדים לאותו מפתח, בדיוק כמו הבאג המקורי בלי path בכלל
const QUERY_PARAM_BY_SEGMENT: Record<string, string> = {
  "profile.php": "id",
  send: "phone",
  watch: "v",
};

// מקטע הזהות של עמוד/פרופיל חברתי בתוך host חברתי נתון - הקורא (websiteKeyOf) כבר וידא שזה host
// חברתי; מקבל URL מנורמל (לא string) כדי לא לנרמל את אותה כתובת שוב (סקירת קוד: double normalize)
export function identityPathOf(url: URL): string | null {
  const segments = url.pathname.split("/").filter((seg) => seg.length > 0);
  const first = segments[0]?.toLowerCase();
  if (!first) return null;

  const paramName = QUERY_PARAM_BY_SEGMENT[first];
  if (paramName) {
    const value = url.searchParams.get(paramName);
    return value ? `${first}?${paramName}=${value}` : first;
  }
  if (CONTAINER_SEGMENTS.has(first) && segments[1]) {
    return `${first}/${segments[1].toLowerCase()}`;
  }
  return first;
}

// טקסט הערת האיסוף האחיד (partialDetails.social_only + אירועי הסריקה החיה) - נוסח קבוע מהתוכנית,
// מקום אחד כדי שלא ייסחפו שני ניסוחים שונים לאותה עובדה
export function socialOnlyDetail(platform: string): string {
  const label = SOCIAL_PLATFORM_LABEL_HE[platform] ?? platform;
  return `הנוכחות הדיגיטלית היא עמוד ${label} - אין אתר עצמאי לסריקה`;
}
