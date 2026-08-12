import type { WebsiteSignals } from "../types";
import { defaultFetch, type FetchLike } from "../http";
import { extractSignals, type PageSignals } from "./signals";

export interface CrawlOptions {
  fetchImpl?: FetchLike;
  maxPages?: number;
  timeoutMs?: number;
}

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
  const lower = decodeURIComponent(url).toLowerCase();
  return PRIORITY_KEYWORDS.some((k) => lower.includes(k)) ? 0 : 1;
}

async function fetchPage(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "AIT-Scanner/0.1 (+business diagnosis)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function crawlWebsite(
  siteUrl: string,
  opts: CrawlOptions = {},
): Promise<WebsiteSignals> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const maxPages = opts.maxPages ?? 8;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  // עמוד הבית חייב להצליח — בלעדיו אין סריקת אתר
  const homeHtml = await fetchPage(siteUrl, fetchImpl, timeoutMs);
  const home = extractSignals(homeHtml, siteUrl);

  const merged: PageSignals = { ...home };
  const crawledUrls = [siteUrl];
  // מיון יציב: עמודי מפתח קודם, ובתוך אותה עדיפות — סדר הופעה מקורי
  const queue = [...home.internalLinks].sort((a, b) => priorityOf(a) - priorityOf(b));
  const visited = new Set([siteUrl]);

  for (const url of queue) {
    if (crawledUrls.length >= maxPages) break;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchPage(url, fetchImpl, timeoutMs);
      // baseUrl = כתובת העמוד הנוכחי, לפי החוזה של extractSignals
      const page = extractSignals(html, url);
      for (const key of BOOL_KEYS) merged[key] = merged[key] || page[key];
      merged.platform = merged.platform ?? page.platform;
      crawledUrls.push(url);
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
