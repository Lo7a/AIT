import {
  JS_RENDERED_DETAIL,
  type PageSpeedResult, type PartialFlag, type PlaceDetails, type Review, type ReviewInsights,
  type ScanFindings, type SocialOnly, type WebsiteSignals,
} from "./types";
import type { LlmUsage } from "./llm/client";
import { getPlaceDetails } from "./google/places";
import { runPageSpeed } from "./google/pagespeed";
import { crawlWebsite } from "./crawler/crawl";
import { analyzeReviews } from "./analyze/reviews";
import { socialPresenceOf, socialOnlyDetail } from "./social-hosts";

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
// הערכה גסה לקריאת Places בודדת (חיפוש או פרטים) — נמדד מול החשבונית בשער. LLM = $0 בשכבת החינם; כשייבחר מודל ייצור (9.3) — להוסיף עלות טוקנים
const EST_PLACES_CALL_USD = 0.03;

function reasonOf(r: PromiseRejectedResult): string {
  return (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200);
}

export async function runScan(
  placeId: string,
  deps: ScanDeps = defaultDeps,
  opts: ScanRunOptions = {},
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const partial: PartialFlag[] = [];
  const partialDetails: Partial<Record<PartialFlag, string>> = {};
  let llmUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  // בלי פרטי העסק אין מה לסרוק — כישלון כאן עוצר את האבחון
  const details = await deps.details(placeId);
  const placesCalls = 1 + (opts.priorPlacesCalls ?? 0);

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  let reviewInsights: ReviewInsights | undefined;
  let socialOnly: SocialOnly | undefined;

  // "אתר" שהוא בעצם עמוד ברשת חברתית (ממצא מייסד, אבן דרך 4 משימה 0): מזוהה לפני שמריצים כלום -
  // crawl היה מייצר shell זבל (חומת התחברות) ו-PSI נחסם עליו (429), אז לא שווה בכלל לנסות
  const social = details.website ? socialPresenceOf(details.website) : null;

  // שלושת הצעדים האיטיים רצים במקביל; כל כישלון הופך לדגל partial במקום להפיל את הסריקה.
  // אתר חברתי מדלג על crawl+PSI לגמרי - אין עלות, אין 429, אין אותות זבל
  const crawlPromise: Promise<WebsiteSignals | undefined> = details.website && !social
    ? deps.crawl(details.website)
    : Promise.resolve(undefined);
  const psiPromise: Promise<PageSpeedResult | undefined> = details.website && !social
    ? deps.pagespeed(details.website)
    : Promise.resolve(undefined);
  const reviewsPromise = deps.analyzeReviews(details.reviews);

  const [crawlResult, psiResult, reviewsResult] = await Promise.allSettled([
    crawlPromise, psiPromise, reviewsPromise,
  ]);

  if (!details.website) {
    partial.push("no_website");
  } else if (social) {
    socialOnly = { platform: social.platform, url: details.website };
    partial.push("social_only");
    partialDetails.social_only = socialOnlyDetail(social.platform);
  } else {
    if (crawlResult.status === "fulfilled" && crawlResult.value) {
      websiteSignals = crawlResult.value;
      if (websiteSignals.jsRendered) {
        partial.push("js_rendered");
        partialDetails.js_rendered = JS_RENDERED_DETAIL;
      }
    } else if (crawlResult.status === "rejected") {
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

  // עסק מדורג שאין לו טקסטים של ביקורות — הניתוח ריק גם כשספירת הביקורות גבוהה
  if (reviewInsights && reviewInsights.totalAnalyzed === 0 && !partial.includes("few_reviews")) {
    partial.push("no_review_text");
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
    socialOnly,
    partial,
    partialDetails: Object.keys(partialDetails).length > 0 ? partialDetails : undefined,
    meta: {
      startedAt,
      durationMs: Date.now() - t0,
      placesCalls,
      llmInputTokens: llmUsage.inputTokens,
      llmOutputTokens: llmUsage.outputTokens,
      estCostUsd: placesCalls * EST_PLACES_CALL_USD,
    },
  };
}
