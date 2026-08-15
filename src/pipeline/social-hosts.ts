import { normalizeSiteUrl } from "./site-url";

// זיהוי נוכחות ברשת חברתית שהוצבה בשדה "אתר" (ממצא מייסד, אבן דרך 4 משימה 0): עסקים רבים שמים
// בגוגל את עמוד הפייסבוק/אינסטגרם שלהם כאילו הוא האתר. רשימה סגורה וגלויה, לא היוריסטיקה -
// כל host שלא ברשימה הזו נחשב אתר עצמאי, גם אם לא הצלחנו לטעון אותו (זה תפקידו של has_website).
export interface SocialPresence {
  platform: string;
}

interface SocialHostEntry {
  platform: string;
  // hosts מדויקים (אחרי הסרת www.) שנחשבים תואמים
  hosts: string[];
  // בסיסי דומיין שכל תת-דומיין שלהם ייחשב תואם (למשל business.facebook.com) - לא כל פלטפורמה
  // צריכה את זה: wa.me/linktr.ee הם domains ייעודיים בלי תתי-דומיין עסקיים מוכרים
  subdomainOf?: string[];
}

const SOCIAL_HOSTS: SocialHostEntry[] = [
  { platform: "facebook", hosts: ["facebook.com", "m.facebook.com"], subdomainOf: ["facebook.com"] },
  { platform: "instagram", hosts: ["instagram.com"], subdomainOf: ["instagram.com"] },
  { platform: "tiktok", hosts: ["tiktok.com"], subdomainOf: ["tiktok.com"] },
  { platform: "whatsapp", hosts: ["wa.me", "api.whatsapp.com"] },
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

// מזהה אם כתובת היא בעצם עמוד ברשת חברתית ולא אתר עצמאי. לא זורק על קלט פסול - זה פרדיקט סיווג,
// לא נרמול זהות (בניגוד ל-websiteKeyOf); כתובת שלא מנרמלת פשוט אינה נוכחות חברתית מוכרת
export function socialPresenceOf(url: string): SocialPresence | null {
  let hostname: string;
  try {
    hostname = normalizeSiteUrl(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const entry of SOCIAL_HOSTS) {
    if (entry.hosts.includes(hostname)) return { platform: entry.platform };
    if (entry.subdomainOf?.some((base) => hostname.endsWith(`.${base}`))) return { platform: entry.platform };
  }
  return null;
}

// טקסט הערת האיסוף האחיד (partialDetails.social_only + אירועי הסריקה החיה) - נוסח קבוע מהתוכנית,
// מקום אחד כדי שלא ייסחפו שני ניסוחים שונים לאותה עובדה
export function socialOnlyDetail(platform: string): string {
  const label = SOCIAL_PLATFORM_LABEL_HE[platform] ?? platform;
  return `הנוכחות הדיגיטלית היא עמוד ${label} - אין אתר עצמאי לסריקה`;
}
