import type { PageSpeedResult } from "../types";
import { defaultFetch, readErrorBody, type FetchLike } from "../http";

export interface PageSpeedOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// PSI איטי במיוחד — מריץ Lighthouse אמיתי על האתר
const TIMEOUT_MS = 60_000;

export async function runPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
): Promise<PageSpeedResult> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  const fetchImpl = opts.fetchImpl ?? defaultFetch;

  const params = new URLSearchParams({ url, strategy: "mobile" });
  params.append("category", "PERFORMANCE");
  params.append("category", "SEO");
  // ב-API הזה המפתח עובר ב-query — זו הדרך היחידה ש-PSI תומך בה; בלי מפתח יש מכסה נמוכה
  if (apiKey) params.set("key", apiKey);

  const res = await fetchImpl(`${PSI_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`PageSpeed HTTP ${res.status}: ${await readErrorBody(res)}`);
  const body = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number }; seo?: { score?: number } };
      audits?: { "largest-contentful-paint"?: { numericValue?: number } };
    };
  };
  const categories = body.lighthouseResult?.categories;
  const lcp = body.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
  return {
    performanceScore:
      categories?.performance?.score != null ? Math.round(categories.performance.score * 100) : undefined,
    seoScore: categories?.seo?.score != null ? Math.round(categories.seo.score * 100) : undefined,
    lcpMs: lcp != null ? Math.round(lcp) : undefined,
  };
}
