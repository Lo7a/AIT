import type {
  PageSpeedResult, PlaceDetails, Review, ReviewInsights, ScanFindings, WebsiteSignals,
} from "./types";
import type { LlmUsage } from "./llm/client";
import { getPlaceDetails } from "./google/places";
import { runPageSpeed } from "./google/pagespeed";
import { crawlWebsite } from "./crawler/crawl";
import { analyzeReviews } from "./analyze/reviews";

export interface ScanDeps {
  details: (placeId: string) => Promise<PlaceDetails>;
  crawl: (siteUrl: string) => Promise<WebsiteSignals>;
  pagespeed: (siteUrl: string) => Promise<PageSpeedResult>;
  analyzeReviews: (reviews: Review[]) => Promise<{ insights: ReviewInsights; usage: LlmUsage }>;
}

export interface ScanRunOptions {
  // קריאות Places שבוצעו לפני runScan (חיפוש העסק ב-CLI) — נספרות בעלות
  priorPlacesCalls?: number;
}

export const defaultDeps: ScanDeps = {
  details: (placeId) => getPlaceDetails(placeId),
  crawl: (siteUrl) => crawlWebsite(siteUrl),
  pagespeed: (siteUrl) => runPageSpeed(siteUrl),
  analyzeReviews: (reviews) => analyzeReviews(reviews),
};

const FEW_REVIEWS_THRESHOLD = 5;
// הערכה גסה לקריאת Places (חיפוש/פרטים) — נמדד מול החשבונית בשער.
// LLM = $0 בשכבת החינם של הפיתוח; כשייבחר מודל ייצור (סעיף 9.3) — להוסיף כאן את עלות הטוקנים
const EST_PLACES_DETAILS_USD = 0.03;

function reasonOf(r: PromiseRejectedResult): string {
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}

export async function runScan(
  placeId: string,
  deps: ScanDeps = defaultDeps,
  opts: ScanRunOptions = {},
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const partial: string[] = [];
  const partialDetails: Record<string, string> = {};
  let llmUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  // בלי פרטי העסק אין מה לסרוק — כישלון כאן עוצר את האבחון
  const details = await deps.details(placeId);
  const placesCalls = 1 + (opts.priorPlacesCalls ?? 0);

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  let reviewInsights: ReviewInsights | undefined;

  // שלושת הצעדים האיטיים רצים במקביל; כל כישלון הופך לדגל partial במקום להפיל את הסריקה
  const crawlPromise: Promise<WebsiteSignals | undefined> = details.website
    ? deps.crawl(details.website)
    : Promise.resolve(undefined);
  const psiPromise: Promise<PageSpeedResult | undefined> = details.website
    ? deps.pagespeed(details.website)
    : Promise.resolve(undefined);
  const reviewsPromise = deps.analyzeReviews(details.reviews);

  const [crawlResult, psiResult, reviewsResult] = await Promise.allSettled([
    crawlPromise, psiPromise, reviewsPromise,
  ]);

  if (!details.website) {
    partial.push("no_website");
  } else {
    if (crawlResult.status === "fulfilled" && crawlResult.value) websiteSignals = crawlResult.value;
    else if (crawlResult.status === "rejected") {
      partial.push("crawl_failed");
      partialDetails.crawl_failed = reasonOf(crawlResult);
    }
    if (psiResult.status === "fulfilled" && psiResult.value) pageSpeed = psiResult.value;
    else if (psiResult.status === "rejected") {
      partial.push("pagespeed_failed");
      partialDetails.pagespeed_failed = reasonOf(psiResult);
    }
  }

  // Places מחזיר מדגם של עד 5 ביקורות — הדגל נמדד מול ספירת הביקורות האמיתית של העסק
  if ((details.reviewCount ?? details.reviews.length) < FEW_REVIEWS_THRESHOLD) partial.push("few_reviews");

  if (reviewsResult.status === "fulfilled") {
    reviewInsights = reviewsResult.value.insights;
    llmUsage = reviewsResult.value.usage;
  } else {
    partial.push("review_analysis_failed");
    partialDetails.review_analysis_failed = reasonOf(reviewsResult);
  }

  return {
    business: {
      placeId: details.placeId,
      name: details.name,
      phone: details.phone,
      website: details.website,
      rating: details.rating,
      reviewCount: details.reviewCount,
    },
    websiteSignals,
    pageSpeed,
    reviewInsights,
    partial,
    partialDetails: Object.keys(partialDetails).length > 0 ? partialDetails : undefined,
    meta: {
      startedAt,
      durationMs: Date.now() - t0,
      placesCalls,
      llmInputTokens: llmUsage.inputTokens,
      llmOutputTokens: llmUsage.outputTokens,
      estCostUsd: placesCalls * EST_PLACES_DETAILS_USD,
    },
  };
}
