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

export const defaultDeps: ScanDeps = {
  details: (placeId) => getPlaceDetails(placeId),
  crawl: (siteUrl) => crawlWebsite(siteUrl),
  pagespeed: (siteUrl) => runPageSpeed(siteUrl),
  analyzeReviews: (reviews) => analyzeReviews(reviews),
};

const FEW_REVIEWS_THRESHOLD = 5;
// הערכה גסה לקריאת Places details עם ביקורות (SKU יקר) — נמדד מול החשבונית בשער
const EST_PLACES_DETAILS_USD = 0.03;

export async function runScan(
  placeId: string,
  deps: ScanDeps = defaultDeps,
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const partial: string[] = [];
  let llmUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  // בלי פרטי העסק אין מה לסרוק — כישלון כאן עוצר את האבחון
  const details = await deps.details(placeId);
  const placesCalls = 1;

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  let reviewInsights: ReviewInsights | undefined;

  // שלושת הצעדים האיטיים רצים במקביל; כל כישלון הופך לדגל partial במקום להפיל את הסריקה
  const crawlPromise = details.website
    ? deps.crawl(details.website)
    : Promise.reject(new Error("no_website"));
  const psiPromise = details.website
    ? deps.pagespeed(details.website)
    : Promise.reject(new Error("no_website"));
  const reviewsPromise = deps.analyzeReviews(details.reviews);

  const [crawlResult, psiResult, reviewsResult] = await Promise.allSettled([
    crawlPromise, psiPromise, reviewsPromise,
  ]);

  if (!details.website) {
    partial.push("no_website");
  } else {
    if (crawlResult.status === "fulfilled") websiteSignals = crawlResult.value;
    else partial.push("crawl_failed");
    if (psiResult.status === "fulfilled") pageSpeed = psiResult.value;
    else partial.push("pagespeed_failed");
  }

  if (details.reviews.length < FEW_REVIEWS_THRESHOLD) partial.push("few_reviews");

  if (reviewsResult.status === "fulfilled") {
    reviewInsights = reviewsResult.value.insights;
    llmUsage = reviewsResult.value.usage;
  } else {
    partial.push("review_analysis_failed");
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
