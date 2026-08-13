import {
  JS_RENDERED_DETAIL,
  type PageSpeedResult, type PartialFlag, type ScanFindings, type WebsiteSignals,
} from "./types";
import { crawlWebsite } from "./crawler/crawl";
import { runPageSpeed } from "./google/pagespeed";

export interface WebsiteOnlyDeps {
  crawl: (siteUrl: string) => Promise<WebsiteSignals>;
  pagespeed: (siteUrl: string) => Promise<PageSpeedResult>;
}

export const defaultWebsiteOnlyDeps: WebsiteOnlyDeps = {
  crawl: (siteUrl) => crawlWebsite(siteUrl),
  pagespeed: (siteUrl) => runPageSpeed(siteUrl),
};

function normalizeUrl(input: string): URL {
  const withProto = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withProto); // URL לא-תקין זורק כאן — כישלון מוקדם וברור עדיף על סריקה של זבל
}

function reasonOf(r: PromiseRejectedResult): string {
  return (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200);
}

// אבחון לעסק שאין לו פרופיל Google — סריקת אתר + PageSpeed בלבד, בלי אף קריאת Places
export async function scanWebsiteOnly(
  siteUrl: string,
  deps: WebsiteOnlyDeps = defaultWebsiteOnlyDeps,
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const url = normalizeUrl(siteUrl);
  const partial: PartialFlag[] = ["no_gbp"];
  const partialDetails: Partial<Record<PartialFlag, string>> = {};

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;

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

  if (psiResult.status === "fulfilled") pageSpeed = psiResult.value;
  else {
    partial.push("pagespeed_failed");
    partialDetails.pagespeed_failed = reasonOf(psiResult);
  }

  return {
    business: {
      placeId: "", // אין פרופיל Google — זה בדיוק הממצא
      name: url.hostname.replace(/^www\./, ""),
      website: url.href,
    },
    websiteSignals,
    pageSpeed,
    reviewInsights: undefined,
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
  };
}
