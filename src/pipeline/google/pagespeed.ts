import type { PageSpeedRawTrimmed, PageSpeedResult } from "../types";
import { defaultFetch, readErrorBody, type FetchLike } from "../http";
import { forbiddenHostOf } from "../forbidden-host";

export interface PageSpeedOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

const PSI_URL = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";
// PSI איטי במיוחד - מריץ Lighthouse אמיתי על האתר
const TIMEOUT_MS = 60_000;
// חלון הניסיון החוזר קצר יותר מהראשון: 60s + 30s = 90s, בדיוק תקציב "סריקה מלאה" מהספק
const RETRY_TIMEOUT_MS = 30_000;

// מדדי הליבה שאנחנו שומרים מתוך עץ ה-audits העצום (אבן דרך 4, משימה 0.7) - לא כל העץ (מגה-בייטים,
// כולל opportunities/details לכל audit) אלא רק המספרים של Core Web Vitals + FCP/Speed Index
const CORE_METRIC_AUDITS = [
  "largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time",
  "first-contentful-paint", "speed-index",
] as const;

type PsiResponseBody = {
  loadingExperience?: unknown;
  lighthouseResult?: {
    runtimeError?: { code?: string; message?: string };
    categories?: { performance?: { score?: number }; seo?: { score?: number }; accessibility?: { score?: number } };
    audits?: Record<string, { numericValue?: number } | undefined>;
  };
};

// raw מקוצץ: קטגוריות+מדדי ליבה+חוויית טעינה בלבד - לא עץ ה-audits המלא (ראו PageSpeedRawTrimmed)
function trimRaw(body: PsiResponseBody): PageSpeedRawTrimmed | undefined {
  const lr = body.lighthouseResult;
  if (!lr) return undefined;
  const metrics: Record<string, number> = {};
  for (const id of CORE_METRIC_AUDITS) {
    const v = lr.audits?.[id]?.numericValue;
    if (v != null) metrics[id] = v;
  }
  return { categories: lr.categories, metrics, loadingExperience: body.loadingExperience };
}

async function attemptPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
  timeoutMs: number = TIMEOUT_MS,
): Promise<PageSpeedResult> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  const fetchImpl: FetchLike = opts.fetchImpl ?? defaultFetch;

  // דומיין בעל תווים לא-לטיניים (למשל סבא-אדוארד.ישראל) חייב להישלח ל-PSI בצורת
  // ה-ASCII שלו (punycode) - Lighthouse מחזיר INVALID_URL על התצורה היוניקודית.
  // new URL() מנרמל את ה-host אוטומטית; כתובת שלא נפרסת נשלחת כפי שהיא והכשל
  // המקורי של PSI ידווח כרגיל בהערות האיסוף
  let normalizedUrl = url;
  try {
    normalizedUrl = new URL(url).href;
  } catch {
    /* נשלח כמו שהוא */
  }

  const params = new URLSearchParams({ url: normalizedUrl, strategy: "mobile" });
  params.append("category", "PERFORMANCE");
  params.append("category", "SEO");
  // תכונת עמידה בדין הישראלי (הצהרת נגישות + בדיקת נגישות אוטומטית) - קטגוריית ACCESSIBILITY
  // של Lighthouse משמשת כאן כאיתות נוסף בממד "נגישות ללקוח" (dimensions.ts)
  params.append("category", "ACCESSIBILITY");
  // המפתח בכותרת x-goog-api-key ולעולם לא ב-URL (מדיניות docs/llm.md: מפתח ב-URL מודלף ללוגים),
  // בדיוק כמו places.ts ו-llm/client.ts. נבדק חי מול PSI ב-2026-08-15: קריאה עם המפתח בכותרת
  // בלבד החזירה 200 עם עץ Lighthouse מלא. בלי מפתח הקריאה עדיין עובדת אבל במכסה נמוכה
  const headers: Record<string, string> = apiKey ? { "x-goog-api-key": apiKey } : {};

  const res = await fetchImpl(`${PSI_URL}?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`PageSpeed HTTP ${res.status}: ${await readErrorBody(res)}`);
  const body = (await res.json()) as PsiResponseBody;
  // PSI מחזיר 200 גם כשהוא נכשל לטעון את האתר - runtimeError הוא הכישלון האמיתי
  const runtimeError = body.lighthouseResult?.runtimeError;
  if (runtimeError) {
    throw new Error(`PageSpeed runtime error: ${runtimeError.code ?? "unknown"}`);
  }
  const categories = body.lighthouseResult?.categories;
  const lcp = body.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
  return {
    performanceScore:
      categories?.performance?.score != null ? Math.round(categories.performance.score * 100) : undefined,
    seoScore: categories?.seo?.score != null ? Math.round(categories.seo.score * 100) : undefined,
    accessibilityScore:
      categories?.accessibility?.score != null ? Math.round(categories.accessibility.score * 100) : undefined,
    lcpMs: lcp != null ? Math.round(lcp) : undefined,
    raw: trimRaw(body),
  };
}

function isTimeoutError(err: unknown): boolean {
  // AbortError נוסף כאן כי בגרסאות ישנות יותר של undici ביטול (abort) נדחה עם השם "AbortError" ולא "TimeoutError"
  // אזהרה קדימה: אם PageSpeedOptions יקבל אי-פעם signal מהצד הקורא, יש לבחון מחדש את התנאי הזה -
  // אחרת ביטול מכוון של הקורא (לא טיים-אאוט) ייכנס גם הוא לניסיון חוזר
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function runPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
): Promise<PageSpeedResult> {
  // כאן אין SSRF - את ה-fetch לאתר מבצעים השרתים של גוגל, לא אנחנו. הדילוג הוא לעקביות
  // עם הסורק ולחיסכון: קריאת PSI על מארח פנימי היא בזבוז ודאי (גוגל לא תגיע לשם).
  // הכישלון זורם למסלול pagespeed_failed הקיים, כמו כל כישלון PSI אחר
  const blockedHost = forbiddenHostOf(url);
  if (blockedHost) throw new Error(`PageSpeed דולג - מארח חסום (פנימי או מקומי): ${blockedHost}`);
  try {
    return await attemptPageSpeed(url, opts, TIMEOUT_MS);
  } catch (err) {
    // PSI מריץ Lighthouse אמיתי - ריצה ראשונה על אתר "קר" נופלת לעיתים בטיים-אאוט ומצליחה מיד אחריה
    if (isTimeoutError(err)) {
      console.warn("PageSpeed: טיים-אאוט בניסיון הראשון, מנסה שוב עם חלון קצר יותר");
      return attemptPageSpeed(url, opts, RETRY_TIMEOUT_MS);
    }
    throw err;
  }
}
