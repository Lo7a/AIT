import {
  JS_RENDERED_DETAIL,
  type PageSpeedResult, type PartialFlag, type ScanFindings, type ScanRawPayload, type SocialOnly,
  type WebsiteSignals,
} from "./types";
import { crawlWebsite } from "./crawler/crawl";
import { runPageSpeed } from "./google/pagespeed";
import { normalizeSiteUrl } from "./site-url";
import { socialPresenceOf, socialOnlyDetail } from "./social-hosts";

// נשמר לתאימות לאחור - כל היבואנים הקיימים (כולל מבחנים) ממשיכים לעבוד בלי שינוי.
// המימוש עצמו עבר ל-site-url.ts, מודול-עלה בלי תלות ב-crawler/cheerio (ראו website-key.ts)
export { normalizeSiteUrl } from "./site-url";

export interface WebsiteOnlyDeps {
  crawl: (siteUrl: string) => Promise<WebsiteSignals>;
  pagespeed: (siteUrl: string) => Promise<PageSpeedResult>;
}

export const defaultWebsiteOnlyDeps: WebsiteOnlyDeps = {
  crawl: (siteUrl) => crawlWebsite(siteUrl),
  pagespeed: (siteUrl) => runPageSpeed(siteUrl),
};

function reasonOf(r: PromiseRejectedResult): string {
  return (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200);
}

// אבחון לעסק שאין לו פרופיל Google - סריקת אתר + PageSpeed בלבד, בלי אף קריאת Places
export async function scanWebsiteOnly(
  siteUrl: string,
  deps: WebsiteOnlyDeps = defaultWebsiteOnlyDeps,
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const url = normalizeSiteUrl(siteUrl);
  const partial: PartialFlag[] = ["no_gbp"];
  const partialDetails: Partial<Record<PartialFlag, string>> = {};

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  let pageSpeedRaw: PageSpeedResult["raw"];
  let socialOnly: SocialOnly | undefined;

  // "האתר" שהוזן הוא בעצם עמוד ברשת חברתית (ממצא מייסד, אבן דרך 4 משימה 0) - מדלגים על crawl+PSI
  // לגמרי (shell זבל, PSI נחסם) במקום לנסות ולתעד כישלון שקרי
  const social = socialPresenceOf(url.href);
  if (social) {
    socialOnly = { platform: social.platform, url: url.href };
    partial.push("social_only");
    partialDetails.social_only = socialOnlyDetail(social.platform);
  } else {
    const [crawlResult, psiResult] = await Promise.allSettled([
      deps.crawl(url.href),
      deps.pagespeed(url.href),
    ]);

    if (crawlResult.status === "fulfilled") {
      websiteSignals = crawlResult.value;
      if (websiteSignals.jsRendered) {
        partial.push("js_rendered");
        partialDetails.js_rendered = JS_RENDERED_DETAIL;
      }
    } else {
      partial.push("crawl_failed");
      partialDetails.crawl_failed = reasonOf(crawlResult);
    }

    if (psiResult.status === "fulfilled") {
      // כמו ב-scan.ts: מפרידים raw מהתוצאה הציבורית - findings.pageSpeed נשאר נקי, ה-raw המקוצץ
      // עובר בנפרד ל-findings.raw (אבן דרך 4, משימה 0.7)
      const { raw, ...psData } = psiResult.value;
      pageSpeed = psData;
      pageSpeedRaw = raw;
    } else {
      partial.push("pagespeed_failed");
      partialDetails.pagespeed_failed = reasonOf(psiResult);
    }
  }

  // אין קריאת Places במסלול הזה בכלל - placeDetails תמיד נעדר; ב-socialOnly גם crawl/PSI
  // מדולגים לגמרי אז raw ריק - זה בסדר (אין מה לשמור)
  const raw: ScanRawPayload | undefined =
    pageSpeedRaw != null || websiteSignals?.crawledUrls != null
      ? { pageSpeed: pageSpeedRaw, crawledUrls: websiteSignals?.crawledUrls }
      : undefined;

  return {
    business: {
      placeId: "", // אין פרופיל Google - זה בדיוק הממצא
      name: url.hostname.replace(/^www\./, ""),
      website: url.href,
    },
    websiteSignals,
    pageSpeed,
    reviewInsights: undefined,
    socialOnly,
    partial,
    partialDetails: Object.keys(partialDetails).length > 0 ? partialDetails : undefined,
    meta: {
      startedAt,
      durationMs: Date.now() - t0,
      placesCalls: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
      estCostUsd: 0,
    },
    raw,
  };
}
