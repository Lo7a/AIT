import type { WebsiteSignals } from "../types";
import { defaultFetch, type FetchLike } from "../http";
import { extractSignals, type PageSignals } from "./signals";

export interface CrawlOptions {
  fetchImpl?: FetchLike;
  maxPages?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_PAGES = 8;
const DEFAULT_TIMEOUT_MS = 10_000;
// עמודים שנכשלים לא מקדמים את מונה ההצלחות — לכן חוסמים גם את מספר הניסיונות הכולל
const EXTRA_ATTEMPTS = 4;

// מילות מפתח שמקדמות עמוד בתור — העמודים שהכי מלמדים על העסק
const PRIORITY_KEYWORDS = [
  "contact", "about", "service", "price", "book",
  "קשר", "אודות", "שירות", "מחיר", "תור",
];

const BOOL_KEYS = [
  "hasContactForm", "hasWhatsappLink", "hasPhoneLink", "hasEmailLink",
  "hasOnlineBooking", "hasChatWidget", "hasFacebookPixel", "hasGoogleAnalytics",
] as const;

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

async function fetchPage(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<FetchedPage> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "AIT-Scanner/0.1 (+business diagnosis)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers?.get?.("content-type") ?? "";
  // עמוד שאינו HTML (למשל PDF בלי סיומת) — לא סורקים; כשאין header (מוקים) מקבלים
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    throw new Error(`non-HTML content-type "${contentType}" for ${url}`);
  }
  return { html: await res.text(), finalUrl: res.url || url }; // res.url ריק במוקים של המבחנים
}

export async function crawlWebsite(
  siteUrl: string,
  opts: CrawlOptions = {},
): Promise<WebsiteSignals> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // עמוד הבית חייב להצליח — בלעדיו אין סריקת אתר
  const homePage = await fetchPage(siteUrl, fetchImpl, timeoutMs);
  // עובדים עם הכתובת הסופית (אחרי redirect) — אחרת בדיקת same-origin פוסלת את כל הקישורים
  const homeUrl = homePage.finalUrl;
  const home = extractSignals(homePage.html, homeUrl);

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
    if (crawledUrls.length >= maxPages || attempts >= maxPages + EXTRA_ATTEMPTS) break;
    if (visited.has(url)) continue;
    visited.add(url);
    attempts++;
    try {
      const page = await fetchPage(url, fetchImpl, timeoutMs);
      // baseUrl = הכתובת הסופית של העמוד הנוכחי, לפי החוזה של extractSignals
      const signals = extractSignals(page.html, page.finalUrl);
      for (const key of BOOL_KEYS) merged[key] = merged[key] || signals[key];
      merged.platform = merged.platform ?? signals.platform;
      visited.add(page.finalUrl);
      crawledUrls.push(page.finalUrl || url);
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
  };
}
