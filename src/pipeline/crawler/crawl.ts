import type { WebsiteSignals } from "../types";
import { defaultFetch, type FetchLike } from "../http";
import { assertFetchableUrl } from "../forbidden-host";
import { extractSignals, type PageSignals } from "./signals";

export interface CrawlOptions {
  fetchImpl?: FetchLike;
  maxPages?: number;
  timeoutMs?: number;
  budgetMs?: number;
}

const DEFAULT_MAX_PAGES = 8;
const DEFAULT_TIMEOUT_MS = 10_000;
// מכפיל הניסיון השני לעמוד הבית: אתרים אמיתיים איטיים במיוחד (מקרה קמפאי - LCP של 40 שניות)
// מפילים את ה-fetch הראשון על timeout, ובלי עמוד הבית כל אותות האתר אובדים. ניסיון שני
// סבלני אחד (פי 3, ברירת מחדל 30 שניות) עדיף על ויתור מלא; עמודים פנימיים לא מקבלים retry.
const HOME_RETRY_MULTIPLIER = 3;
// עמודים שנכשלים לא מקדמים את מונה ההצלחות — לכן חוסמים גם את מספר הניסיונות הכולל
const EXTRA_ATTEMPTS = 4;
// אנחנו עוקבים אחרי ההפניות בעצמנו (redirect: "manual"), אז החסם הוא שלנו. אתרים אמיתיים
// עושים לכל היותר שתיים-שלוש (http→https→www→נתיב); חמש נדיבה ומספיק כדי לא להיתקע בלולאה
const MAX_REDIRECTS = 5;

// מילות מפתח שמקדמות עמוד בתור — העמודים שהכי מלמדים על העסק
const PRIORITY_KEYWORDS = [
  "contact", "about", "service", "price", "book",
  "קשר", "אודות", "שירות", "מחיר", "תור",
];

const BOOL_KEYS = [
  "hasContactForm", "hasWhatsappLink", "hasPhoneLink", "hasEmailLink",
  "hasOnlineBooking", "hasChatWidget", "hasFacebookPixel", "hasGoogleAnalytics",
] as const;

// סמני אפליקציית JS — תבניות ספציפיות של Next/React/Vue/Angular, לא כל <script>.
// __NEXT_DATA__ ו-id="__next" הם Pages Router; App Router (הדף האמיתי שהניע את המשימה) לא פולט אותם —
// הסמנים שלו הם self.__next_f (hydration) ו-/_next/static/ — לכן שניהם נכללים כאן.
const JS_APP_ROOT_RE =
  /__NEXT_DATA__|self\.__next_f|\/_next\/static\/|data-reactroot|ng-version=|\bid=["']?(?:__next|__nuxt|root|app)\b/;

function priorityOf(url: string): number {
  let lower: string;
  try {
    lower = decodeURIComponent(url).toLowerCase();
  } catch {
    lower = url.toLowerCase(); // % לא תקין בקישור — משווים את הכתובת הגולמית
  }
  return PRIORITY_KEYWORDS.some((k) => lower.includes(k)) ? 0 : 1;
}

interface FetchedPage {
  html: string;
  finalUrl: string;
}

// כאן נמצאת ההגנה מפני SSRF, ובכוונה בשכבת ה-fetch ולא בשכבת ה-API: כל בקשה יוצאת עוברת
// דרך כאן - הכתובת ההתחלתית, כל קפיצת הפניה, וגם אתר שהגיע מ-Places (details.website) שלא
// נבדק בכניסה בכלל. redirect: "manual" כי ברירת המחדל ("follow") הייתה עוקבת אחרי 302
// למארח פנימי בלי שום בדיקה, ואז הסורק היה מנתח את התשובה הפנימית וממשיך לקישורים שבה
// (באג מאומת). נבדק אמפירית ב-Node 22/undici: במצב manual מתקבלת תשובת 3xx אמיתית עם
// כותרת Location קריאה (ולא opaqueredirect ריק), כך שאפשר לעקוב בעצמנו ולבדוק כל קפיצה
async function fetchPage(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<FetchedPage> {
  let currentUrl = url; // המחרוזת המקורית נשמרת כמות שהיא; רק קפיצות הפניה מנורמלות
  for (let hop = 0; ; hop++) {
    const current = assertFetchableUrl(currentUrl); // בדיקת מארח לפני כל בקשה, בלי יוצא מן הכלל
    const res = await fetchImpl(currentUrl, {
      headers: { "User-Agent": "AIT-Scanner/0.1 (+business diagnosis)" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      // ההודעות נושאות שם מארח בלבד (נתון שהתוקף כבר שלח) - לא נתיב, לא פורט, לא query
      if (hop >= MAX_REDIRECTS) throw new Error(`יותר מדי הפניות (מעל ${MAX_REDIRECTS}) עבור ${current.hostname}`);
      const location = res.headers?.get?.("location");
      if (!location) throw new Error(`הפניה ${res.status} בלי כותרת Location עבור ${current.hostname}`);
      void res.body?.cancel().catch(() => {}); // לא קוראים את גוף ההפניה - משחררים את החיבור
      // Location יחסי נפתר מול הכתובת הנוכחית; המארח שהתקבל נבדק מיד, לפני הקפיצה
      currentUrl = assertFetchableUrl(location, current).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${currentUrl}`);
    const contentType = res.headers?.get?.("content-type") ?? "";
    // עמוד שאינו HTML (למשל PDF בלי סיומת) — לא סורקים; כשאין header (מוקים) מקבלים
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new Error(`non-HTML content-type "${contentType}" for ${currentUrl}`);
    }
    // finalUrl = הכתובת האחרונה שנשלחה אליה בקשה בפועל, כך שדדופ ההפניות ובדיקת
    // same-origin של הקישורים ממשיכים לעבוד בדיוק כמו קודם (res.url ריק במוקים של המבחנים)
    return { html: await res.text(), finalUrl: res.url || currentUrl };
  }
}

export async function crawlWebsite(
  siteUrl: string,
  opts: CrawlOptions = {},
): Promise<WebsiteSignals> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + (opts.budgetMs ?? 40_000); // תקציב זמן כולל לסריקה — יעד ה-KPI הוא אבחון שלם מתחת ל-90 שניות

  // עמוד הבית חייב להצליח — בלעדיו אין סריקת אתר. timeout (ורק timeout - לא שגיאות HTTP
  // או תוכן) מקבל ניסיון שני סבלני לפני שמוותרים על האתר כולו
  let homePage: FetchedPage;
  try {
    homePage = await fetchPage(siteUrl, fetchImpl, timeoutMs);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "TimeoutError")) throw err;
    homePage = await fetchPage(siteUrl, fetchImpl, timeoutMs * HOME_RETRY_MULTIPLIER);
  }
  // עובדים עם הכתובת הסופית (אחרי redirect) — אחרת בדיקת same-origin פוסלת את כל הקישורים
  const homeUrl = homePage.finalUrl;
  const home = extractSignals(homePage.html, homeUrl);
  // אפס קישורים פנימיים + שורש אפליקציית JS = התוכן נבנה בדפדפן, ה-HTML הגולמי כמעט ריק
  const jsRendered = home.internalLinks.length === 0 && JS_APP_ROOT_RE.test(homePage.html);

  const merged: Omit<PageSignals, "internalLinks"> = { ...home };
  const crawledUrls = [homeUrl];
  const visited = new Set([siteUrl, homeUrl]);

  // מחשבים עדיפות פעם אחת לכל קישור; מיון יציב שומר סדר מקורי בתוך אותה עדיפות
  const queue = home.internalLinks
    .map((url) => ({ url, priority: priorityOf(url) }))
    .sort((a, b) => a.priority - b.priority)
    .map((entry) => entry.url);

  let attempts = 0;
  for (const url of queue) {
    if (crawledUrls.length >= maxPages || attempts >= maxPages + EXTRA_ATTEMPTS || Date.now() > deadline) break;
    if (visited.has(url)) continue;
    visited.add(url);
    attempts++;
    try {
      const page = await fetchPage(url, fetchImpl, timeoutMs);
      const finalUrl = page.finalUrl || url; // res.url ריק במוקים של המבחנים
      // דדופ על הכתובת הסופית ולא רק על כתובת התור: כשכמה נתיבים מפנים (redirect) לאותו עמוד,
      // הם עמוד אחד ולא כמה. בלי זה /about,/contact,/services שכולם מפנים לעמוד הבית נספרו
      // כארבעה עמודים והזכו את האתר בחוק "אתר רב-עמודי" (multi_page, דורש 4+) שלא הורווח.
      // התנאי finalUrl !== url הכרחי: כתובת התור עצמה נוספה ל-visited לפני ה-fetch, אז בלעדיו
      // כל עמוד שלא הופנה בכלל היה נפסל. הניסיון כבר נספר ב-attempts, אז חסם הבקשות נשמר
      if (finalUrl !== url && visited.has(finalUrl)) continue;
      visited.add(finalUrl);
      // baseUrl = הכתובת הסופית של העמוד הנוכחי, לפי החוזה של extractSignals
      const signals = extractSignals(page.html, finalUrl);
      for (const key of BOOL_KEYS) merged[key] = merged[key] || signals[key];
      merged.platform = merged.platform ?? signals.platform;
      crawledUrls.push(finalUrl);
    } catch {
      // עמוד פנימי שנפל לא מפיל את הסריקה
    }
  }

  return {
    pagesCrawled: crawledUrls.length,
    crawledUrls,
    hasContactForm: merged.hasContactForm,
    hasWhatsappLink: merged.hasWhatsappLink,
    hasPhoneLink: merged.hasPhoneLink,
    hasEmailLink: merged.hasEmailLink,
    hasOnlineBooking: merged.hasOnlineBooking,
    hasChatWidget: merged.hasChatWidget,
    hasFacebookPixel: merged.hasFacebookPixel,
    hasGoogleAnalytics: merged.hasGoogleAnalytics,
    platform: merged.platform,
    jsRendered,
  };
}
