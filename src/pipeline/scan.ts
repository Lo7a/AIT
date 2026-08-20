import {
  JS_RENDERED_DETAIL,
  type PageSpeedResult, type PartialFlag, type PlaceDetails, type Review, type ReviewInsights,
  type HealthSignals, type ScanFindings, type ScanRawPayload, type SocialOnly, type WebsiteSignals,
} from "./types";
import type { LlmUsage } from "./llm/client";
import { getPlaceDetails } from "./google/places";
import { runPageSpeed } from "./google/pagespeed";
import { crawlWebsite } from "./crawler/crawl";
import { analyzeReviews } from "./analyze/reviews";
import { socialPresenceOf, socialOnlyDetail } from "./social-hosts";
import { collectHealth, type HealthCollectResult, type HealthFailure } from "./health";

export interface ScanDeps {
  details: (placeId: string) => Promise<PlaceDetails>;
  crawl: (siteUrl: string) => Promise<WebsiteSignals>;
  pagespeed: (siteUrl: string) => Promise<PageSpeedResult>;
  analyzeReviews: (reviews: Review[]) => Promise<{ insights: ReviewInsights; usage: LlmUsage }>;
  // בדיקות תקינות הדומיין, הדואר והאבטחה - מוזרק כדי שהבדיקות לא ייגעו ב-DNS או ברשת.
  // מחזיר signals לצד failures - סיבות הכשל של תת-הבדיקות (ראו health/index.ts)
  health: (siteUrl: string) => Promise<HealthCollectResult>;
}

export interface ScanRunOptions {
  // קריאות Places שבוצעו לפני runScan (חיפוש העסק ב-CLI) - נספרות בעלות
  priorPlacesCalls?: number;
}

export const defaultDeps: ScanDeps = {
  details: (placeId) => getPlaceDetails(placeId),
  crawl: (siteUrl) => crawlWebsite(siteUrl),
  pagespeed: (siteUrl) => runPageSpeed(siteUrl),
  analyzeReviews: (reviews) => analyzeReviews(reviews),
  health: (siteUrl) => collectHealth(siteUrl),
};

const FEW_REVIEWS_THRESHOLD = 5;
// הערכה גסה לקריאת Places בודדת (חיפוש או פרטים) - נמדד מול החשבונית בשער. LLM = $0 בשכבת החינם; כשייבחר מודל ייצור (9.3) - להוסיף עלות טוקנים
const EST_PLACES_CALL_USD = 0.03;

function reasonOf(r: PromiseRejectedResult): string {
  return (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200);
}

// דגל ונוסח עברי לכל תת-בדיקת תקינות שנכשלה; הודעת השגיאה המקורית מצורפת לנוסח.
// הטקסטים כאן מתארים כשל איסוף בלבד - אף אחד מהם לא טוען שמשהו רע בעסק
const HEALTH_FAILURE_FLAG: Record<HealthFailure["check"], { flag: PartialFlag; text: string }> = {
  domain: { flag: "health_domain_failed", text: "בדיקת רישום הדומיין נכשלה" },
  mail: { flag: "health_mail_failed", text: "בדיקת רשומות הדואר נכשלה" },
  safeBrowsing: { flag: "health_safebrowsing_failed", text: "בדיקת Safe Browsing נכשלה" },
};

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

  // בלי פרטי העסק אין מה לסרוק - כישלון כאן עוצר את האבחון
  const details = await deps.details(placeId);
  const placesCalls = 1 + (opts.priorPlacesCalls ?? 0);

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  let pageSpeedRaw: PageSpeedResult["raw"];
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
  // בדיקות התקינות זולות ומהירות, אבל מדלגות על אתר חברתי בדיוק כמו crawl ו-PSI:
  // הדומיין שם הוא של פייסבוק, לא של העסק
  const healthPromise: Promise<HealthCollectResult | undefined> = details.website && !social
    ? deps.health(details.website)
    : Promise.resolve(undefined);

  const [crawlResult, psiResult, reviewsResult, healthResult] = await Promise.allSettled([
    crawlPromise, psiPromise, reviewsPromise, healthPromise,
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
    if (psiResult.status === "fulfilled" && psiResult.value) {
      // מפרידים raw מהתוצאה הציבורית: findings.pageSpeed נשאר נקי כמו היום, ה-raw המקוצץ
      // עובר בנפרד ל-findings.raw (אבן דרך 4, משימה 0.7) - בלי לשכפל אותו פעמיים באותה סריקה
      const { raw, ...psData } = psiResult.value;
      pageSpeed = psData;
      pageSpeedRaw = raw;
    } else if (psiResult.status === "rejected") {
      partial.push("pagespeed_failed");
      partialDetails.pagespeed_failed = reasonOf(psiResult);
    }
  }

  // Places מחזיר מדגם של עד 5 ביקורות - הדגל נמדד מול ספירת הביקורות האמיתית של העסק
  if ((details.reviewCount ?? details.reviews.length) < FEW_REVIEWS_THRESHOLD) partial.push("few_reviews");

  if (reviewsResult.status === "fulfilled") {
    reviewInsights = reviewsResult.value.insights;
    llmUsage = reviewsResult.value.usage;
  } else {
    partial.push("review_analysis_failed");
    partialDetails.review_analysis_failed = reasonOf(reviewsResult);
  }

  // עסק מדורג שאין לו טקסטים של ביקורות - הניתוח ריק גם כשספירת הביקורות גבוהה
  if (reviewInsights && reviewInsights.totalAnalyzed === 0 && !partial.includes("few_reviews")) {
    partial.push("no_review_text");
  }

  // placeDetails.raw תמיד נאסף במסלול הזה (Places רץ תמיד כאן, גם ב-socialOnly - רק crawl/PSI
  // מדולגים) - ראו scan-website.ts להשוואה, שם אין בכלל קריאת Places
  const raw: ScanRawPayload | undefined =
    details.raw != null || pageSpeedRaw != null || websiteSignals?.crawledUrls != null
      ? { placeDetails: details.raw, pageSpeed: pageSpeedRaw, crawledUrls: websiteSignals?.crawledUrls }
      : undefined;

  // בדיקות התקינות. כל תת-בדיקה שלא רצה או נכשלה פשוט חסרה, וחוקי הניקוד מדווחים
  // עליה "לא נבדק" - כשל לעולם לא הופך לקביעה שלילית ואין ענישה על חוסר. מה שכן,
  // סיבת הכשל נרשמת בהערות האיסוף (תחקיר 21.8: סריקת ייצור חזרה בלי מפתח health
  // והסיבות נבלעו בשקט) - תיעוד איסוף לתחקור, לא ממצא
  let healthSignals: HealthSignals | undefined;
  if (healthResult.status === "fulfilled") {
    healthSignals = healthResult.value?.signals;
    for (const failure of healthResult.value?.failures ?? []) {
      const { flag, text } = HEALTH_FAILURE_FLAG[failure.check];
      partial.push(flag);
      partialDetails[flag] = `${text}: ${failure.reason}`;
    }
  } else {
    // deps.health עצמו נדחה - אף תת-בדיקה לא הספיקה לדווח, וגם זה לא נבלע
    partial.push("health_failed");
    partialDetails.health_failed = `בדיקות התקינות לא רצו: ${reasonOf(healthResult)}`;
  }
  const health: HealthSignals | undefined =
    healthSignals != null
      ? { ...healthSignals, schema: websiteSignals?.schema }
      : websiteSignals?.schema != null
        ? { schema: websiteSignals.schema }
        : undefined;

  return {
    business: {
      placeId: details.placeId,
      name: details.name,
      phone: details.phone,
      address: details.address,
      website: details.website,
      rating: details.rating,
      reviewCount: details.reviewCount,
      primaryType: details.primaryType,
      types: details.types,
      location: details.location,
    },
    websiteSignals,
    pageSpeed,
    reviewInsights,
    health,
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
    raw,
  };
}
