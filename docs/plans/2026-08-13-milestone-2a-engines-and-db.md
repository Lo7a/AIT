# אבן דרך 2א — מנוע ציונים, סכמת DB ו-CLI אבחון מלא

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** להפוך `ScanFindings` לאבחון מלא: ציונים דטרמיניסטיים ב-5 ממדים, מודל עסק + מד שלמות, נרטיב LLM בלי מספרים מומצאים, הכול נשמר ל-Supabase לפי מכונת המצבים — מוכח מקצה לקצה ב-CLI לפני שנבנה UI (תוכנית 2ב).

**Architecture:** ממשיכים את פילוסופיית אבן דרך 1 — לוגיקה טהורה ניתנת לבדיקה אופליין, הזרקת תלויות בכל גבול IO, שכבת DB דקה. מנוע הציונים הוא טבלת-חוקים גנרית (חוק = נקודות + ידוע/לא-ידוע + הושג/לא) כך ש-degradation לעסקים דלים יוצא מהמבנה עצמו: חוק שאין לו מידע לא נספר, לא מעניש. ה-LLM כותב נרטיב בלבד; שומר-מספרים חוסם כל ספרה שלא מופיעה בנתונים.

**Tech Stack:** TypeScript ESM, vitest, tsx, Prisma + Supabase Postgres (פרנקפורט, שכבת חינם), pgvector (עמודה מוכנה, שימוש באבן דרך 4), Gemini דרך `completeJSON` הקיים.

**החלטות תכנון (נעולות לתוכנית זו):**
- **Prisma ולא Drizzle/SQL ידני** — מוכר למייסדים מפרויקטים אחרים; pgvector כ-`Unsupported("vector(768)")` (שימוש אמיתי רק באבן דרך 4).
- **Supabase ענן ישירות גם בפיתוח** (שכבת חינם) — בלי Docker מקומי; המבחנים לא נוגעים ב-DB (לוגיקה טהורה + fakes), אז ה-DB חי רק ב-CLI וב-UI.
- **בלי Auth** — שימוש פנימי בלבד ב-MVP. לפני כל חשיפה חיצונית: Supabase Auth.
- **בלי Next.js בתוכנית זו** — המסכים בתוכנית 2ב; ה-CLI `npm run diagnose` הוא ההוכחה מקצה לקצה.
- לקחי ריצת הבונוס (לבן גרופ) נכנסים כאן: retry ל-PSI, דגל `js_rendered`, מסלול אתר-בלבד עם `no_gbp`.

**מבנה קבצים (חדש/משתנה):**

```
src/pipeline/google/pagespeed.ts      ← שינוי: retry על טיים-אאוט
src/pipeline/crawler/crawl.ts         ← שינוי: זיהוי jsRendered
src/pipeline/types.ts                 ← שינוי: jsRendered, דגלים חדשים
src/pipeline/scan.ts                  ← שינוי: דגל js_rendered
src/pipeline/scan-website.ts          ← חדש: scanWebsiteOnly (בלי Places)
src/pipeline/score/types.ts           ← חדש: טיפוסי מנוע הציונים
src/pipeline/score/engine.ts          ← חדש: מנוע חוקים גנרי
src/pipeline/score/dimensions.ts      ← חדש: 5 הממדים + חוקים בעברית
src/pipeline/model/business-model.ts  ← חדש: מודל העסק + מד שלמות + צעד הבא
src/pipeline/report/narrative.ts      ← חדש: נרטיב LLM + שומר מספרים + fallback
src/server/status.ts                  ← חדש: מכונת המצבים של diagnosis
src/server/db.ts                      ← חדש: PrismaClient יחיד
src/server/diagnosis-repo.ts          ← חדש: שכבת שמירה דקה + ממפים טהורים
src/cli-shared.ts                     ← חדש: בחירת מועמד משותפת לשני ה-CLI
src/cli.ts                            ← שינוי: משתמש ב-cli-shared
src/cli-diagnose.ts                   ← חדש: אבחון מלא מקצה לקצה
prisma/schema.prisma                  ← חדש: הסכמה המלאה (ספק 9.5)
prisma/seed.ts                        ← חדש: קטלוג 10 פריטים + בנצ'מרקים
tests/…                               ← מבחן לכל מודול (פירוט במשימות)
docs/milestone-2a-gate.md             ← חדש: שער יציאה
```

---

### משימה 1: retry ל-PageSpeed על טיים-אאוט

לקח מריצת הבונוס: קריאת PSI ראשונה לאתר "קר" נופלת בטיים-אאוט ומצליחה מיד בניסיון שני.

**Files:**
- Modify: `src/pipeline/google/pagespeed.ts`
- Test: `tests/pagespeed.test.ts` (קיים — מוסיפים מבחנים)

- [x] **Step 1: מבחנים נכשלים**

> **הערת as-built (אחרי סקירה):** הקוד שנשלח בפועל חזק מהסניפט כאן — המוקים טיפוסיים (`vi.fn<FetchLike>()`), מבחן ה-retry מוודא גם אותה כתובת וגם AbortSignal טרי, ונוסף מבחן רביעי ל-`TypeError("fetch failed")` (אין retry). המקור המחייב: `tests/pagespeed.test.ts`.

להוסיף ל-`tests/pagespeed.test.ts` (לשמור על המבנה הקיים של הקובץ; `psiOk()` — אם כבר קיים helper דומה בקובץ, להשתמש בו):

```ts
function psiOk() {
  return {
    ok: true, status: 200, text: async () => "",
    json: async () => ({
      lighthouseResult: {
        categories: { performance: { score: 0.4 }, seo: { score: 1 } },
        audits: { "largest-contentful-paint": { numericValue: 8000 } },
      },
    }),
  } as unknown as Response;
}

function timeoutError() {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

describe("PSI retry on timeout", () => {
  it("retries once after a timeout and succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(psiOk());
    const result = await runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl });
    expect(result.performanceScore).toBe(40);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after two consecutive timeouts", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError());
    await expect(runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl })).rejects.toThrow(/timeout/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on a non-timeout failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => "boom", json: async () => ({}),
    } as unknown as Response);
    await expect(runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl })).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/pagespeed.test.ts` → שלושת החדשים FAIL (הראשון כי אין retry).

- [x] **Step 3: מימוש** — ב-`src/pipeline/google/pagespeed.ts` לשנות את שם הפונקציה הקיימת `runPageSpeed` ל-`attemptPageSpeed` (לא מיוצאת), ולהוסיף עוטף:

בעקבות code review: חלון הניסיון החוזר קוצר ל-30 שניות (במקום עוד 60) כדי שסך שני הניסיונות (60+30=90s) לא יחרוג מתקציב "סריקה מלאה" של 90 שניות.

```ts
const TIMEOUT_MS = 60_000;
// חלון הניסיון החוזר קצר יותר מהראשון: 60s + 30s = 90s, בדיוק תקציב "סריקה מלאה" מהספק
const RETRY_TIMEOUT_MS = 30_000;

async function attemptPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
  timeoutMs: number = TIMEOUT_MS,
): Promise<PageSpeedResult> {
  // ... כמו קודם, רק עם AbortSignal.timeout(timeoutMs) במקום קבוע
}

function isTimeoutError(err: unknown): boolean {
  // AbortError נוסף כי בגרסאות ישנות של undici ביטול נדחה עם השם הזה ולא "TimeoutError"
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function runPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
): Promise<PageSpeedResult> {
  try {
    return await attemptPageSpeed(url, opts, TIMEOUT_MS);
  } catch (err) {
    // PSI מריץ Lighthouse אמיתי — ריצה ראשונה על אתר "קר" נופלת לעיתים בטיים-אאוט ומצליחה מיד אחריה
    if (isTimeoutError(err)) {
      console.warn("PageSpeed: טיים-אאוט בניסיון הראשון — מנסה שוב עם חלון קצר יותר");
      return attemptPageSpeed(url, opts, RETRY_TIMEOUT_MS);
    }
    throw err;
  }
}
```

- [x] **Step 4: ירוק** — `npx vitest run tests/pagespeed.test.ts` → PASS (כולל המבחנים הישנים).

- [x] **Step 5: commit** — `git add -A && git commit -m "fix: retry PageSpeed once on timeout (cold-site Lighthouse runs)"`

---

### משימה 2: זיהוי אתר מרונדר-JS (`jsRendered`)

לקח מריצת הבונוס: אתר Next/React מחזיר HTML בלי קישורים ובלי אותות — הזחלן רואה "עמוד אחד, אין כלום" ועלול להסיק בטעות "אין ערוצי קשר". מזהים ומדגלים.

**Files:**
- Modify: `src/pipeline/types.ts`, `src/pipeline/crawler/crawl.ts`, `src/pipeline/scan.ts`
- Test: `tests/crawl.test.ts`, `tests/scan.test.ts` (קיימים — מוסיפים)

- [x] **Step 1: מבחנים נכשלים**

ל-`tests/crawl.test.ts` (להשתמש ב-helper הקיים בקובץ ליצירת mock fetch; אם שמו שונה — להתאים):

```ts
const NEXT_HTML = `<html><head><script src="/_next/static/chunks/main.js"></script></head>
<body><div id="__next"></div></body></html>`;
const BROCHURE_HTML = `<html><body><h1>ברוכים הבאים</h1><p>טלפון: 03-1234567</p></body></html>`;

it("flags jsRendered on a link-less page with a JS-app root marker", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(NEXT_HTML));
  const signals = await crawlWebsite("https://spa.co.il", { fetchImpl });
  expect(signals.jsRendered).toBe(true);
  expect(signals.pagesCrawled).toBe(1);
});

it("does NOT flag a plain single-page brochure site", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(BROCHURE_HTML));
  const signals = await crawlWebsite("https://simple.co.il", { fetchImpl });
  expect(signals.jsRendered).toBe(false);
});
```

ל-`tests/scan.test.ts` (עם ה-deps המזויפים הקיימים בקובץ):

```ts
it("adds a js_rendered partial flag when the crawler flags it", async () => {
  const deps = makeDeps(); // ה-helper הקיים במבחני scan
  deps.crawl = async () => ({ ...fakeSignals(), jsRendered: true });
  const findings = await runScan("place-1", deps);
  expect(findings.partial).toContain("js_rendered");
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/crawl.test.ts tests/scan.test.ts` → FAIL (שדה לא קיים).

- [x] **Step 3: מימוש**

`src/pipeline/types.ts` — להוסיף ל-`WebsiteSignals`:

```ts
  jsRendered?: boolean; // האתר מרונדר בצד לקוח — האותות מה-HTML הגולמי חלקיים, אסור להסיק מהם "אין"
```

ולהרחיב את `PartialFlag`:

```ts
export type PartialFlag =
  | "no_website"
  | "few_reviews"
  | "no_review_text"
  | "crawl_failed"
  | "pagespeed_failed"
  | "review_analysis_failed"
  | "js_rendered"
  | "no_gbp";
```

(`no_gbp` נכנס כבר עכשיו — משמש במשימה 3.)

`src/pipeline/crawler/crawl.ts` — מעל `crawlWebsite` להוסיף:

> **הערת as-built (אחרי סקירה):** הרגקס המקורי כאן פוספס את המקרה האמיתי שהניע את המשימה. `https://www.lavangroup.co.il/` הוא Next.js **App Router**, שלא פולט `__NEXT_DATA__` ולא `id="__next"` — אלה סמנים של Pages Router בלבד. App Router פולט `self.__next_f.push(...)` (hydration) ונתיבי `/_next/static/`. הרגקס הורחב לכלול את שניהם; הגרסה המחייבת בפועל:

```ts
// סמני אפליקציית JS — תבניות ספציפיות של Next/React/Vue/Angular, לא כל <script>
const JS_APP_ROOT_RE =
  /__NEXT_DATA__|self\.__next_f|\/_next\/static\/|data-reactroot|ng-version=|\bid=["']?(?:__next|__nuxt|root|app)\b/;
```

ובתוך `crawlWebsite`, אחרי חישוב `home`:

```ts
  // אפס קישורים פנימיים + שורש אפליקציית JS = התוכן נבנה בדפדפן, ה-HTML הגולמי כמעט ריק
  const jsRendered = home.internalLinks.length === 0 && JS_APP_ROOT_RE.test(homePage.html);
```

ובאובייקט המוחזר להוסיף `jsRendered,`.

`src/pipeline/scan.ts` — אחרי הטיפול ב-`crawlResult` (בתוך ענף ה-`else` של `!details.website`, אחרי שורת ההצבה ל-`websiteSignals`):

```ts
    if (websiteSignals?.jsRendered) {
      partial.push("js_rendered");
      partialDetails.js_rendered = "האתר מרונדר ב-JavaScript — אותות ה-HTML חלקיים";
    }
```

> **הערת as-built (אחרי סקירה):** בפועל הבדיקה מקוננת בתוך ענף ה-`fulfilled` של `crawlResult`, מיד אחרי ההצבה ל-`websiteSignals` (בלי `?.` חוזר), והמחרוזת העברית עברה לקבוע משותף `JS_RENDERED_DETAIL` ב-`types.ts` כדי שמשימה 3 לא תשכפל אותה. המקור המחייב: `src/pipeline/scan.ts`.

- [x] **Step 4: ירוק** — `npx vitest run` → כל הקבצים PASS. `npm run typecheck` נקי.

- [x] **Step 5: commit** — `git commit -am "feat: detect client-rendered sites (jsRendered flag) so missing signals are not misread as gaps"`

---

### משימה 3: מסלול אתר-בלבד — `scanWebsiteOnly`

לקח לבן גרופ: עסק עם אתר ובלי פרופיל גוגל חייב להיכנס למשפך. הפונקציה מקבלת URL ומחזירה `ScanFindings` עם דגל `no_gbp`.

**Files:**
- Create: `src/pipeline/scan-website.ts`
- Test: `tests/scan-website.test.ts`

- [x] **Step 1: מבחן נכשל** — ליצור `tests/scan-website.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scanWebsiteOnly } from "../src/pipeline/scan-website";
import type { WebsiteSignals, PageSpeedResult } from "../src/pipeline/types";

const SIGNALS: WebsiteSignals = {
  pagesCrawled: 3, crawledUrls: ["https://x.co.il/"],
  hasContactForm: true, hasWhatsappLink: false, hasPhoneLink: true, hasEmailLink: false,
  hasOnlineBooking: false, hasChatWidget: false, hasFacebookPixel: false, hasGoogleAnalytics: true,
  jsRendered: false,
};
const PSI: PageSpeedResult = { performanceScore: 40, seoScore: 100, lcpMs: 8000 };

describe("scanWebsiteOnly", () => {
  it("builds findings from crawl+PSI with a no_gbp flag and zero Places cost", async () => {
    const findings = await scanWebsiteOnly("https://www.lavangroup.co.il/", {
      crawl: async () => SIGNALS,
      pagespeed: async () => PSI,
    });
    expect(findings.business.placeId).toBe("");
    expect(findings.business.name).toBe("lavangroup.co.il");
    expect(findings.business.website).toBe("https://www.lavangroup.co.il/");
    expect(findings.partial).toContain("no_gbp");
    expect(findings.websiteSignals).toEqual(SIGNALS);
    expect(findings.pageSpeed).toEqual(PSI);
    expect(findings.reviewInsights).toBeUndefined();
    expect(findings.meta.placesCalls).toBe(0);
    expect(findings.meta.estCostUsd).toBe(0);
  });

  it("normalizes a URL without protocol and keeps js_rendered flag", async () => {
    const findings = await scanWebsiteOnly("lavangroup.co.il", {
      crawl: async () => ({ ...SIGNALS, jsRendered: true }),
      pagespeed: async () => PSI,
    });
    expect(findings.business.website).toBe("https://lavangroup.co.il/");
    expect(findings.partial).toContain("js_rendered");
  });

  it("turns a crawl failure into a crawl_failed flag instead of throwing", async () => {
    const findings = await scanWebsiteOnly("https://x.co.il", {
      crawl: async () => { throw new Error("ECONNREFUSED"); },
      pagespeed: async () => PSI,
    });
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partialDetails?.crawl_failed).toContain("ECONNREFUSED");
    expect(findings.pageSpeed).toEqual(PSI);
  });
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/scan-website.test.ts` → FAIL (מודול לא קיים).

- [x] **Step 3: מימוש** — ליצור `src/pipeline/scan-website.ts`:

```ts
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
  const partialDetails: Record<string, string> = {};

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
```

- [x] **Step 4: ירוק** — `npx vitest run tests/scan-website.test.ts` → PASS.

- [x] **Step 5: commit** — `git commit -am "feat: website-only scan path (no_gbp) so businesses without a Google profile enter the funnel"`

> **הערת as-built (אחרי סקירת איכות):** `normalizeUrl` שונה ל-`normalizeSiteUrl` ויוצא מהמודול (`export`) — משימה 12 חייבת להשתמש באותו נירמול בדיוק כשבונה את שורת ה-`Business` עבור מסלול `--url`, אחרת ריצות חוזרות על אותו אתר בכתיבים שונים (`lavangroup.co.il` מול `https://www.lavangroup.co.il/`) ייצרו שורות עסק כפולות ב-DB. הפונקציה גם התחזקה: `input.trim()` בתחילת העיבוד (רווח מוביל היה זורק קודם), ודחייה מפורשת של סכמות שאינן http/https (`ftp://`, `mailto:` וכו') כדי שלא ייסרק בטעות host שגוי או מחרוזת עם credentials מוטמעים. מבחני הקובץ הורחבו מ-3 ל-7: נירמול ה-href בפועל מועבר ל-deps (לא ה-קלט הגולמי), כישלון כפול של crawl+pagespeed יחד, רווח מוביל, ודחיית סכמה לא נתמכת. המקור המחייב: `src/pipeline/scan-website.ts`, `tests/scan-website.test.ts`.

---

### משימה 4: מכונת המצבים של האבחון

**Files:**
- Create: `src/server/status.ts`
- Test: `tests/status.test.ts`

- [x] **Step 1: מבחן נכשל** — ליצור `tests/status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_STATUSES, canTransition, assertTransition, type DiagnosisStatus,
} from "../src/server/status";

describe("diagnosis state machine", () => {
  it.each([
    ["created", "scanning"],
    ["scanning", "scanned"],
    ["scanning", "created"],        // סריקה נכשלה — מותר לנסות שוב
    ["scanned", "report_ready"],
    ["report_ready", "interviewing"],
    ["report_ready", "roadmap_ready"], // דילוג על הראיון — עיקרון "כלום לא חובה"
    ["interviewing", "roadmap_ready"],
    ["interviewing", "report_ready"],
    ["roadmap_ready", "interviewing"], // חוזרים לראיון, ה-Roadmap יחושב מחדש
  ] as [DiagnosisStatus, DiagnosisStatus][])("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["created", "report_ready"],
    ["created", "created"],
    ["scanned", "scanning"],
    ["roadmap_ready", "created"],
  ] as [DiagnosisStatus, DiagnosisStatus][])("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("assertTransition throws a clear Hebrew error naming both statuses", () => {
    expect(() => assertTransition("created", "roadmap_ready"))
      .toThrow(/created.*roadmap_ready/);
  });

  it("every status is reachable from created (no dead states)", () => {
    const reached = new Set<DiagnosisStatus>(["created"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...reached]) for (const to of DIAGNOSIS_STATUSES) {
        if (!reached.has(to) && canTransition(from, to)) { reached.add(to); grew = true; }
      }
    }
    expect([...reached].sort()).toEqual([...DIAGNOSIS_STATUSES].sort());
  });
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/status.test.ts` → FAIL.

- [x] **Step 3: מימוש** — ליצור `src/server/status.ts`:

```ts
// מכונת המצבים של אבחון (אפיון 9.4): כל מצב תקף בפני עצמו, הראיון לא חוסם
export const DIAGNOSIS_STATUSES = [
  "created", "scanning", "scanned", "report_ready", "interviewing", "roadmap_ready",
] as const;
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

const TRANSITIONS: Record<DiagnosisStatus, readonly DiagnosisStatus[]> = {
  created: ["scanning"],
  scanning: ["scanned", "created"], // created = הסריקה נכשלה, אפשר לנסות שוב
  scanned: ["report_ready"],
  report_ready: ["interviewing", "roadmap_ready"],
  interviewing: ["report_ready", "roadmap_ready"],
  roadmap_ready: ["interviewing"], // חזרה לראיון — ה-Roadmap מחושב מחדש אחריה
};

export function canTransition(from: DiagnosisStatus, to: DiagnosisStatus): boolean {
  // Object.hasOwn — כדי שמפתחות שירשו מהפרוטוטייפ ("toString", "__proto__") יחזירו false ולא יזרקו
  return Object.hasOwn(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from: DiagnosisStatus, to: DiagnosisStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`מעבר סטטוס לא חוקי: ${from} → ${to}`);
  }
}
```

- [x] **Step 4: ירוק** — `npx vitest run tests/status.test.ts` → PASS.

- [x] **Step 5: commit** — `git commit -am "feat: diagnosis state machine (created→scanning→scanned→report_ready→interviewing→roadmap_ready)"`

> **הערת as-built (אחרי סקירת ספק):** הגרסה הראשונה של `canTransition` (`TRANSITIONS[from]?.includes(to) ?? false`) לא הייתה total כפי שתועד — `TRANSITIONS` הוא object literal שיורש מ-`Object.prototype`, אז `from` ששווה לשם מפתח מהפרוטוטייפ (`"__proto__"`, `"toString"`, `"constructor"`, `"hasOwnProperty"` וכו', ה-cast כ-`DiagnosisStatus` בדיוק כמו שעמודת סטטוס לא-מוקלדת ב-DB עלולה למסור) פותר לערך truthy שאינו מערך, ו-`.includes` זורק `TypeError` — `assertTransition` היה חושף שגיאת TypeScript באנגלית שלא נוקבת בשם אף אחד מהסטטוסים, במקום שגיאת הדומיין בעברית. תוקן עם `Object.hasOwn(TRANSITIONS, from)` לפני הגישה, עם 5 מבחני רגרסיה נוספים (מ-15 ל-20 בקובץ). המקור המחייב: `src/server/status.ts`, `tests/status.test.ts`. תצפית עיצובית של הסוקר לעתיד: שימוש חוזר ב-`created` כ"בור קליטה" גם לכישלון סריקה וגם למצב ההתחלתי אומר ש"הסריקה נכשלה" ו"מעולם לא נסרק" לא ניתנים להבחנה ברמת הסטטוס — מקובל ל-MVP; אם ה-UI יצטרך אי-פעם להציג "הסריקה נכשלה" במפורש, יש להוסיף סטטוס ייעודי.

---

### משימה 5: מנוע הציונים — ליבה גנרית

חוק = נקודות + `known` (יש מידע לבדוק?) + `earned`. ציון ממד = נקודות שהושגו ÷ נקודות **הידועות** × 100. ככה עסק דל לא נענש על מה שלא ידוע — זה ה-degradation האלגנטי שהאפיון (6) דורש.

**Files:**
- Create: `src/pipeline/score/types.ts`, `src/pipeline/score/engine.ts`
- Test: `tests/score-engine.test.ts`

- [x] **Step 1: טיפוסים** — ליצור `src/pipeline/score/types.ts` (אין לו מבחן — טיפוסים בלבד):

```ts
import type { ScanFindings } from "../types";

export type DataStatus = "full" | "partial" | "none";
export type DimensionKey =
  | "visibility" | "reputation" | "accessibility" | "infrastructure" | "process";

export interface RuleDef {
  key: string;
  points: number;
  known: (f: ScanFindings) => boolean;   // האם יש בכלל מידע לבדוק את החוק
  earned: (f: ScanFindings) => boolean;  // נבדק רק כאשר known
  gapText: (f: ScanFindings) => string;  // עברית — הפער, ננוסח לבעל העסק
  okText: (f: ScanFindings) => string;   // עברית — מה תקין (אמינות = גם לפרגן)
}

export interface DimensionDef {
  key: DimensionKey;
  label: string;   // עברית לתצוגה
  weight: number;  // 0–1, סכום כל הממדים = 1
  rules: RuleDef[];
}

export interface RuleResult {
  key: string;
  points: number;
  known: boolean;
  earned: boolean;
  text: string; // okText אם הושג, gapText אם לא; "" אם לא ידוע
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  score: number | null; // null = אין שום מידע לממד
  dataStatus: DataStatus;
  rules: RuleResult[];
}

export interface Highlight {
  dimension: DimensionKey;
  ruleKey: string;
  text: string;
  points: number;
}

export interface ScoreReport {
  overall: number | null; // null רק אם אין מידע לאף ממד
  dimensions: DimensionScore[];
  topGaps: Highlight[];      // עד 3, לפי נקודות אבודות
  topStrengths: Highlight[]; // עד 3, לפי נקודות שהושגו
}
```

- [x] **Step 2: מבחן נכשל** — ליצור `tests/score-engine.test.ts` עם ממד סינתטי (לא הממדים האמיתיים — הם במשימה 6):

```ts
import { describe, it, expect } from "vitest";
import { scoreFindings } from "../src/pipeline/score/engine";
import type { DimensionDef } from "../src/pipeline/score/types";
import type { ScanFindings } from "../src/pipeline/types";

// findings מינימלי — החוקים הסינתטיים בוחנים רק את partial
function f(partial: ScanFindings["partial"] = []): ScanFindings {
  return {
    business: { placeId: "p1", name: "עסק" },
    partial,
    meta: { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
  };
}

function dim(rules: DimensionDef["rules"], weight = 1): DimensionDef {
  return { key: "visibility", label: "בדיקה", weight, rules };
}

const rule = (key: string, points: number, known: boolean, earned: boolean) => ({
  key, points,
  known: () => known, earned: () => earned,
  gapText: () => `פער ${key}`, okText: () => `תקין ${key}`,
});

describe("score engine", () => {
  it("scores earned/known*100 and marks full data", () => {
    const report = scoreFindings([dim([rule("a", 60, true, true), rule("b", 40, true, false)])], f());
    expect(report.dimensions[0].score).toBe(60);
    expect(report.dimensions[0].dataStatus).toBe("full");
    expect(report.overall).toBe(60);
  });

  it("ignores unknown rules instead of penalizing (graceful degradation)", () => {
    const report = scoreFindings([dim([rule("a", 50, true, true), rule("b", 50, false, false)])], f());
    expect(report.dimensions[0].score).toBe(100); // 50 מתוך 50 הידועות
    expect(report.dimensions[0].dataStatus).toBe("partial");
  });

  it("returns null score + none status when nothing is known, and excludes from overall", () => {
    const d1 = dim([rule("a", 100, false, false)], 0.5);
    const d2 = { ...dim([rule("b", 100, true, true)], 0.5), key: "reputation" as const };
    const report = scoreFindings([d1, d2], f());
    expect(report.dimensions[0].score).toBeNull();
    expect(report.dimensions[0].dataStatus).toBe("none");
    expect(report.overall).toBe(100); // משוקלל רק על ממדים עם מידע
  });

  it("collects topGaps (known+not-earned) sorted by lost points, max 3", () => {
    const rules = [rule("g1", 10, true, false), rule("g2", 40, true, false),
                   rule("g3", 30, true, false), rule("g4", 20, true, false)];
    const report = scoreFindings([dim(rules)], f());
    expect(report.topGaps.map((g) => g.ruleKey)).toEqual(["g2", "g3", "g4"]);
    expect(report.topGaps[0].text).toBe("פער g2");
  });

  it("collects topStrengths from earned rules", () => {
    const report = scoreFindings([dim([rule("s1", 25, true, true), rule("s2", 75, true, true)])], f());
    expect(report.topStrengths[0].ruleKey).toBe("s2");
  });

  it("overall is null when no dimension has data", () => {
    const report = scoreFindings([dim([rule("a", 100, false, false)])], f());
    expect(report.overall).toBeNull();
  });
});
```

- [x] **Step 3: לוודא כישלון** — `npx vitest run tests/score-engine.test.ts` → FAIL.

- [x] **Step 4: מימוש** — ליצור `src/pipeline/score/engine.ts`:

> **הערת as-built (אחרי סקירת איכות):** דירוג `topGaps`/`topStrengths` הוחלף מ"נקודות גולמיות" ל"השפעה משוקללת" (`points × dimension.weight`). הסיבה: עם המספרים האמיתיים של משימה 6, ממד ה-infrastructure (משקל 0.15) מחזיק את החוקים עתירי-הנקודות ביותר (analytics 30, fb_pixel 25) — דירוג לפי נקודות גולמיות היה מציב "אין פיקסל פייסבוק" מעל פערים בעלי השפעה אמיתית גבוהה יותר על הציון הכולל, כמו whatsapp בממד ה-accessibility (משקל 0.25: 25×0.25=6.25 מול 25×0.15=3.75). זהו הפלט הראשי של המוצר (מסך 3, "3 הפערים המובילים") ומשימה 8 (LLM) מסבירה רק אותם — טעות דירוג כאן מטעה ישירות את בעל העסק. בנוסף, ניתוח מוטציות (mutation testing) הראה ש-5 מתוך 7 מוטציות שורדות את המבחנים המקוריים; נוספו 4 מבחני-נעילה (`tests/score-engine.test.ts`): שקלול+נרמול הציון הכולל, דירוג לפי השפעה משוקללת ולא נקודות גולמיות, אי-הצגת חוקים לא-ידועים כפערים, וגבול 75% המדויק ל-`dataStatus: "full"`.

```ts
import type { ScanFindings } from "../types";
import type {
  DimensionDef, DimensionScore, Highlight, RuleResult, ScoreReport,
} from "./types";

const TOP_COUNT = 3;
// מתחת ל-75% מהנקודות ידועות — הממד מסומן "מידע חלקי" (אפיון 6: לא מענישים על חוסר דאטה)
const FULL_DATA_THRESHOLD = 0.75;

function scoreDimension(def: DimensionDef, f: ScanFindings): DimensionScore {
  const rules: RuleResult[] = def.rules.map((r) => {
    const known = r.known(f);
    const earned = known && r.earned(f);
    return {
      key: r.key,
      points: r.points,
      known,
      earned,
      text: known ? (earned ? r.okText(f) : r.gapText(f)) : "",
    };
  });

  const totalPts = rules.reduce((s, r) => s + r.points, 0);
  const knownPts = rules.filter((r) => r.known).reduce((s, r) => s + r.points, 0);
  const earnedPts = rules.filter((r) => r.earned).reduce((s, r) => s + r.points, 0);

  return {
    key: def.key,
    label: def.label,
    weight: def.weight,
    score: knownPts === 0 ? null : Math.round((earnedPts / knownPts) * 100),
    dataStatus: knownPts === 0 ? "none" : knownPts >= totalPts * FULL_DATA_THRESHOLD ? "full" : "partial",
    rules,
  };
}

export function scoreFindings(defs: DimensionDef[], f: ScanFindings): ScoreReport {
  const dimensions = defs.map((d) => scoreDimension(d, f));

  // ציון כולל משוקלל רק על ממדים שיש להם מידע — המשקולות מנורמלות מחדש
  const scored = dimensions.filter((d): d is DimensionScore & { score: number } => d.score !== null);
  const weightSum = scored.reduce((s, d) => s + d.weight, 0);
  const overall = weightSum === 0
    ? null
    : Math.round(scored.reduce((s, d) => s + d.score * d.weight, 0) / weightSum);

  // דירוג לפי השפעה אמיתית על הציון הכולל: נקודות × משקל הממד — לא נקודות גולמיות
  const highlights = (pick: (r: RuleResult) => boolean): Highlight[] =>
    dimensions
      .flatMap((d) => d.rules.filter(pick).map((r) => ({
        h: { dimension: d.key, ruleKey: r.key, text: r.text, points: r.points },
        impact: r.points * d.weight,
      })))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, TOP_COUNT)
      .map((x) => x.h);

  return {
    overall,
    dimensions,
    topGaps: highlights((r) => r.known && !r.earned),
    topStrengths: highlights((r) => r.earned),
  };
}
```

- [x] **Step 5: ירוק** — `npx vitest run tests/score-engine.test.ts` → PASS. `npm run typecheck` נקי.

- [x] **Step 6: commit** — `git commit -am "feat: generic rule-based score engine with graceful degradation"`

---

### משימה 6: חמשת הממדים האמיתיים

המשקולות מהאפיון (6): נראות 20%, מוניטין 20%, נגישות 25%, תשתית 15%, תהליכים 20%. ממד התהליכים מוגדר כבר עכשיו אך כל חוקיו `known: false` — הוא יתמלא מהראיון באבן דרך 3, ועד אז מוצג "אין מידע" ואינו משוקלל.

**Files:**
- Create: `src/pipeline/score/dimensions.ts`
- Test: `tests/dimensions.test.ts`

- [x] **Step 1: מבחן נכשל** — ליצור `tests/dimensions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DIMENSIONS } from "../src/pipeline/score/dimensions";
import { scoreFindings } from "../src/pipeline/score/engine";
import type { ScanFindings } from "../src/pipeline/types";

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

// עסק עשיר עם אתר מלא — בסגנון אופטיקה בק
const RICH: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה", phone: "04-000", website: "https://x.co.il", rating: 4.9, reviewCount: 80 },
  websiteSignals: {
    pagesCrawled: 8, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
    hasPhoneLink: true, hasEmailLink: true, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress", jsRendered: false,
  },
  pageSpeed: { performanceScore: 46, seoScore: 92, lcpMs: 12700 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [{ theme: "שירות מקצועי", count: 4 }], problemThemes: [] },
  partial: [],
  meta: META,
};

// עסק דל בלי אתר — בסגנון ברכת רחל
const THIN: ScanFindings = {
  business: { placeId: "p2", name: "מאפיה", phone: "08-000", rating: 4.4, reviewCount: 8 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [], problemThemes: [{ theme: "מחירים גבוהים", count: 2 }] },
  partial: ["no_website"],
  meta: META,
};

// אתר-בלבד בלי פרופיל גוגל — בסגנון לבן גרופ
const NO_GBP: ScanFindings = {
  business: { placeId: "", name: "lavangroup.co.il", website: "https://lavangroup.co.il/" },
  websiteSignals: {
    pagesCrawled: 1, crawledUrls: [], hasContactForm: false, hasWhatsappLink: false,
    hasPhoneLink: false, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, jsRendered: true,
  },
  pageSpeed: { performanceScore: 40, seoScore: 100, lcpMs: 8000 },
  partial: ["no_gbp", "js_rendered"],
  meta: META,
};

describe("real dimensions", () => {
  it("weights sum to 1 and every dimension's points sum to 100", () => {
    expect(DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1);
    for (const d of DIMENSIONS) {
      expect(d.rules.reduce((s, r) => s + r.points, 0), d.key).toBe(100);
    }
  });

  it("process dimension has no data until the interview (milestone 3)", () => {
    for (const findings of [RICH, THIN, NO_GBP]) {
      const process = scoreFindings(DIMENSIONS, findings).dimensions.find((d) => d.key === "process")!;
      expect(process.score).toBeNull();
      expect(process.dataStatus).toBe("none");
    }
  });

  it("rich business: overall is a number, slow site and no booking surface as gaps", () => {
    const report = scoreFindings(DIMENSIONS, RICH);
    expect(report.overall).not.toBeNull();
    const gapKeys = report.dimensions.flatMap((d) => d.rules.filter((r) => r.known && !r.earned).map((r) => r.key));
    expect(gapKeys).toContain("online_booking");
    expect(gapKeys).toContain("perf");
    expect(gapKeys).toContain("lcp");
  });

  it("thin business: accessibility is partial (only phone known), not zero", () => {
    const report = scoreFindings(DIMENSIONS, THIN);
    const access = report.dimensions.find((d) => d.key === "accessibility")!;
    expect(access.dataStatus).toBe("partial");
    expect(access.score).toBe(100); // הטלפון קיים — החוק היחיד הידוע הושג
  });

  it("no-GBP business: gbp_exists is the loudest gap, reputation has no data", () => {
    const report = scoreFindings(DIMENSIONS, NO_GBP);
    expect(report.topGaps.map((g) => g.ruleKey)).toContain("gbp_exists");
    const reputation = report.dimensions.find((d) => d.key === "reputation")!;
    expect(reputation.dataStatus).toBe("none");
  });

  it("js_rendered site: website-signal rules are unknown, not failed", () => {
    const report = scoreFindings(DIMENSIONS, NO_GBP);
    const access = report.dimensions.find((d) => d.key === "accessibility")!;
    const whatsapp = access.rules.find((r) => r.key === "whatsapp")!;
    expect(whatsapp.known).toBe(false); // לא "אין וואטסאפ" — פשוט לא יודעים
  });
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/dimensions.test.ts` → FAIL.

- [x] **Step 3: מימוש** — ליצור `src/pipeline/score/dimensions.ts`:

```ts
import type { ScanFindings } from "../types";
import type { DimensionDef } from "./types";

// עזרי "ידוע": מתי מותר בכלל להסיק מהאותות
const noGbp = (f: ScanFindings) => f.partial.includes("no_gbp");
const crawlUsable = (f: ScanFindings) => !!f.websiteSignals && !f.partial.includes("js_rendered");
const reviewsAnalyzed = (f: ScanFindings) => !!f.reviewInsights && f.reviewInsights.totalAnalyzed > 0;
const phoneFound = (f: ScanFindings) => !!f.business.phone || !!f.websiteSignals?.hasPhoneLink;
// "חוזרת" = עולה יותר מפעם אחת במדגם שנבדק, לא כל תמה שצוינה
const recurringProblems = (f: ScanFindings) =>
  (f.reviewInsights?.problemThemes ?? []).filter((t) => t.count >= 2);

const sec = (ms?: number) => ((ms ?? 0) / 1000).toFixed(1);

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "visibility", label: "נראות דיגיטלית", weight: 0.2,
    rules: [
      {
        key: "gbp_exists", points: 20,
        known: () => true, earned: (f) => !noGbp(f),
        gapText: () => "העסק לא קיים במפות גוגל — לקוחות שמחפשים בסביבה פשוט לא מוצאים אותו",
        okText: () => "לעסק פרופיל פעיל בגוגל",
      },
      {
        key: "has_website", points: 20,
        known: () => true,
        // אתר רשום שה-crawl וה-PageSpeed שניהם נכשלו בו הוא ככל הנראה לא זמין גם ללקוח —
        // לא ראוי "לפרגן" עליו כאילו הוא תקין
        earned: (f) => !f.partial.includes("no_website")
          && !(f.partial.includes("crawl_failed") && f.partial.includes("pagespeed_failed")),
        gapText: (f) => f.partial.includes("no_website")
          ? "לעסק אין אתר — אין בית דיגיטלי להפנות אליו לקוחות"
          : "האתר רשום בגוגל אך לא הצלחנו לטעון אותו — ייתכן שהוא לא זמין גם ללקוחות",
        okText: () => "לעסק יש אתר",
      },
      {
        key: "perf", points: 20,
        known: (f) => f.pageSpeed?.performanceScore != null,
        earned: (f) => (f.pageSpeed?.performanceScore ?? 0) >= 70,
        gapText: (f) => `ציון ביצועי מובייל ${f.pageSpeed?.performanceScore}/100 — מתחת ליעד של 70`,
        okText: (f) => `ביצועי מובייל טובים (${f.pageSpeed?.performanceScore}/100)`,
      },
      {
        key: "lcp", points: 15,
        known: (f) => f.pageSpeed?.lcpMs != null,
        earned: (f) => (f.pageSpeed?.lcpMs ?? Infinity) <= 4000,
        gapText: (f) => `העמוד הראשי נטען ${sec(f.pageSpeed?.lcpMs)} שניות — מעל היעד של 4 שניות`,
        okText: (f) => `זמן טעינה תקין (${sec(f.pageSpeed?.lcpMs)} שניות)`,
      },
      {
        key: "seo", points: 10,
        known: (f) => f.pageSpeed?.seoScore != null,
        earned: (f) => (f.pageSpeed?.seoScore ?? 0) >= 90,
        gapText: (f) => `ציון SEO ${f.pageSpeed?.seoScore}/100 — יש כשלים בסיסיים באופטימיזציה למנועי חיפוש`,
        okText: (f) => `בסיס SEO תקין (${f.pageSpeed?.seoScore}/100)`,
      },
      {
        key: "gbp_phone", points: 5,
        known: (f) => !noGbp(f), earned: (f) => !!f.business.phone,
        gapText: () => "אין מספר טלפון בפרופיל גוגל",
        okText: () => "טלפון מופיע בפרופיל גוגל",
      },
      {
        key: "gbp_rating", points: 10,
        known: (f) => !noGbp(f), earned: (f) => f.business.rating != null,
        gapText: () => "עדיין אין דירוג בגוגל — הפרופיל חדש או לא פעיל",
        okText: (f) => `דירוג ${f.business.rating} בגוגל`,
      },
    ],
  },
  {
    key: "reputation", label: "מוניטין וביקורות", weight: 0.2,
    rules: [
      {
        key: "has_reviews", points: 20,
        known: (f) => !noGbp(f), earned: (f) => (f.business.reviewCount ?? 0) >= 5,
        gapText: (f) => {
          const n = f.business.reviewCount ?? 0;
          if (n === 0) return "אין ביקורות בגוגל — לקוח חדש לא רואה שום הוכחה חברתית";
          if (n === 1) return "רק ביקורת אחת בגוגל — מעט מדי בשביל לבנות אמון";
          return `רק ${n} ביקורות בגוגל — מעט מדי בשביל לבנות אמון`;
        },
        okText: (f) => `${f.business.reviewCount} ביקורות בגוגל`,
      },
      {
        key: "review_volume", points: 15,
        known: (f) => !noGbp(f), earned: (f) => (f.business.reviewCount ?? 0) >= 25,
        gapText: () => "מאגר הביקורות קטן — איסוף ביקורות יזום יחזק את הנראות המקומית",
        okText: () => "מאגר ביקורות מכובד",
      },
      {
        key: "rating_good", points: 25,
        known: (f) => f.business.rating != null, earned: (f) => (f.business.rating ?? 0) >= 4.2,
        gapText: (f) => `דירוג ${f.business.rating} — מתחת לרף האמון של 4.2`,
        okText: (f) => `דירוג מצוין: ${f.business.rating}`,
      },
      {
        key: "no_problem_themes", points: 25,
        known: reviewsAnalyzed,
        earned: (f) => recurringProblems(f).length === 0,
        gapText: (f) => `במדגם הביקורות שנבדק חוזרות בעיות: ${recurringProblems(f).slice(0, 2).map((t) => t.theme.slice(0, 80)).join("; ")}`,
        okText: () => "במדגם הביקורות שנבדק לא עולות בעיות חוזרות",
      },
      {
        key: "positive_themes", points: 15,
        known: reviewsAnalyzed,
        earned: (f) => (f.reviewInsights?.positiveThemes.length ?? 0) > 0,
        gapText: () => "לא זוהו חוזקות עקביות בביקורות",
        okText: (f) => `לקוחות מפרגנים: ${f.reviewInsights?.positiveThemes[0]?.theme.slice(0, 80)}`,
      },
    ],
  },
  {
    key: "accessibility", label: "נגישות ללקוח", weight: 0.25,
    rules: [
      {
        key: "phone_available", points: 15,
        // חיובי (נמצא טלפון) תמיד ידוע — זו עובדה שנמצאה, לא מסקנה מהיעדר מידע.
        // שלילי ("אין טלפון") ידוע רק כששני המקורות האפשריים נבדקו בפועל: GBP קיים,
        // וה-crawl עבד (או שאין בכלל אתר לבדוק).
        known: (f) => phoneFound(f) || (!noGbp(f) && (crawlUsable(f) || f.partial.includes("no_website"))),
        earned: phoneFound,
        gapText: () => "לא מצאנו מספר טלפון נגיש ללקוח",
        okText: () => "טלפון נגיש ללקוחות",
      },
      {
        key: "whatsapp", points: 25,
        // גילוי חיובי תקף גם באתר js_rendered — קישור שנמצא הוא נמצא. רק "לא נמצא" דורש crawl אמין.
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasWhatsappLink,
        earned: (f) => !!f.websiteSignals?.hasWhatsappLink,
        gapText: () => "אין קישור וואטסאפ באתר — הערוץ שלקוחות ישראלים מצפים לו",
        okText: () => "וואטסאפ זמין באתר",
      },
      {
        key: "contact_form", points: 15,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasContactForm,
        earned: (f) => !!f.websiteSignals?.hasContactForm,
        gapText: () => "אין טופס יצירת קשר באתר — לידים הולכים לאיבוד",
        okText: () => "יש טופס יצירת קשר",
      },
      {
        key: "online_booking", points: 30,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasOnlineBooking,
        earned: (f) => !!f.websiteSignals?.hasOnlineBooking,
        gapText: () => "אין קביעת תור/הזמנה אונליין — כל תיאום דורש טלפון בשעות הפעילות",
        okText: () => "יש קביעת תור אונליין",
      },
      {
        key: "email_link", points: 15,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasEmailLink,
        earned: (f) => !!f.websiteSignals?.hasEmailLink,
        gapText: () => "אין כתובת אימייל נגישה באתר",
        okText: () => "אימייל נגיש באתר",
      },
    ],
  },
  {
    key: "infrastructure", label: "תשתית דיגיטלית", weight: 0.15,
    rules: [
      {
        key: "analytics", points: 35,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasGoogleAnalytics,
        earned: (f) => !!f.websiteSignals?.hasGoogleAnalytics,
        gapText: () => "אין Google Analytics — העסק עיוור לתנועה באתר שלו",
        okText: () => "יש מדידת תנועה (Analytics)",
      },
      {
        key: "fb_pixel", points: 30,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasFacebookPixel,
        earned: (f) => !!f.websiteSignals?.hasFacebookPixel,
        gapText: () => "אין פיקסל פייסבוק — אי אפשר לעשות רימרקטינג למבקרים",
        okText: () => "פיקסל פייסבוק מותקן",
      },
      {
        key: "chat_widget", points: 20,
        known: (f) => crawlUsable(f) || !!f.websiteSignals?.hasChatWidget,
        earned: (f) => !!f.websiteSignals?.hasChatWidget,
        gapText: () => "אין צ'אט באתר — פניות מחוץ לשעות הפעילות אובדות",
        okText: () => "יש צ'אט באתר",
      },
      {
        key: "multi_page", points: 15,
        known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
        gapText: () => "בסריקה נמצאו עמודים בודדים בלבד — אתר רזה מקשה על לקוחות למצוא מידע",
        okText: (f) => `אתר עם ${f.websiteSignals?.pagesCrawled} עמודים ומעלה`,
      },
    ],
  },
  {
    key: "process", label: "בשלות תהליכים", weight: 0.2,
    // ימולא מהראיון (אבן דרך 3) — עד אז "אין מידע", לא משוקלל ולא מעניש
    rules: [
      {
        key: "lead_handling", points: 40,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על טיפול בלידים", okText: () => "טיפול בלידים מסודר",
      },
      {
        key: "manual_tasks", points: 30,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על משימות ידניות", okText: () => "מעט עבודה ידנית חוזרת",
      },
      {
        key: "internal_tools", points: 30,
        known: () => false, earned: () => false,
        gapText: () => "אין מידע על כלים פנימיים", okText: () => "כלים פנימיים מסודרים",
      },
    ],
  },
];
```

> **עדכון as-built (מסקירת תוכן לאחר מימוש ראשוני של משימה 6):** הסקירה מצאה שגיאה קריטית ומספר תיקונים חשובים, יושמו כולם בקוד לעיל ובקומיט:
> - **`phone_available` עדיין "שיקר" בנתיב GBP:** `known: () => true` המקורי הוליד "אין מספר טלפון נגיש — לא בגוגל ולא באתר" עבור עסק עם GBP שה-crawl שלו נכשל — אף מקור לא נבדק בפועל. תוקן לכלל א-סימטרי: תוצאה **חיובית** (טלפון נמצא) תמיד ידועה; תוצאה **שלילית** ידועה רק אם שני המקורות נבדקו בפועל (`known: (f) => phoneFound(f) || (!noGbp(f) && (crawlUsable(f) || f.partial.includes("no_website")))`).
> - **גילוי חיובי תקף גם ב-`js_rendered`:** שבעת חוקי הנוכחות (whatsapp, contact_form, online_booking, email_link, analytics, fb_pixel, chat_widget) עודכנו כך ש-`known` הוא `crawlUsable(f) || <הדגל החיובי הרלוונטי>` — js_rendered הופך שליליים לא אמינים, לא חיוביים; GA שזוהה באתר js_rendered הוא ממצא אמיתי ומוצג כחוזקה.
> - **`platform_known` הוסר לגמרי מהניקוד:** הוא תיאר את יכולת הזיהוי של הסורק (3 פלטפורמות ידועות), לא את העסק, והופיע כ-topGap #1 גם באתרים תקינים לגמרי. הנקודות חולקו מחדש בממד התשתית: analytics 35, fb_pixel 30, chat_widget 20, multi_page 15 (סה"כ 100). `websiteSignals.platform` עדיין זמין כמטא-דאטה למשימה 7.
> - **`has_website` לא מפרגן על דומיין מת:** כש-`crawl_failed` וגם `pagespeed_failed` יחד (אתר רשום ב-GBP אך לא נטען בשום כלי) — `earned: false` עם טקסט ייעודי, לא "לעסק יש אתר" מזויף.
> - **טקסטים בהיקף המדגם:** `no_problem_themes`/`positive_themes` מנוסחים "במדגם הביקורות שנבדק" (לא טענה גורפת), "חוזרת" = `count >= 2` (לא כל תמה שהוזכרה פעם אחת), ואינטרפולציה של טקסט חופשי (theme) קטומה ל-80 תווים כהגנה.
> - **תיקוני ניסוח נוספים:** `perf`/`lcp`/`seo` לא כוללים ניסוחים שסותרים את עצמם או מונחים לא מדויקים ("אינדוקס" הוחלף ב"אופטימיזציה למנועי חיפוש"); `gbp_rating` לא מכנה עסק חדש "רדום"; `has_reviews` עם התאמת מספר בעברית (0/1/רבים); `multi_page` מנוסח כמדידת היקף ה-crawl שלנו, לא פסק דין מוחלט על האתר.

**הערות נוספות (לא קוד):**
- אות "האם עונים לביקורות" מהאפיון (6) לא מומש ב-MVP הזה — Places field mask הנוכחי לא מביא את השדה הזה מגוגל; דילוג מכוון, לא פספוס.
- **הערה למשימה 12:** מסלול `--url` תמיד מניח `no_gbp` (העסק אומת כלא קיים ב-Places) — ה-CLI צריך להדפיס תזכורת שהמסלול הזה מיועד לעסקים שאומתו כנעדרים מ-Places; זרימת המסך באבן דרך 2ב תחפש קודם ב-Places לפני שתציע את הנתיב הזה.

- [x] **Step 4: ירוק** — `npx vitest run tests/dimensions.test.ts` → PASS. `npm run typecheck` נקי.

- [x] **Step 5: commit** — `git commit -am "feat: five scoring dimensions with Hebrew evidence texts (process deferred to interview)"`

---

### משימה 7: מודל העסק, מד השלמות והצעד הבא

הסריקה ממלאה חלקית (קרדיט 0.5 לסקציה); הראיון (אבן דרך 3) ישלים ל-1. המד = ממוצע הקרדיטים × 100.

**Files:**
- Create: `src/pipeline/model/business-model.ts`
- Test: `tests/business-model.test.ts`

- [x] **Step 1: מבחן נכשל** — ליצור `tests/business-model.test.ts` (משתמש ב-fixtures `RICH` ו-`THIN` זהים לאלה של `tests/dimensions.test.ts` — להעתיק אותם לקובץ, לא לייבא בין קובצי מבחן):

```ts
import { describe, it, expect } from "vitest";
import { deriveBusinessModel, recommendNextStep, MODEL_SECTIONS } from "../src/pipeline/model/business-model";
// ... RICH ו-THIN מועתקים כאן מ-tests/dimensions.test.ts ...

describe("deriveBusinessModel", () => {
  it("covers every section key exactly once", () => {
    const m = deriveBusinessModel(RICH);
    expect(Object.keys(m.data).sort()).toEqual([...MODEL_SECTIONS].sort());
  });

  it("rich scan yields partial completeness (30-50%) with scan sources", () => {
    const m = deriveBusinessModel(RICH);
    expect(m.completenessPct).toBeGreaterThanOrEqual(30);
    expect(m.completenessPct).toBeLessThanOrEqual(50);
    expect(m.fieldSources.profile).toEqual(["scan"]);
    expect(m.data.pains).toEqual({ fromReviews: [] });
  });

  it("thin scan yields low completeness and captures pains from review themes", () => {
    const m = deriveBusinessModel(THIN);
    expect(m.completenessPct).toBeLessThan(30);
    expect(m.data.pains).toEqual({ fromReviews: ["מחירים גבוהים"] });
    expect(m.data.service).toEqual({}); // אין מידע — אובייקט ריק, לא null
  });
});

describe("recommendNextStep", () => {
  it("recommends the interview for a business with scan data, naming the emptiest section", () => {
    const m = deriveBusinessModel(RICH);
    const step = recommendNextStep(m);
    expect(step.action).toBe("interview");
    expect(step.reason).toContain("טיפול בלידים");
  });

  it("recommends free text when there is almost no public data", () => {
    const m = deriveBusinessModel(THIN);
    const step = recommendNextStep(m);
    expect(step.action).toBe("free_text");
  });
});
```

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/business-model.test.ts` → FAIL (המודול לא קיים).

- [x] **Step 3: מימוש** — ליצור `src/pipeline/model/business-model.ts`:

```ts
import type { ScanFindings } from "../types";

// עשר הסקציות של מודל העסק (אפיון 7)
export const MODEL_SECTIONS = [
  "profile", "channels", "lead_flow", "scheduling", "service",
  "billing", "retention", "tools", "pains", "manual_tasks",
] as const;
export type ModelSection = (typeof MODEL_SECTIONS)[number];
export type FieldSource = "scan" | "interview" | "free_text" | "document" | "connection";

export interface BusinessModel {
  data: Record<ModelSection, Record<string, unknown>>;
  fieldSources: Partial<Record<ModelSection, FieldSource[]>>;
  completenessPct: number;
}

export interface NextStepRecommendation {
  action: "interview" | "free_text";
  reason: string;
}

// קרדיט לסקציה: 0 = אין כלום, 0.5 = מידע חלקי מהסריקה, 1 = אושר בראיון (אבן דרך 3)
type Credit = 0 | 0.5 | 1;

function domainOf(website?: string): string | undefined {
  try {
    return website ? new URL(website).hostname.replace(/^www\./, "") : undefined;
  } catch {
    return undefined;
  }
}

export function deriveBusinessModel(f: ScanFindings): BusinessModel {
  const s = f.websiteSignals;
  const noGbp = f.partial.includes("no_gbp");
  const problemThemes = f.reviewInsights?.problemThemes.map((t) => t.theme) ?? [];

  const sections: Record<ModelSection, { data: Record<string, unknown>; credit: Credit }> = {
    profile: {
      data: { name: f.business.name, domain: domainOf(f.business.website) },
      credit: 0.5, // שם ודומיין תמיד ידועים מהסריקה; תחום/גודל/ותק — מהראיון
    },
    channels: {
      data: noGbp ? {} : { google: true, reviewCount: f.business.reviewCount },
      credit: noGbp ? 0 : 0.5,
    },
    lead_flow: {
      data: s?.hasContactForm ? { hasContactForm: true } : {},
      credit: s?.hasContactForm ? 0.5 : 0, // יש טופס — אבל מי מטפל ותוך כמה זמן? רק הראיון יודע
    },
    scheduling: {
      data: s ? { hasOnlineBooking: s.hasOnlineBooking } : {},
      credit: s?.hasOnlineBooking ? 0.5 : 0,
    },
    service: { data: {}, credit: 0 },
    billing: { data: {}, credit: 0 },
    retention: { data: {}, credit: 0 },
    tools: {
      data: s
        ? {
            platform: s.platform,
            detected: [
              ...(s.hasGoogleAnalytics ? ["google_analytics"] : []),
              ...(s.hasFacebookPixel ? ["facebook_pixel"] : []),
              ...(s.hasChatWidget ? ["chat_widget"] : []),
            ],
          }
        : {},
      credit: s ? 0.5 : 0,
    },
    pains: {
      data: f.reviewInsights ? { fromReviews: problemThemes } : {},
      credit: problemThemes.length > 0 ? 0.5 : 0,
    },
    manual_tasks: { data: {}, credit: 0 },
  };

  const data = Object.fromEntries(
    MODEL_SECTIONS.map((k) => [k, sections[k].data]),
  ) as BusinessModel["data"];
  const fieldSources = Object.fromEntries(
    MODEL_SECTIONS.filter((k) => sections[k].credit > 0).map((k) => [k, ["scan"] as FieldSource[]]),
  );
  const completenessPct = Math.round(
    (MODEL_SECTIONS.reduce((sum, k) => sum + sections[k].credit, 0) / MODEL_SECTIONS.length) * 100,
  );

  return { data, fieldSources, completenessPct };
}

// סדר העדיפות של סקציות לראיון + הניסוח שלהן — הסקציה הראשונה שחסרה קובעת את ההמלצה
const INTERVIEW_PRIORITY: [ModelSection, string][] = [
  ["lead_flow", "טיפול בלידים"],
  ["service", "שירות ותפעול"],
  ["billing", "גבייה וחשבוניות"],
  ["manual_tasks", "משימות ידניות חוזרות"],
];

const FREE_TEXT_THRESHOLD = 20; // מתחת ל-20% שלמות — אין בסיס לשאלות ממוקדות, עדיף סיפור חופשי

export function recommendNextStep(m: BusinessModel): NextStepRecommendation {
  if (m.completenessPct <= FREE_TEXT_THRESHOLD) {
    return {
      action: "free_text",
      reason: "אין כמעט מידע ציבורי על העסק — ספר לנו עליו במילים שלך וזה ימלא את התמונה",
    };
  }
  const missing = INTERVIEW_PRIORITY.find(([section]) => !m.fieldSources[section]);
  const label = missing?.[1] ?? "העסק";
  return {
    action: "interview",
    reason: `השלם כמה שאלות על ${label} — זה ישפר משמעותית את דיוק ההמלצות`,
  };
}
```

> **הערת as-built (חשבון קרדיטים נבדק לפני מימוש — נמצאו שלוש סתירות, לא שתיים):**
>
> **1) `scheduling` — הסתירה הראשונה, כפי שתועדה מראש בתוכנית.** הקוד המקורי בסניפט (`credit: s?.hasOnlineBooking ? 0.5 : 0`) מעניש RICH על `hasOnlineBooking: false` בכך שהוא לא נותן קרדיט בכלל, למרות שהעובדה "אין קביעת תור אונליין" היא ממצא ידוע לגמרי מהסריקה. תוקן ל-`credit: s ? 0.5 : 0` (קרדיט כל עוד יש אותות אתר בכלל, בלי תלות בערך).
>
> **2) `recommendNextStep` — הסתירה השנייה, כפי שתועדה מראש בתוכנית.** בדיקת `!m.fieldSources[section]` מדלגת על `lead_flow` כי יש לו כבר `fieldSources` (קרדיט 0.5 מהסריקה — טופס קיים, אבל מי מטפל בליד לא ידוע), ונוחתת בטעות על `service`. נוסף שדה `credits: Record<ModelSection, number>` ל-`BusinessModel` (קרדיט גולמי לכל סקציה — שימושי גם למד השלמות ב-UI בעתיד), ו-`recommendNextStep` משתמש ב-`m.credits[section] < 1` במקום בבדיקת `fieldSources` — קרדיט 0.5 עדיין "לא הושלם", רק אישור בראיון (קרדיט 1) סוגר סקציה.
>
> **3) סתירה שלישית שהתגלתה רק בחישוב מספרי בפועל — לא תועדה מראש בתוכנית ותוקנה בנפרד:** התוכנית טענה שתיקון `scheduling` בלבד "מביא את RICH ל-3.0 → 30%". חישוב מדויק (ראו `node -e` בדוח המשימה) מראה שזה שגוי: סכום הקרדיטים של RICH אחרי תיקון `scheduling` בלבד הוא `profile .5 + channels .5 + lead_flow .5 + scheduling .5 + tools .5 + pains 0 = 2.5` → **25%**, עדיין מתחת לרצפת 30% של המבחן `toBeGreaterThanOrEqual(30)`. הסיבה: RICH מגיע עם `problemThemes: []` (ביקורות נותחו ולא נמצאו בעיות חוזרות), אבל הקוד המקורי נותן קרדיט לסקציית `pains` רק כש-`problemThemes.length > 0` — אז "נבדק ולא נמצא כלום" מקבל 0 קרדיט, בניגוד לעיקרון שכבר הופעל על `scheduling` ("גם 'אין' הוא ממצא ידוע"). תוקן (בסבב הראשון) ל-`credit: f.reviewInsights ? 0.5 : 0` (קרדיט כשהביקורות נותחו בפועל, לא רק כשנמצאו בהן בעיות).
>
> **תיקון נוסף מסקירת ספק (סבב שני) — התיקון של (3) עצמו החזיק guard שגוי:** `f.reviewInsights ? 0.5 : 0` בודק רק שהאובייקט קיים, לא שנותח בו משהו בפועל. `analyze/reviews` יכול להחזיר `{totalAnalyzed: 0, positiveThemes: [], problemThemes: []}` שלם כש-`scan.ts` מדגיל `no_review_text` (אין טקסט לאף ביקורת) — עסק כזה קיבל קרדיט `pains` + `data.pains = {fromReviews: []}`, בדיוק המצג המטעה ("נבדק ונמצא נקי") שהעיקרון של (3) עצמו נועד למנוע ממנו, הפעם על עסק שבו **שום דבר לא נבדק**. תוקן לאותו predicate שכבר קיים ב-`score/dimensions.ts` (`reviewsAnalyzed`): `const reviewsAnalyzed = !!f.reviewInsights && f.reviewInsights.totalAnalyzed > 0;` ואז `pains: { data: reviewsAnalyzed ? {...} : {}, credit: reviewsAnalyzed ? 0.5 : 0 }`. RICH/THIN לא מושפעים — לשניהם `totalAnalyzed: 5 > 0`.
>
> **4) פער נוסף מאותה משפחה, נמצא בסקירה: `js_rendered` נספר כידע ב-`scheduling`/`tools`.** תחת `js_rendered` הזחלן לא באמת יכול לראות אותות — ובכל זאת `scheduling`/`tools` נתנו קרדיט 0.5 ופלטו היעדרים מומצאים (`hasOnlineBooking: false`, `detected: []`) שהם בדיון, לא ממצא. תוקן ביישום אותה אסימטריה שנקבעה במשימה 6 (`score/dimensions.ts` `crawlUsable`): **גילוי חיובי הוא ראיה גם תחת `js_rendered`; טענת היעדר דורשת זחילה אמינה.** נוסף `const crawlUsable = !!s && !f.partial.includes("js_rendered");`, וגם `scheduling` וגם `tools` נבנים כך: אם יש גילוי חיובי (`hasOnlineBooking`/כלי כלשהו) — הוא תמיד נספר ומקבל קרדיט, גם ב-`js_rendered`; אחרת קרדיט/נתון היעדר ניתנים רק כש-`crawlUsable`. RICH לא מושפע (`jsRendered: false` → `crawlUsable: true`, זהה לקודם). THIN לא מושפע (אין `websiteSignals` בכלל → `crawlUsable: false`, `scheduling`/`tools` כבר היו 0).
>
> **חשבון סופי (נבדק בקוד, לא בראש — ראו `npx tsx` בדוח המשימה):**
> `RICH credits: {"profile":0.5,"channels":0.5,"lead_flow":0.5,"scheduling":0.5,"service":0,"billing":0,"retention":0,"tools":0.5,"pains":0.5,"manual_tasks":0}` → סכום 3.0 → **30%** (בדיוק על גבול הרצפה הכולל של המבחן).
> `THIN credits: {"profile":0.5,"channels":0.5,"lead_flow":0,"scheduling":0,"service":0,"billing":0,"retention":0,"tools":0,"pains":0.5,"manual_tasks":0}` → סכום 1.5 → **15%** (ללא שינוי מהסבב הראשון).
> כל המבחנים עוברים ביושר, בלי הקלה על אף מבחן. המקור המחייב: `src/pipeline/model/business-model.ts`, `tests/business-model.test.ts`.

> **הערת as-built — סבב שלישי (סקירת איכות, שני קומיטים נפרדים):**
>
> **קומיט 1 — חוזה ההתמדה + תיקוני היגיינה:**
> - **`credits` חייב לשרוד persist/rehydrate.** משימה 9 (`BusinessModelRow` ב-`prisma/schema.prisma`) עדיין תוכנית בלבד (טרם מומשה) — נוספה עמודה `credits Json` אחרי `fieldSources`. משימה 11 (`saveScanResult`) עודכנה כך שגם ה-`update` וגם ה-`create` בתוך ה-`upsert` כוללים `credits: model.credits`. משימה 12 (fixture `MODEL` ב-`tests/cli-format.test.ts`) עודכנה עם שדה `credits` מלא ומוקלד (בלי `as never`) כדי שהקוד לדוגמה ימשיך להיות תקין מבחינת טיפוסים כש-`BusinessModel` דורש את השדה.
> - **ניסוח `free_text` לא הוגן כש"לא הצלחנו לקרוא את האתר" (לא רק "אין מידע ציבורי").** הטקסט הוחלף לניסוח שנכון בשני המקרים: `"כמעט ולא הצלחנו לאסוף מידע על העסק ממקורות ציבוריים — ספר לנו עליו במילים שלך וזה ימלא את התמונה"`.
> - **הערת סף לא תואמת קוד:** ההשוואה היא `<=`, אז 20% בדיוק כן מפעיל `free_text` — התיעוד תוקן ל-`// עד 20% (כולל) — אין בסיס לשאלות ממוקדות, עדיף סיפור חופשי`.
> - **יציבות JSONB — בלי ערכי `undefined` בתוך `data`:** `profile.domain` ו-`tools.platform` עברו מ-`{key: possiblyUndefined}` לפריסה מותנית (`...(x ? {key: x} : {})`) כך שהמפתח פשוט לא קיים כשאין ערך, במקום להסתמך על כך ש-`JSON.stringify`/Prisma מוחקים מפתחות עם `undefined`. גם `domainOf` תוקן ל-`hostname.replace(/^www\./, "") || undefined` להגנה מפני hostname שהופך למחרוזת ריקה.
> - **סוגריים לקריאות** נוספו סביב שני הביטויים התלויים בסדר פעולות (`(crawlUsable || !!s?.hasOnlineBooking) ? 0.5 : 0` ב-`scheduling`, `(crawlUsable || toolsDetectedAny) ? 0.5 : 0` ב-`tools`) — ללא שינוי סמנטי (`||` כבר קושר חזק יותר מ-`?:`), רק כדי שלא יידרש לזכור את סדר הפעולות בקריאה.
> - **הערת פטור ל-`lead_flow`** נוספה: בניגוד ל-`scheduling`/`tools`, העדר טופס יצירת קשר לא נספר כידע גם כשה-crawl אמין — "אין טופס" לא אומר הרבה על איך מטפלים בלידים בפועל (עשויים להגיע בטלפון/וואטסאפ), אז זו לא תשובה לשאלה שהסקציה אמורה למלא.
> - **`completenessOf` חולצה לפונקציה מיוצאת** (`completenessOf(credits): number`) — תפר לאבן דרך 3: עדכון קרדיט בודד אחרי תשובת ראיון לא יצטרך לגזור מודל שלם מחדש כדי לחשב אחוז השלמות מעודכן.
> - **שני מבחני נעילה נוספו** ב-`tests/business-model.test.ts`: אינווריאנט מבני על כל ה-fixtures בקובץ (RICH/THIN/NO_TEXT/JS_SITE — `credit>0 ⟺ fieldSources קיים ⟺ data לא ריק`, ו-`completenessPct === completenessOf(credits)`), ופין מדויק למפת הקרדיטים של RICH (כדי שרצפת ה-30% לא תישחק בשקט בעתיד). האינווריאנט הראשון עבר על כל ה-fixtures בלי חריגים — כולל `JS_SITE` (`tools` מקבל קרדיט 0.5 עם `data.tools = {detected: ["google_analytics"]}`, אובייקט לא-ריק גם כש-`platform` נעדר, כי המפתח `detected` תמיד קיים כש-`crawlUsable || toolsDetectedAny`).
>
> **קומיט 2 (נפרד) — `src/pipeline/evidence.ts`:** `noGbp`/`crawlUsable`/`reviewsAnalyzed` הועברו למקור אמת יחיד משותף בין `score/dimensions.ts` (משימה 6) ל-`model/business-model.ts` (משימה זו) — כפילות ההגדרות בין שני המודולים היא בדיוק איך נולד באג הקרדיט של `pains` שתועד למעלה (סעיף 3). ריפקטור טהור, בלי שינוי במבחנים.
>
> חשבון RICH/THIN לא זז מהסבב הקודם (30%/15%) — כל התיקונים בסבב הזה הם היגיינה/חוזה persistence/ריפקטור, לא שינוי לוגיקת קרדיט. המקור המחייב: `src/pipeline/model/business-model.ts`, `tests/business-model.test.ts`, `src/pipeline/evidence.ts`, `src/pipeline/score/dimensions.ts`, סעיפי משימות 9/11/12 בתוכנית זו.

- [x] **Step 4: ירוק** — `npx vitest run tests/business-model.test.ts` → PASS (9/9, אחרי שלושה סבבי סקירה). `npx vitest run` (מלא) → 133/133 PASS. `npm run typecheck` נקי.

- [x] **Step 5: commit** — `git commit -am "feat: business model derivation, completeness meter and next-step recommendation"`

---

### משימה 8: נרטיב LLM עם שומר-מספרים

ה-LLM כותב הסברים, לא מספרים (אפיון 6). כל ספרה בנרטיב חייבת להופיע בנתונים; הפרה → ניסיון שני עם אזהרה; הפרה שנייה → נרטיב תבנית דטרמיניסטי.

> **אזהרה נוספת מסקירת משימה 6:** אחרי הסרת platform_known מהציון, עסק בריא יכול להחזיר `topGaps: []` — הנרטיב (וגם מסך 3 ב-2ב) חייבים לטפל ברשימה ריקה בחן: להציג את זה כחיובי ("לא מצאנו פערים מהותיים"), לא כפאנל ריק.
>
> **אזהרות מסקירת משימה 5 (לתקן בזמן המימוש):** (א) בפרומפט, סריאליזציית הממדים חייבת לכלול גם את `key` (לא רק label/score/dataStatus) — אחרת ל-LLM אין דרך לחבר בין `topGaps.dimension` (מפתח אנגלי) לתווית העברית. (ב) `allowedNumbers` בגרסת הסניפט עושה `JSON.stringify(score)` על כל הדוח — זה מכניס ל-whitelist את כל ה-points (5,10,15,20,25,30,40) וה-weights של כל החוקים, ומחליש מאוד את שומר ההזיות ("40% מהלקוחות" יעבור כי לחוק כלשהו יש points: 40). לצמצם את המקור: findings + הציונים המוצגים בלבד (overall + score של כל ממד), לא הדוח המלא.

> **הערת as-built (סבב סקירה ראשון):** שלוש האזהרות יושמו במלואן. אומת ריצית: עם RICH, `allowedNumbers` המצומצם (findings + overall/dimension scores בלבד: 73,65,100,70,50,4.9,80,46,92,12700 וכו') **לא** כולל 40 או 35 — כפי שגרסת ה-`JSON.stringify(score)` המלאה כן הייתה כוללת (points/weights של החוקים). `buildPrompt` כולל `key` בסריאליזציית הממדים ומטפל ב-`topGaps` ריק בהוראה נפרדת ("לא נמצאו פערים מובילים..."); `fallbackNarrative` מחזיר "לא מצאנו פערים מהותיים בסריקה הציבורית — בסיס דיגיטלי חזק" כש-`topGaps.length === 0`, לא טקסט ריק. מבחני הקובץ הורחבו מ-7 (בסניפט המקורי) ל-9: נוסף מבחן לצמצום ה-whitelist (`40`/`35` נדחים) ומבחן נפרד ל-`fallbackNarrative` על רשימת פערים ריקה; מבחן הפרומפט מוודא גם `"key":"accessibility"`.
>
> **הערת as-built (סבב סקירה שני — עיצוב השומר):** סקירה נוספת מצאה שהשומר, למרות שהוא תואם את האזהרות שתוקנו קודם, עדיין לא נכון בעיצובו: הוא בדק "האם המספר מופיע במקורות מסוימים" במקום העיקרון המאחד הנכון — **המאגר המותר חייב להיות על-קבוצה של המספרים שהפרומפט עצמו מציג/מבקש מהמודל להסביר, בניכוי מנגנונים פנימיים**. שישה תיקונים יצאו מהעיקרון הזה: **(1)** הורחב המאגר לכלול את המספרים בטקסטים של `topGaps`/`topStrengths` עצמם (החוקים הדטרמיניסטיים שהמודל מתבקש להסביר — "מתחת לרף האמון של 4.2", "מתחת ליעד של 70" הם נתונים לגיטימיים, לא הזיה), זרעו מפורש ל-`"100"` (קנה המידה — "X מתוך 100" הוא ניסוח קנוני), וזרעו לצורת התצוגה של LCP בשניות (`(lcpMs/1000).toFixed(1)`) גם כשהחוק הזה לא בין ה-top3. **(2)** `JSON.stringify(f)` הכשיר טלמטריה פנימית (durationMs, טוקנים, עלות, timestamps ב-`meta`) — כ-15 מספרים שרירותיים שיכולים "לכבס" הזיה; תוקן ל-`{ ...f, meta: undefined }`. **(3)** סריאליזציית `topGaps`/`topStrengths` בפרומפט כללה `points` (20/25/30/35) — בדיוק המספרים שהשומר עצמו אוסר, מוצגים למודל שנאמר לו "השתמש רק במספרים בנתונים"; הוסרו (`{dimension, ruleKey, text}` בלבד). **(4)** נרטיב ריק (המודל החזיר `{}`/`null`/מחרוזת/אובייקט זר) עבר בעבר כהצלחה עם `headline`/`summary` ריקים — עכשיו `!narrative.headline || !narrative.summary` נבדק בדיוק כמו הפרה, וממשיך לניסיון השני ואז לתבנית. **(5)** התאמת המספרים הפכה סלחנית לפסיקי אלפים ("4,300"→"4300") ולהחלפת נקודה/פסיק עשרוניים — כל וריאציה שתואמת למאגר מספיקה, לא רק התאמה מדויקת. **(6)** `sanitize` מקבל כעת `validRuleKeys` (מ-`score.topGaps`) ומסנן `gapExplanations` שה-`ruleKey` שלהם לא קיים באמת — `ruleKey` מומצא ("rule_999") היה שורד בעבר ושובר בשקט את הצליבה בהמשך (מסך 3 ב-2ב). מבחני הקובץ הורחבו מ-9 ל-16: אומת ריצית על RICH ועל פיקסצ'ר "מתקשה" (rating 3.8, perf 31, lcp 6200) ש-`topGaps` בפועל הוא `[online_booking, rating_good, fb_pixel]` (impact משוקלל 7.5/5/4.5) — perf (impact 4) לא נכנס ל-top3, ולכן "70" בטקסט המוחזר מאומת דרך ציון הממד `accessibility` (70) ולא דרך `topGaps`, מה שמוכיח שהעל-קבוצה עובדת גם על מקרי קצה לא מכוונים. המקור המחייב: `src/pipeline/report/narrative.ts`, `tests/narrative.test.ts`.

> **הערת as-built (סבב סקירה שלישי — ניקוי):** `CompleteFn` הפך מגנרי (`<T>(prompt) => Promise<{data: T, ...}>`) לפונקציה קונקרטית עם `data: unknown` — `generateNarrative` תמיד קרא לו בלי לפרמט T ממילא, כך שהגנריות רק חייבה כל מוק במבחנים לעבור דרך `as never` (14 מקומות בקובץ המבחן); כעת `opts.complete ?? completeJSON` מוקצה בלי cast וכל 14 ה-`as never` הוסרו. בנוסף: הערת אזהרה נוספה מעל בלוק `<<<DATA>>>` ב-`buildPrompt` (שורת נתונים חדשה עם מספר חייבת כיסוי ב-`allowedNumbers`, אחרת נפילה שקטה לתבנית), ו-`addNumberVariants` מנקה גם פסיקי אלפים בצד המאגר עצמו (לא רק בצד ההתאמה) כדי ש-gapText עם "1,500" יתיר גם "1500" שהמודל מצטט.

**Files:**
- Create: `src/pipeline/report/narrative.ts`
- Test: `tests/narrative.test.ts`

- [x] **Step 1: מבחן נכשל** — ליצור `tests/narrative.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { generateNarrative, extractNumbers, fallbackNarrative } from "../src/pipeline/report/narrative";
import { scoreFindings } from "../src/pipeline/score/engine";
import { DIMENSIONS } from "../src/pipeline/score/dimensions";
import type { ScanFindings } from "../src/pipeline/types";

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

// עסק עשיר עם אתר מלא — בסגנון אופטיקה בק (זהה לזה של tests/dimensions.test.ts, מועתק לא מיובא)
const RICH: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה", phone: "04-000", website: "https://x.co.il", rating: 4.9, reviewCount: 80 },
  websiteSignals: {
    pagesCrawled: 8, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
    hasPhoneLink: true, hasEmailLink: true, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress", jsRendered: false,
  },
  pageSpeed: { performanceScore: 46, seoScore: 92, lcpMs: 12700 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [{ theme: "שירות מקצועי", count: 4 }], problemThemes: [] },
  partial: [],
  meta: META,
};

const score = () => scoreFindings(DIMENSIONS, RICH);

function llmReply(obj: unknown) {
  return async () => ({ data: obj, usage: { inputTokens: 10, outputTokens: 5 } });
}

const GOOD = {
  headline: "העסק חזק במוניטין אבל האתר האיטי עוצר אותו",
  summary: "דירוג 4.9 עם 80 ביקורות — נכס אמיתי. האתר קיים אבל איטי.",
  gapExplanations: [{ ruleKey: "online_booking", explanation: "עסק מבוסס תורים בלי קביעת תור אונליין מפסיד לקוחות" }],
};

describe("generateNarrative", () => {
  it("returns the model's narrative when all numbers exist in the data", async () => {
    const result = await generateNarrative(RICH, score(), { complete: llmReply(GOOD) as never });
    expect(result.narrative.headline).toBe(GOOD.headline);
    expect(result.usedFallback).toBe(false);
  });

  it("retries once when the model invents a number, with a stern warning", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ data: { ...GOOD, summary: "העסק מפסיד 37% מהלקוחות" }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete: complete as never });
    expect(complete).toHaveBeenCalledTimes(2);
    expect((complete.mock.calls[1][0] as string)).toContain("אסור");
    expect(result.usedFallback).toBe(false);
    expect(result.narrative.summary).toBe(GOOD.summary);
  });

  it("rejects rule points as an alibi for invented numbers (narrow whitelist)", async () => {
    // 40 הוא points של חוק — אסור שהוא יכשיר "40% מהלקוחות"; 25/30/35 הם points/weights
    const bad = { ...GOOD, summary: "העסק מפסיד 40% מהלקוחות ועוד 35 אחוז" };
    const complete = vi.fn().mockResolvedValue({ data: bad, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete: complete as never });
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to a deterministic template after two violations", async () => {
    const bad = { ...GOOD, summary: "חיסכון של 5000 שקל בחודש" };
    const complete = vi.fn().mockResolvedValue({ data: bad, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete: complete as never });
    expect(result.usedFallback).toBe(true);
    expect(result.narrative.headline).toContain("אופטיקה"); // התבנית משתמשת בשם העסק
  });

  it("falls back when the LLM call itself throws", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("429"));
    const result = await generateNarrative(RICH, score(), { complete: complete as never });
    expect(result.usedFallback).toBe(true);
  });

  it("sanitizer drops fields the model invented", async () => {
    const withExtra = { ...GOOD, invented: "x", gapExplanations: [{ ...GOOD.gapExplanations[0], quote: "ציטוט אסור" }] };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withExtra) as never });
    expect((result.narrative as unknown as Record<string, unknown>).invented).toBeUndefined();
    expect((result.narrative.gapExplanations[0] as unknown as Record<string, unknown>).quote).toBeUndefined();
  });

  it("prompt forbids inventing numbers/quotes and includes dimension keys for joining", async () => {
    const complete = vi.fn().mockResolvedValue({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateNarrative(RICH, score(), { complete: complete as never });
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("אל תמציא");
    expect(prompt).toContain("אל תצטט");
    expect(prompt).toContain('"key":"accessibility"'); // סריאליזציית הממדים כוללת key לצליבה עם topGaps
  });

  it("accepts the system's own gap texts echoed back (rating 3.8, perf 31, lcp 6200)", async () => {
    const struggling: ScanFindings = {
      ...RICH,
      business: { ...RICH.business, rating: 3.8 },
      pageSpeed: { performanceScore: 31, seoScore: 92, lcpMs: 6200 },
    };
    const s = scoreFindings(DIMENSIONS, struggling);
    const echo = {
      headline: "יש עבודה",
      summary: "דירוג 3.8 — מתחת לרף האמון של 4.2, וציון ביצועים 31/100 מתחת ליעד של 70",
      gapExplanations: s.topGaps.map((g) => ({ ruleKey: g.ruleKey, explanation: g.text })),
    };
    const result = await generateNarrative(struggling, s, { complete: llmReply(echo) as never });
    expect(result.usedFallback).toBe(false);
  });

  it("accepts the canonical 'X מתוך 100' phrasing", async () => {
    const s = score();
    const canonical = { ...GOOD, summary: `ציון ${s.overall} מתוך 100 — יש בסיס טוב` };
    const result = await generateNarrative(RICH, s, { complete: llmReply(canonical) as never });
    expect(result.usedFallback).toBe(false);
  });

  it("treats empty/garbage LLM output as failure, not blank success", async () => {
    for (const garbage of [{}, null, "not an object", { foo: "bar" }]) {
      const result = await generateNarrative(RICH, score(), { complete: llmReply(garbage) as never });
      expect(result.usedFallback, JSON.stringify(garbage)).toBe(true);
    }
  });

  it("does not whitelist scan telemetry numbers", async () => {
    const withMeta: ScanFindings = {
      ...RICH,
      meta: { startedAt: "2026-08-13T14:05:22Z", durationMs: 48211, placesCalls: 2, llmInputTokens: 12043, llmOutputTokens: 1997, estCostUsd: 0.0231 },
    };
    const bad = { ...GOOD, summary: "העסק מפסיד 48211 שקל" };
    const result = await generateNarrative(withMeta, scoreFindings(DIMENSIONS, withMeta), { complete: llmReply(bad) as never });
    expect(result.usedFallback).toBe(true);
  });

  it("tolerates thousands separators for real data numbers", async () => {
    const withThousands = { ...GOOD, summary: "העמוד נטען אחרי 12,700 מילישניות — לאט מדי" };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withThousands) as never });
    expect(result.usedFallback).toBe(false); // 12700 קיים בנתונים
  });

  it("prompt serializes gaps without points", async () => {
    const complete = vi.fn().mockResolvedValue({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateNarrative(RICH, score(), { complete: complete as never });
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/"points":/);
  });

  it("drops explanations for rule keys that are not in topGaps", async () => {
    const withFake = { ...GOOD, gapExplanations: [...GOOD.gapExplanations, { ruleKey: "rule_999", explanation: "הסבר מומצא" }] };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withFake) as never });
    expect(result.narrative.gapExplanations.map((g) => g.ruleKey)).not.toContain("rule_999");
  });
});

describe("fallbackNarrative", () => {
  it("handles an empty gap list as a positive, not a blank", () => {
    const healthy = { ...score(), topGaps: [] };
    const n = fallbackNarrative(RICH, healthy);
    expect(n.summary).toContain("לא מצאנו פערים מהותיים");
    expect(n.gapExplanations).toEqual([]);
  });
});

describe("extractNumbers", () => {
  it("finds integers and decimals with dot or comma", () => {
    expect(extractNumbers("ציון 4.9 מתוך 80 ביקורות, 12,7 שניות")).toEqual(["4.9", "80", "12,7"]);
  });
});
```

(הערה: `as unknown as Record<string, unknown>` — לא `as Record<string, unknown>` ישיר — כי `ReportNarrative`/`GapExplanation` הם טיפוסים סגורים בלי index signature; TS strict דורש מעבר דרך `unknown` תחילה. מבחן ה-`fallbackNarrative` וה-`healthy` object נבנים ידנית עם `topGaps: []`; `score()` בפועל על RICH כבר מכיל `topGaps` לא-ריק, כך שהמבחן הזה בודק במפורש את מקרה הקצה ולא רק משכפל את התוצאה האמיתית.)

- [x] **Step 2: לוודא כישלון** — `npx vitest run tests/narrative.test.ts` → FAIL (המודול לא קיים).

- [x] **Step 3: מימוש** — ליצור `src/pipeline/report/narrative.ts`:

```ts
import type { ScanFindings } from "../types";
import type { ScoreReport } from "../score/types";
import { completeJSON, type LlmUsage } from "../llm/client";

export interface GapExplanation { ruleKey: string; explanation: string; }
export interface ReportNarrative {
  headline: string;
  summary: string;
  gapExplanations: GapExplanation[];
}
export interface NarrativeResult {
  narrative: ReportNarrative;
  usage: LlmUsage;
  usedFallback: boolean;
}

type CompleteFn = <T>(prompt: string) => Promise<{ data: T; usage: LlmUsage }>;
export interface NarrativeOptions { complete?: CompleteFn; }

const MAX_TEXT_CHARS = 400;

export function extractNumbers(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

// עוזר: מוסיף למאגר המותרים את כל הצורות המקבילות של מספר —
// נקודה/פסיק עשרוני ושני חלקיו (כך ש-"12.7" מתיר גם "12" וגם "7")
function addNumberVariants(n: string, allowed: Set<string>): void {
  allowed.add(n);
  allowed.add(n.replace(".", ","));
  for (const part of n.split(/[.,]/)) allowed.add(part);
}

// המספרים המותרים: על-קבוצה של כל מה שהפרומפט עצמו מציג/מבקש מהמודל להסביר, פחות מנגנונים פנימיים.
// כולל: הממצאים (בלי meta — טלמטריה פנימית כמו durationMs/עלות, לא נתון עסקי, ראו סקירה), הציונים המוצגים,
// טקסטי topGaps/topStrengths (המודל מתבקש להסביר בדיוק אותם — המספרים בהם לגיטימיים),
// קנה המידה הקבוע "100" (ניסוח קנוני "ציון X מתוך 100"), וזמן טעינת ה-LCP בשניות (תצוגת real data נפוצה).
// בכוונה לא כל ה-ScoreReport — הוא מכיל points/weights של חוקים שהיו מכשירים מספרים מומצאים (אזהרת סקירה קודמת)
function allowedNumbers(f: ScanFindings, score: ScoreReport): Set<string> {
  const displayedScores = [
    score.overall,
    ...score.dimensions.map((d) => d.score),
  ].filter((n): n is number => n != null);

  const findingsWithoutMeta = { ...f, meta: undefined }; // meta מכיל טלמטריה פנימית — לא נתון עסקי שמותר לצטט
  const highlightTexts = [...score.topGaps, ...score.topStrengths].map((h) => h.text).join(" ");

  const source = [
    JSON.stringify(findingsWithoutMeta),
    displayedScores.join(" "),
    highlightTexts,
  ].join(" ");

  const allowed = new Set<string>();
  for (const n of extractNumbers(source)) addNumberVariants(n, allowed);

  allowed.add("100"); // קנה המידה — "ציון X מתוך 100" הוא ניסוח קנוני, לא מספר מומצא

  if (f.pageSpeed?.lcpMs != null) {
    // צורת התצוגה של LCP בשניות (ראו sec() ב-dimensions.ts) — real data גם כשהחוק הזה לא בין topGaps/topStrengths
    const lcpSeconds = (f.pageSpeed.lcpMs / 1000).toFixed(1);
    for (const n of extractNumbers(lcpSeconds)) addNumberVariants(n, allowed);
  }

  return allowed;
}

// התאמה סלחנית: אלפים ("4,300"→"4300") ופסיק/נקודה עשרוניים — כל וריאציה שמתאימה למאגר המותרים מספיקה
function isAllowed(token: string, allowed: Set<string>): boolean {
  return (
    allowed.has(token) ||
    allowed.has(token.replace(/,/g, "")) ||
    allowed.has(token.replace(",", ".")) ||
    allowed.has(token.replace(".", ","))
  );
}

function violations(n: ReportNarrative, allowed: Set<string>): string[] {
  const texts = [n.headline, n.summary, ...n.gapExplanations.map((g) => g.explanation)];
  return texts.flatMap(extractNumbers).filter((num) => !isAllowed(num, allowed));
}

// בנייה מחדש של האובייקט — שדות שהומצאו על ידי המודל לא שורדים (העיקרון של analyze/reviews).
// validRuleKeys: מפתחות חוק אמיתיים מ-topGaps בלבד — ruleKey מומצא (הזיה) נזרק בשקט ולא מגיע לפלט/לצליבה בהמשך
function sanitize(raw: unknown, validRuleKeys: Set<string>): ReportNarrative {
  const r = (raw ?? {}) as Record<string, unknown>;
  const gaps = Array.isArray(r.gapExplanations) ? r.gapExplanations : [];
  return {
    headline: String(r.headline ?? "").trim().slice(0, MAX_TEXT_CHARS),
    summary: String(r.summary ?? "").trim().slice(0, MAX_TEXT_CHARS),
    gapExplanations: gaps
      .map((g) => {
        const e = (g ?? {}) as Record<string, unknown>;
        return {
          ruleKey: String(e.ruleKey ?? "").trim(),
          explanation: String(e.explanation ?? "").trim().slice(0, MAX_TEXT_CHARS),
        };
      })
      .filter((g) => g.ruleKey && g.explanation && validRuleKeys.has(g.ruleKey)),
  };
}

function buildPrompt(f: ScanFindings, score: ScoreReport, stern: boolean): string {
  const sternLine = stern
    ? "\nאזהרה: בתשובה הקודמת הופיע מספר שלא קיים בנתונים. אסור בתכלית להזכיר אף מספר שלא מופיע בנתונים למטה.\n"
    : "";
  const gapsInstruction = score.topGaps.length > 0
    ? "כתוב הסבר לכל אחד מהפערים המובילים (topGaps) בלבד."
    : "לא נמצאו פערים מובילים — החזר gapExplanations ריק והתמקד במה שעובד טוב.";
  // בלי points — הם שייכים למנגנון הפנימי של הציון, לא לנתון שמותר למודל לצטט (אזהרת סקירה)
  const stripPoints = (h: { dimension: string; ruleKey: string; text: string }) => {
    const { dimension, ruleKey, text } = h;
    return { dimension, ruleKey, text };
  };
  return `אתה יועץ עסקי שכותב נרטיב קצר לדוח אבחון דיגיטלי של עסק ישראלי.
כללים מחייבים:
- אל תמציא מספרים, אחוזים או סכומים. מותר להשתמש אך ורק במספרים שמופיעים בנתונים.
- אל תצטט ביקורות ואל תזכיר שמות של כותבי ביקורות.
- כתוב עברית טבעית, ישירה, בגובה העיניים — בלי סופרלטיבים ריקים.
${sternLine}
החזר JSON בלבד במבנה:
{"headline": "משפט פתיחה אחד חד שמסכם את מצב העסק",
 "summary": "פסקה קצרה (2-3 משפטים) על התמונה הכוללת",
 "gapExplanations": [{"ruleKey": "מפתח הפער כפי שמופיע בנתונים", "explanation": "הסבר של משפט-שניים למה הפער הזה עולה לעסק כסף"}]}

${gapsInstruction}

<<<DATA>>>
עסק: ${JSON.stringify({ name: f.business.name, rating: f.business.rating, reviewCount: f.business.reviewCount })}
ציונים: ${JSON.stringify(score.dimensions.map((d) => ({ key: d.key, label: d.label, score: d.score, dataStatus: d.dataStatus })))}
ציון כולל: ${score.overall}
פערים מובילים: ${JSON.stringify(score.topGaps.map(stripPoints))}
חוזקות: ${JSON.stringify(score.topStrengths.map(stripPoints))}
דגלים: ${JSON.stringify(f.partial)}
<<<END>>>`;
}

export function fallbackNarrative(f: ScanFindings, score: ScoreReport): ReportNarrative {
  const overallLine = score.overall == null
    ? `אין מספיק מידע ציבורי על ${f.business.name} לציון כולל — וזה כשלעצמו ממצא`
    : `${f.business.name}: ציון דיגיטלי ${score.overall} מתוך 100`;
  return {
    headline: overallLine,
    summary: score.topGaps.length > 0
      ? `הפערים המרכזיים שמצאנו: ${score.topGaps.map((g) => g.text).join(" · ")}`
      : "לא מצאנו פערים מהותיים בסריקה הציבורית — בסיס דיגיטלי חזק.",
    gapExplanations: score.topGaps.map((g) => ({ ruleKey: g.ruleKey, explanation: g.text })),
  };
}

export async function generateNarrative(
  f: ScanFindings,
  score: ScoreReport,
  opts: NarrativeOptions = {},
): Promise<NarrativeResult> {
  const complete = opts.complete ?? (completeJSON as CompleteFn);
  const allowed = allowedNumbers(f, score);
  const validRuleKeys = new Set(score.topGaps.map((g) => g.ruleKey));
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (const stern of [false, true]) {
    try {
      const result = await complete<unknown>(buildPrompt(f, score, stern));
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
      };
      const narrative = sanitize(result.data, validRuleKeys);
      // נרטיב ריק (המודל החזיר {}/null/זבל שלא נכנס לשדות) הוא כישלון לכל דבר —
      // לא הצלחה עם headline/summary ריקים שיזלגו לדוח
      const isEmpty = !narrative.headline || !narrative.summary;
      if (!isEmpty && violations(narrative, allowed).length === 0) {
        return { narrative, usage, usedFallback: false };
      }
    } catch {
      break; // כשל תקשורת/מודל — ישר לתבנית
    }
  }
  return { narrative: fallbackNarrative(f, score), usage, usedFallback: true };
}
```

- [x] **Step 4: ירוק** — `npx vitest run tests/narrative.test.ts` → PASS (16/16). `npx vitest run` (מלא) → 149/149. `npm run typecheck` נקי.

- [x] **Step 5: commit** — `git commit -am "feat: LLM report narrative with number-whitelist guard and deterministic fallback"`

---

### משימה 9: פרויקט Supabase + סכמת Prisma + מיגרציה

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/…` (נוצר על ידי הכלי)
- Modify: `package.json`, `.env`, `.env.example`

- [x] **Step 1: פעולת משתמש — יצירת פרויקט Supabase (5 דקות, להב עושה):**
  1. supabase.com → Sign in → **New project**
  2. שם: `ait` · Region: **Frankfurt (eu-central-1)** · Database Password: לשמור במקום בטוח
  3. אחרי שהפרויקט עולה: **Connect** (כפתור למעלה) → לשונית **ORMs** → להעתיק את שני המשתנים המוצגים ל-`.env`:
     - `DATABASE_URL` (pooler, פורט 6543, עם `?pgbouncer=true`)
     - `DIRECT_URL` (חיבור ישיר, פורט 5432)

  להוסיף ל-`.env` (ול-`.env.example` עם ערכים ריקים):

```
# חיבור Supabase (פרנקפורט) — DATABASE_URL דרך ה-pooler לזמן ריצה, DIRECT_URL למיגרציות
DATABASE_URL=
DIRECT_URL=
```

- [x] **Step 2: התקנת Prisma**

```bash
npm i -D prisma && npm i @prisma/client
```

- [x] **Step 3: כתיבת הסכמה** — ליצור `prisma/schema.prisma` (בהתאמה מלאה לאפיון 9.5; תוספות מתועדות: `problem/solution/install_time` בקטלוג — נדרשים לכרטיסי מסך 5; `narrative` ב-scans — הדוח נשמר עם הסריקה):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [vector]
}

model Business {
  id        String      @id @default(uuid()) @db.Uuid
  name      String
  placeId   String?     @unique @map("place_id")
  website   String?
  city      String?
  createdAt DateTime    @default(now()) @map("created_at")
  diagnoses Diagnosis[]

  @@map("businesses")
}

model Diagnosis {
  id                String             @id @default(uuid()) @db.Uuid
  businessId        String             @map("business_id") @db.Uuid
  business          Business           @relation(fields: [businessId], references: [id])
  status            String             @default("created")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")
  scans             Scan[]
  interviewMessages InterviewMessage[]
  businessModel     BusinessModelRow?
  roadmaps          Roadmap[]

  @@index([businessId, status])
  @@map("diagnoses")
}

model Scan {
  id          String    @id @default(uuid()) @db.Uuid
  diagnosisId String    @map("diagnosis_id") @db.Uuid
  diagnosis   Diagnosis @relation(fields: [diagnosisId], references: [id])
  findings    Json
  scores      Json?
  narrative   Json?
  llmCost     Decimal?  @map("llm_cost") @db.Decimal(10, 4)
  apiCost     Decimal?  @map("api_cost") @db.Decimal(10, 4)
  durationMs  Int       @map("duration_ms")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([diagnosisId])
  @@map("scans")
}

model InterviewMessage {
  id          String    @id @default(uuid()) @db.Uuid
  diagnosisId String    @map("diagnosis_id") @db.Uuid
  diagnosis   Diagnosis @relation(fields: [diagnosisId], references: [id])
  role        String
  content     String
  questionKey String?   @map("question_key")
  isFreeText  Boolean   @default(false) @map("is_free_text")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([diagnosisId, createdAt])
  @@map("interview_messages")
}

model BusinessModelRow {
  id              String    @id @default(uuid()) @db.Uuid
  diagnosisId     String    @unique @map("diagnosis_id") @db.Uuid
  diagnosis       Diagnosis @relation(fields: [diagnosisId], references: [id])
  data            Json
  fieldSources    Json      @map("field_sources")
  credits         Json
  completenessPct Int       @map("completeness_pct")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@map("business_models")
}

model Roadmap {
  id          String        @id @default(uuid()) @db.Uuid
  diagnosisId String        @map("diagnosis_id") @db.Uuid
  diagnosis   Diagnosis     @relation(fields: [diagnosisId], references: [id])
  createdAt   DateTime      @default(now()) @map("created_at")
  items       RoadmapItem[]

  @@index([diagnosisId])
  @@map("roadmaps")
}

model RoadmapItem {
  id         String             @id @default(uuid()) @db.Uuid
  roadmapId  String             @map("roadmap_id") @db.Uuid
  roadmap    Roadmap            @relation(fields: [roadmapId], references: [id])
  catalogId  String             @map("catalog_id") @db.Uuid
  catalog    OpportunityCatalog @relation(fields: [catalogId], references: [id])
  score      Int
  confidence String
  phase      String
  status     String             @default("proposed")
  briefs     Brief[]

  @@index([roadmapId, phase, score(sort: Desc)])
  @@index([catalogId])
  @@map("roadmap_items")
}

model Brief {
  id            String      @id @default(uuid()) @db.Uuid
  roadmapItemId String      @map("roadmap_item_id") @db.Uuid
  roadmapItem   RoadmapItem @relation(fields: [roadmapItemId], references: [id])
  content       String
  sentAt        DateTime?   @map("sent_at")
  createdAt     DateTime    @default(now()) @map("created_at")

  @@index([roadmapItemId])
  @@map("briefs")
}

model OpportunityCatalog {
  id          String                       @id @default(uuid()) @db.Uuid
  name        String                       @unique
  problem     String
  solution    String
  conditions  Json
  costRange   String                       @map("cost_range")
  savingRange String                       @map("saving_range")
  complexity  String
  installTime String                       @map("install_time")
  embedding   Unsupported("vector(768)")?
  items       RoadmapItem[]
  benchmarks  Benchmark[]

  @@map("opportunity_catalog")
}

model Benchmark {
  id         String             @id @default(uuid()) @db.Uuid
  catalogId  String             @map("catalog_id") @db.Uuid
  catalog    OpportunityCatalog @relation(fields: [catalogId], references: [id])
  metric     String
  range      String
  source     String
  verifiedAt DateTime           @map("verified_at")

  @@index([catalogId])
  @@map("benchmarks")
}
```

> **הערת as-built (אחרי חסימה בשלב המיגרציה):** הרצה ראשונה של `npx prisma migrate dev --name init` (עם `previewFeatures = ["postgresqlExtensions"]` ו-`extensions = [vector]` כפי שמתועד למעלה) נחסמה ב-drift: פרויקט Supabase חדש מגיע עם ארבע הרחבות מותקנות מראש בסכמת `public` (`pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`). כש-`postgresqlExtensions` פעיל, Prisma תופס בעלות על כל רשימת ההרחבות ב-`public`, משווה מול סכמה ריקה, רואה את ארבע ההרחבות הקיימות כ"סטייה", ומציע כפתרון יחיד `prisma migrate reset` — מחיקת כל הסכמה. זו בדיוק תרחיש "מבקש למחוק" שנאסר על סוכן אוטומטי לבצע בלי אישור — הריצה נעצרה לפני כל DDL (לא נוצרה תיקיית מיגרציה, ה-DB לא נגע).
>
> **ההחלטה:** להפסיק לנהל הרחבות דרך Prisma לגמרי. מהסכמה הוסרו `previewFeatures = ["postgresqlExtensions"]` (מ-`generator client`) ו-`extensions = [vector]` (מ-`datasource db`), עם הערת עברית מעל ה-datasource שמסבירה למה. `Unsupported("vector(768)")?` בעמודת `embedding` נשאר בדיוק כפי שמתועד למעלה — הוא לא תלוי בדגל ה-preview. במקום זאת, ההרחבה `vector` נוצרת ידנית כשורת SQL ראשונה במיגרציית ה-init עצמה:
>
> ```sql
> CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
> ```
>
> `IF NOT EXISTS` הופך את זה לאידמפוטנטי — replay של המיגרציה על DB נקי (כמו ה-shadow database שפריזמה מריצה בכל `migrate dev`) יוצר את ההרחבה מאפס לפני ה-`CREATE TABLE` של `opportunity_catalog`, כך שהטיפוס `vector(768)` זמין כשצריך.
>
> תהליך תיקון: `npx prisma migrate dev --name init --create-only` (יוצר את `migration.sql` בלי להחיל — ובלי תלונת drift, כי הרחבות כבר לא "עסק" של Prisma) → הוספת שורת ה-`CREATE EXTENSION` בראש הקובץ (**לפני** החלה — עריכת מיגרציה שכבר הוחלה שוברת checksums) → `npx prisma migrate dev` (מחיל, מריץ `prisma generate`). שני הריצות היו נקיות ללא drift נוסף. מקור מחייב: `prisma/schema.prisma`, `prisma/migrations/20260813144212_init/migration.sql`.

- [x] **Step 4: ולידציה ומיגרציה**

```bash
npx prisma validate
npx prisma migrate dev --name init --create-only   # כפי שתועד למעלה — לא --name init ישירות
```

בפועל: `npx prisma validate` נקי; `npx prisma migrate dev --name init --create-only` יצר את המיגרציה בלי drift; הוספת `CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;` בראש `migration.sql`; `npx prisma migrate dev` החיל אותה. `npx prisma migrate status` → "Database schema is up to date!".

- [x] **Step 5: סקריפט generate** — ב-`package.json` להוסיף ל-scripts:

```json
    "postinstall": "prisma generate"
```

- [x] **Step 6: לוודא שהחבילה הקיימת ירוקה** — `npm run typecheck && npm test` → נקי (הסכמה לא נוגעת בקוד). בפועל: `npx vitest run` → 149/149 PASS (14 קבצים); `npm run typecheck` → נקי.

- [x] **Step 7: commit** — `git add -A && git commit -m "feat: full Prisma schema per spec 9.5 (all milestone tables, pgvector ready) on Supabase Frankfurt"`
  (לוודא ש-`.env` לא בקומיט — הוא ב-gitignore.)

---

### משימה 10: Seed — קטלוג הזדמנויות ובנצ'מרקים

10 פריטים ראשוניים. `conditions.gapKeys` מפנה למפתחות חוקים מ-`dimensions.ts` — כך ההתאמה באבן דרך 4 תהיה דטרמיניסטית. טווחים מהאפיון (5) ומהיכרות השוק; המייסדים מרחיבים ידנית בהמשך.

> **חוסמים למשימת ההתאמה של אבן דרך 4 (מסקירת משימה 10):** (א) פריטי הוואטסאפ 2 ו-8 חולקים מפתח `whatsapp` עם פער מחירים פי 15 — נדרש כלל בכירות/דירוג (שדה tier או prerequisite) לפני שההתאמה נחשפת ללקוח. (ב) 8 מ-10 טווחי המחיר עדיין בלי שורת בנצ'מרק עם מקור — סקירת מייסדים למחירים לפני שטווח כלשהו מגיע ל-Project Brief (נמסר ללהב כמשימה מקבילה, 2026-08-13). (ג) שקילת מפתח upsert יציב (slug) במקום השם העברי התצוגתי — שינוי שם היום משאיר שורה יתומה.

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

- [x] **Step 1: כתיבת ה-seed** — ליצור `prisma/seed.ts`:

```ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// verified_at קבוע — מתי נבדקו הטווחים מול השוק. מתעדכן ידנית בכל רענון מחירים
const VERIFIED = new Date("2026-08-13");

interface CatalogSeed {
  name: string;
  problem: string;
  solution: string;
  conditions: { gapKeys: string[] };
  costRange: string;
  savingRange: string;
  complexity: "low" | "medium" | "high";
  installTime: string;
  benchmarks?: { metric: string; range: string; source: string }[];
}

const CATALOG: CatalogSeed[] = [
  {
    name: "סוכן AI לטיפול בלידים",
    problem: "פניות נכנסות לא נענות מהר, לידים מתקררים והולכים למתחרים",
    solution: "סוכן AI בעברית שעונה לכל פנייה תוך שניות, מסנן, מתעד ומעביר לבן אדם רק כשצריך",
    conditions: { gapKeys: ["contact_form", "lead_handling"] },
    costRange: "₪1,000–2,500 לחודש",
    savingRange: "10–20 שעות עבודה בחודש",
    complexity: "medium",
    installTime: "שבוע–שבועיים",
    benchmarks: [{ metric: "עלות חודשית לסוכן AI בעברית", range: "₪1,000–2,500", source: "מחקר שוק AIT 08/2026" }],
  },
  {
    name: "בוט וואטסאפ לשירות לקוחות",
    problem: "שאלות חוזרות מעמיסות על הטלפון, ופניות מחוץ לשעות הפעילות אובדות",
    solution: "בוט וואטסאפ שעונה על השאלות הנפוצות 24/7 ומעביר שיחות מורכבות לצוות",
    conditions: { gapKeys: ["whatsapp", "chat_widget"] },
    costRange: "₪3,500–12,000 הקמה",
    savingRange: "5–15 שעות מענה בשבוע",
    complexity: "medium",
    installTime: "2–4 שבועות",
    benchmarks: [{ metric: "הקמת בוט וואטסאפ מלא", range: "₪3,500–12,000", source: "מחקר שוק AIT 08/2026" }],
  },
  {
    name: "קביעת תורים אונליין",
    problem: "כל תיאום תור דורש שיחת טלפון בשעות הפעילות — חיכוך ללקוח ועומס לצוות",
    solution: "יומן תורים אונליין (תשתית ייעודית) מוטמע באתר ובפרופיל גוגל",
    conditions: { gapKeys: ["online_booking"] },
    costRange: "₪100–400 לחודש",
    savingRange: "3–6 שעות תיאומים בשבוע",
    complexity: "low",
    installTime: "עד שבוע",
  },
  {
    name: "הקמת פרופיל Google Business",
    problem: "העסק לא מופיע במפות גוגל — לקוחות שמחפשים בסביבה לא מוצאים אותו",
    solution: "הקמה ומילוי מלא של פרופיל העסק: פרטים, תמונות, שעות, קטגוריות ופוסטים",
    conditions: { gapKeys: ["gbp_exists"] }, // gbp_rating הוסר בסקירה — נבדק רק כשכבר יש פרופיל
    costRange: "₪0–1,500 חד־פעמי",
    savingRange: "חשיפה מקומית שאובדת היום לגמרי",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "איסוף ביקורות אוטומטי",
    problem: "לקוחות מרוצים לא משאירים ביקורות, והפרופיל נראה דל מול מתחרים",
    solution: "שליחה אוטומטית של בקשת ביקורת (וואטסאפ/SMS) אחרי כל שירות",
    conditions: { gapKeys: ["has_reviews", "review_volume"] },
    costRange: "₪150–500 לחודש",
    savingRange: "צמיחה עקבית במאגר הביקורות",
    complexity: "low",
    installTime: "עד שבוע",
  },
  {
    name: "ניהול ומענה לביקורות",
    problem: "ביקורות שליליות עומדות בלי מענה ופוגעות באמון של לקוחות חדשים",
    solution: "ניטור ביקורות + טיוטות מענה מנומס בעברית לכל ביקורת, לאישור בעל העסק",
    conditions: { gapKeys: ["no_problem_themes"] },
    costRange: "₪300–800 לחודש",
    savingRange: "הגנה על המוניטין — הנכס שמביא לקוחות",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "שיפור מהירות האתר",
    problem: "האתר נטען לאט במובייל — גולשים נוטשים לפני שראו בכלל את התוכן",
    solution: "אופטימיזציית תמונות, קאשינג וסקריפטים; יעד: LCP מתחת ל-4 שניות",
    conditions: { gapKeys: ["perf", "lcp"] },
    costRange: "₪1,500–6,000 חד־פעמי",
    savingRange: "פחות נטישה בכניסה — כל התקציב השיווקי עובד יותר",
    complexity: "medium",
    installTime: "1–2 שבועות",
  },
  {
    name: "חיבור וואטסאפ לאתר",
    problem: "אין דרך מהירה לפנות לעסק — הערוץ שהלקוח הישראלי הכי מצפה לו חסר",
    solution: "כפתור וואטסאפ צף באתר + קישור ישיר בפרופיל גוגל",
    conditions: { gapKeys: ["whatsapp"] },
    costRange: "₪200–800 חד־פעמי",
    savingRange: "פניות שהיום פשוט לא נשלחות",
    complexity: "low",
    installTime: "יום",
  },
  {
    name: "התקנת מדידה (Analytics + פיקסל)",
    problem: "אין נתונים על מי מבקר באתר ומאיפה — החלטות שיווק מתקבלות באפלה",
    solution: "התקנת GA4 ופיקסל Meta + הגדרת אירועי המרה בסיסיים",
    conditions: { gapKeys: ["analytics", "fb_pixel"] },
    costRange: "₪800–2,500 חד־פעמי",
    savingRange: "יכולת רימרקטינג ומדידת החזר על פרסום",
    complexity: "low",
    installTime: "ימים בודדים",
  },
  {
    name: "חיבור לידים ל-CRM והתראות",
    problem: "פניות מהאתר מגיעות למייל ונקברות שם — אין מעקב מי טופל ומי נפל",
    solution: "כל פנייה נרשמת אוטומטית ב-CRM עם התראה מיידית לוואטסאפ של המטפל",
    conditions: { gapKeys: ["contact_form", "lead_handling", "email_link"] }, // email_link מבדיל מפריט 1
    costRange: "₪1,200–4,000 הקמה",
    savingRange: "אפס לידים שנופלים בין הכיסאות",
    complexity: "medium",
    installTime: "1–2 שבועות",
  },
];

async function main() {
  for (const item of CATALOG) {
    const { benchmarks, ...fields } = item;
    const row = await prisma.opportunityCatalog.upsert({
      where: { name: fields.name },
      update: { ...fields, conditions: fields.conditions },
      create: { ...fields, conditions: fields.conditions },
    });
    for (const b of benchmarks ?? []) {
      // אין unique טבעי לבנצ'מרק — מוחקים ויוצרים מחדש לאותו קטלוג כדי להישאר אידמפוטנטיים
      await prisma.benchmark.deleteMany({ where: { catalogId: row.id, metric: b.metric } });
      await prisma.benchmark.create({ data: { ...b, catalogId: row.id, verifiedAt: VERIFIED } });
    }
  }
  const count = await prisma.opportunityCatalog.count();
  console.log(`קטלוג: ${count} פריטים`);
}

main().finally(() => prisma.$disconnect());
```

> **הערת as-built (אחרי הרצה מול ה-DB החי):** נבדקו כל 14 ה-`gapKeys` הייחודיים שמופיעים בקטלוג (10 פריטים) מול מפתחות החוקים בפועל ב-`src/pipeline/score/dimensions.ts` — כולם קיימים ותקפים, אין אזכור ל-`platform_known` (המפתח שהוסר בסבב הסקירה) ואין מפתח יתום אחר. **לא נדרש תיקון** לנתוני ה-seed שבתוכנית — הקוד נשתל כלשונו. `prisma/seed.ts` הורץ פעמיים מול Supabase (פרנקפורט) ואומת בסקריפט חד-פעמי (נמחק אחרי): `opportunity_catalog` = 10 שורות, `benchmarks` = 2 שורות (התואם ל-2 הפריטים בקטלוג עם `benchmarks`). שים לב: `tsconfig.json` כולל רק `["src", "tests"]` — `prisma/` **לא** נכלל ב-`npm run typecheck`; הקובץ נבדק ידנית עם `tsc --noEmit` על אותן הגדרות קומפיילר ויצא נקי.

- [x] **Step 2: סקריפט** — ב-`package.json`:

```json
    "db:seed": "tsx prisma/seed.ts"
```

- [x] **Step 3: הרצה כפולה (אידמפוטנטיות)**

```bash
npm run db:seed && npm run db:seed
```

Expected: פעמיים `קטלוג: 10 פריטים` — בלי שגיאת כפילות.

אומת בפועל: שתי ריצות עצמאיות (לא רצף `&&` אחד, אלא שתי קריאות `npm run db:seed` נפרדות) — שתיהן הדפיסו `קטלוג: 10 פריטים` בלי שגיאת מפתח כפול.

- [x] **Step 4: commit** — `git add -A && git commit -m "feat: seed opportunity catalog (10 items) + benchmarks, idempotent"`

---

### משימה 11: שכבת שמירה — repo דק וממפים טהורים

הלוגיקה (ממפים, ולידציית מעברים) טהורה ונבדקת; קריאות Prisma דקות ונבדקות עם fake פשוט.

> **הערה מסקירת משימה 9 (לעתיד, לא חוסם):** כל ה-FKs הם ON DELETE RESTRICT (ברירת המחדל של Prisma). ב-MVP אף זרימה לא מוחקת אבחונים (ריצה חוזרת = שורת diagnosis חדשה), אז זה בטוח. אם אי פעם תתווסף מחיקת אבחון — להוסיף מיגרציה עם onDelete: Cascade על ילדי diagnosis (scans, interview_messages, business_models, roadmaps→items→briefs), ולהשאיר Restrict על roadmap_items.catalog_id כדי שקטלוג לא יימחק מתחת ל-Roadmap חי.

**Files:**
- Create: `src/server/db.ts`, `src/server/diagnosis-repo.ts`
- Test: `tests/diagnosis-repo.test.ts`

- [ ] **Step 1: מבחן נכשל** — ליצור `tests/diagnosis-repo.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { toScanRow, transitionDiagnosis, createDiagnosisForBusiness } from "../src/server/diagnosis-repo";
import type { ScanFindings } from "../src/pipeline/types";

const FINDINGS: ScanFindings = {
  business: { placeId: "p1", name: "עסק", website: "https://x.co.il" },
  partial: [],
  meta: { startedAt: "2026-08-13T00:00:00Z", durationMs: 20000, placesCalls: 2, llmInputTokens: 100, llmOutputTokens: 50, estCostUsd: 0.06 },
};

describe("toScanRow", () => {
  it("maps findings/scores/narrative to the scans columns", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, { headline: "h" } as never);
    expect(row.findings).toEqual(FINDINGS);
    expect(row.scores).toEqual({ overall: 70 });
    expect(row.narrative).toEqual({ headline: "h" });
    expect(row.apiCost).toBe(0.06);
    expect(row.llmCost).toBe(0); // שכבת חינם בפיתוח — עלות ה-LLM אפס עד בחירת מודל ייצור
    expect(row.durationMs).toBe(20000);
  });

  it("allows null scores/narrative (scan saved even when scoring fails)", () => {
    const row = toScanRow(FINDINGS, null, null);
    expect(row.scores).toBeNull();
    expect(row.narrative).toBeNull();
  });
});

function fakePrisma(currentStatus: string) {
  return {
    diagnosis: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "d1", status: currentStatus }),
      update: vi.fn().mockResolvedValue({}),
    },
    business: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "b1" }),
      create: vi.fn().mockResolvedValue({ id: "b1" }),
    },
  };
}

describe("transitionDiagnosis", () => {
  it("updates when the transition is legal", async () => {
    const prisma = fakePrisma("created");
    await transitionDiagnosis(prisma as never, "d1", "scanning");
    expect(prisma.diagnosis.update).toHaveBeenCalledWith({
      where: { id: "d1" }, data: { status: "scanning" },
    });
  });

  it("throws and does NOT update on an illegal transition", async () => {
    const prisma = fakePrisma("created");
    await expect(transitionDiagnosis(prisma as never, "d1", "roadmap_ready")).rejects.toThrow(/לא חוקי/);
    expect(prisma.diagnosis.update).not.toHaveBeenCalled();
  });
});

describe("createDiagnosisForBusiness", () => {
  it("upserts by placeId when present", async () => {
    const prisma = fakePrisma("created");
    (prisma as Record<string, unknown>).diagnosis = {
      ...prisma.diagnosis, create: vi.fn().mockResolvedValue({ id: "d9" }),
    };
    const result = await createDiagnosisForBusiness(prisma as never, {
      name: "עסק", placeId: "p1", website: "https://x.co.il",
    });
    expect(prisma.business.upsert).toHaveBeenCalled();
    expect(result).toEqual({ businessId: "b1", diagnosisId: "d9" });
  });

  it("falls back to website lookup when placeId is empty (no-GBP path)", async () => {
    const prisma = fakePrisma("created");
    (prisma as Record<string, unknown>).diagnosis = {
      ...prisma.diagnosis, create: vi.fn().mockResolvedValue({ id: "d9" }),
    };
    await createDiagnosisForBusiness(prisma as never, { name: "lavan", placeId: "", website: "https://lavan.co.il/" });
    expect(prisma.business.findFirst).toHaveBeenCalledWith({ where: { website: "https://lavan.co.il/" } });
    expect(prisma.business.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: לוודא כישלון** — `npx vitest run tests/diagnosis-repo.test.ts` → FAIL.

- [ ] **Step 3: מימוש**

`src/server/db.ts`:

```ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// PrismaClient יחיד לתהליך — ב-CLI זה טריוויאלי; ב-Next (תוכנית 2ב) globalThis מונע חיבורים כפולים ב-dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

`src/server/diagnosis-repo.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import type { ReportNarrative } from "../pipeline/report/narrative";
import type { BusinessModel } from "../pipeline/model/business-model";
import { assertTransition, type DiagnosisStatus } from "./status";

export interface ScanRow {
  findings: ScanFindings;
  scores: ScoreReport | null;
  narrative: ReportNarrative | null;
  llmCost: number;
  apiCost: number;
  durationMs: number;
}

// ממפה טהור — כל לוגיקת העמודות במקום אחד, נבדק אופליין
export function toScanRow(
  findings: ScanFindings,
  scores: ScoreReport | null,
  narrative: ReportNarrative | null,
): ScanRow {
  return {
    findings,
    scores,
    narrative,
    llmCost: 0, // שכבת החינם של Gemini; יתעדכן כשייבחר מודל ייצור (אפיון 9.3)
    apiCost: findings.meta.estCostUsd,
    durationMs: findings.meta.durationMs,
  };
}

export interface NewDiagnosisInput {
  name: string;
  placeId?: string;
  website?: string;
  city?: string;
}

export async function createDiagnosisForBusiness(
  prisma: PrismaClient,
  input: NewDiagnosisInput,
): Promise<{ businessId: string; diagnosisId: string }> {
  let businessId: string;
  if (input.placeId) {
    const business = await prisma.business.upsert({
      where: { placeId: input.placeId },
      update: { name: input.name, website: input.website, city: input.city },
      create: { name: input.name, placeId: input.placeId, website: input.website, city: input.city },
    });
    businessId = business.id;
  } else {
    // מסלול אתר-בלבד (no_gbp): אין placeId — מזהים לפי האתר
    const existing = await prisma.business.findFirst({ where: { website: input.website } });
    businessId = existing?.id
      ?? (await prisma.business.create({
        data: { name: input.name, website: input.website, city: input.city },
      })).id;
  }
  const diagnosis = await prisma.diagnosis.create({ data: { businessId } });
  return { businessId, diagnosisId: diagnosis.id };
}

export async function transitionDiagnosis(
  prisma: PrismaClient,
  diagnosisId: string,
  to: DiagnosisStatus,
): Promise<void> {
  const current = await prisma.diagnosis.findUniqueOrThrow({
    where: { id: diagnosisId }, select: { status: true },
  });
  assertTransition(current.status as DiagnosisStatus, to);
  await prisma.diagnosis.update({ where: { id: diagnosisId }, data: { status: to } });
}

export async function saveScanResult(
  prisma: PrismaClient,
  diagnosisId: string,
  row: ScanRow,
  model: BusinessModel,
): Promise<void> {
  await prisma.scan.create({
    data: {
      diagnosisId,
      findings: row.findings as object,
      scores: (row.scores ?? undefined) as object | undefined,
      narrative: (row.narrative ?? undefined) as object | undefined,
      llmCost: row.llmCost,
      apiCost: row.apiCost,
      durationMs: row.durationMs,
    },
  });
  await prisma.businessModelRow.upsert({
    where: { diagnosisId },
    update: {
      data: model.data, fieldSources: model.fieldSources, credits: model.credits,
      completenessPct: model.completenessPct,
    },
    create: {
      diagnosisId, data: model.data, fieldSources: model.fieldSources, credits: model.credits,
      completenessPct: model.completenessPct,
    },
  });
}
```

הערה למבצע: אם טיפוסי ה-Json של Prisma מתנגשים (`as object`), מותר `as Prisma.InputJsonValue` — לא `as any`.

- [ ] **Step 4: ירוק** — `npx vitest run tests/diagnosis-repo.test.ts` → PASS. `npm run typecheck` נקי.

- [ ] **Step 5: commit** — `git commit -am "feat: thin persistence layer - business upsert, status transitions, scan+model save"`

---

### משימה 12: CLI אבחון מלא — `npm run diagnose`

ההוכחה מקצה לקצה: שם עסק (או --url) ← סריקה ← ציונים ← מודל עסק ← נרטיב ← שמירה ל-DB לפי מכונת המצבים ← סיכום עברי + JSON.

**Files:**
- Create: `src/cli-shared.ts`, `src/cli-diagnose.ts`
- Modify: `src/cli.ts` (משתמש ב-cli-shared), `package.json`
- Test: `tests/cli-format.test.ts`

- [ ] **Step 1: חילוץ הבחירה המשותפת** — ליצור `src/cli-shared.ts` על ידי העברת הלוגיקה הקיימת מ-`src/cli.ts` (חיפוש, הדפסת מועמדים, `--pick`) לפונקציה משותפת. לשמר את ההתנהגות הקיימת אחד-לאחד, כולל פורמט ההדפסה:

```ts
import { searchBusiness } from "./pipeline/google/places";
import type { BusinessCandidate } from "./pipeline/types";

export interface PickResult {
  chosen?: BusinessCandidate;
  printed: string; // מה שמודפס למשתמש (רשימת מועמדים או הודעת שגיאה)
}

// מאתר עסק לפי שאילתה; אם יש כמה מועמדים ואין --pick — מחזיר רשימה להדפסה בלבד
export async function pickCandidate(query: string, pick?: number): Promise<PickResult> {
  const candidates = await searchBusiness(query);
  if (candidates.length === 0) return { printed: `לא נמצא עסק עבור "${query}"` };
  if (candidates.length === 1 || pick != null) {
    const index = (pick ?? 1) - 1;
    const chosen = candidates[index];
    if (!chosen) return { printed: `--pick ${pick} מחוץ לטווח (נמצאו ${candidates.length} מועמדים)` };
    return { chosen, printed: "" };
  }
  const lines = candidates.map((c, i) => {
    const extra = c.rating != null ? ` (⭐ ${c.rating}, ${c.reviewCount ?? 0} ביקורות)` : "";
    return `  ${i + 1}. ${c.name} — ${c.address}${extra}`;
  });
  return { printed: `נמצאו כמה מועמדים — הריצו שוב עם --pick <מספר>:\n${lines.join("\n")}` };
}
```

(אם החתימות ב-`src/cli.ts` שונות מעט — המקור הקיים קובע; המטרה היא חילוץ, לא שכתוב.) לעדכן את `src/cli.ts` להשתמש ב-`pickCandidate` ולוודא ש-`npm run scan` מתנהג בדיוק כמו קודם (להריץ `npm run scan -- "בדיקה"` ידנית אם יש ספק).

- [ ] **Step 2: מבחן נכשל לפורמט הדוח** — ליצור `tests/cli-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDiagnosisSummary } from "../src/cli-diagnose";
import type { ScoreReport } from "../src/pipeline/score/types";
import type { BusinessModel } from "../src/pipeline/model/business-model";

const SCORE: ScoreReport = {
  overall: 63,
  dimensions: [
    { key: "visibility", label: "נראות דיגיטלית", weight: 0.2, score: 55, dataStatus: "full", rules: [] },
    { key: "process", label: "בשלות תהליכים", weight: 0.2, score: null, dataStatus: "none", rules: [] },
    { key: "accessibility", label: "נגישות ללקוח", weight: 0.25, score: 80, dataStatus: "partial", rules: [] },
  ],
  topGaps: [{ dimension: "accessibility", ruleKey: "online_booking", text: "אין קביעת תור אונליין", points: 30 }],
  topStrengths: [{ dimension: "visibility", ruleKey: "has_website", text: "לעסק יש אתר", points: 20 }],
};

const MODEL: BusinessModel = {
  data: {} as never,
  fieldSources: {},
  credits: {
    profile: 0.5, channels: 0.5, lead_flow: 0.5, scheduling: 0.5, service: 0.5,
    billing: 0, retention: 0, tools: 0.5, pains: 0.5, manual_tasks: 0,
  },
  completenessPct: 35,
};

describe("formatDiagnosisSummary", () => {
  it("shows overall, per-dimension lines with data tags, gaps, strengths and completeness", () => {
    const text = formatDiagnosisSummary(SCORE, MODEL, {
      action: "interview", reason: "השלם כמה שאלות על טיפול בלידים",
    });
    expect(text).toContain("63");
    expect(text).toContain("נראות דיגיטלית: 55");
    expect(text).toContain("מידע חלקי");   // תג על accessibility
    expect(text).toContain("אין מידע");     // תג על process
    expect(text).toContain("אין קביעת תור אונליין");
    expect(text).toContain("לעסק יש אתר");
    expect(text).toContain("35%");
    expect(text).toContain("טיפול בלידים");
  });
});
```

- [ ] **Step 3: לוודא כישלון** — `npx vitest run tests/cli-format.test.ts` → FAIL.

- [ ] **Step 4: מימוש** — ליצור `src/cli-diagnose.ts`:

```ts
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./pipeline/scan";
import { scanWebsiteOnly, normalizeSiteUrl } from "./pipeline/scan-website";
import { scoreFindings } from "./pipeline/score/engine";
import { DIMENSIONS } from "./pipeline/score/dimensions";
import { deriveBusinessModel, recommendNextStep, type BusinessModel, type NextStepRecommendation } from "./pipeline/model/business-model";
import { generateNarrative } from "./pipeline/report/narrative";
import type { ScoreReport } from "./pipeline/score/types";
import { slugify } from "./pipeline/slug";
import { pickCandidate } from "./cli-shared";
import { prisma } from "./server/db";
import { createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow } from "./server/diagnosis-repo";

const DATA_TAG: Record<string, string> = { partial: " (מידע חלקי)", none: " (אין מידע)" };

export function formatDiagnosisSummary(
  score: ScoreReport,
  model: BusinessModel,
  nextStep: NextStepRecommendation,
): string {
  const lines: string[] = [];
  lines.push(score.overall == null ? "ציון כולל: אין מספיק מידע" : `ציון כולל: ${score.overall}/100`);
  for (const d of score.dimensions) {
    const tag = DATA_TAG[d.dataStatus] ?? "";
    lines.push(`  ${d.label}: ${d.score ?? "—"}${tag}`);
  }
  if (score.topGaps.length > 0) {
    lines.push("פערים מובילים:");
    for (const g of score.topGaps) lines.push(`  ✗ ${g.text}`);
  }
  if (score.topStrengths.length > 0) {
    lines.push("מה עובד טוב:");
    for (const s of score.topStrengths) lines.push(`  ✓ ${s.text}`);
  }
  lines.push(`שלמות האבחון: ${model.completenessPct}% · הצעד הבא: ${nextStep.reason}`);
  return lines.join("\n");
}

function parseArgs(argv: string[]): { query: string; pick?: number; url?: string } {
  const args = [...argv];
  let pick: number | undefined;
  let url: string | undefined;
  for (let i = args.length - 1; i >= 0; i--) {
    const eq = args[i].match(/^--pick=(\d+)$/);
    if (eq) { pick = Number(eq[1]); args.splice(i, 1); continue; }
    if (args[i] === "--pick" && args[i + 1]) { pick = Number(args[i + 1]); args.splice(i, 2); continue; }
    const urlEq = args[i].match(/^--url=(.+)$/);
    if (urlEq) { url = urlEq[1]; args.splice(i, 1); continue; }
    if (args[i] === "--url" && args[i + 1]) { url = args[i + 1]; args.splice(i, 2); continue; }
  }
  return { query: args.join(" ").trim(), pick, url };
}

async function main() {
  const { query, pick, url } = parseArgs(process.argv.slice(2));
  if (!query && !url) {
    console.log('שימוש: npm run diagnose -- "שם עסק עיר" [--pick N] | npm run diagnose -- --url https://…');
    process.exit(1);
  }

  // שלב 1: איתור/סריקה
  let findings;
  if (url) {
    console.log(`🌐 אבחון אתר-בלבד: ${url}`);
    findings = null; // הסריקה אחרי יצירת האבחון — כדי שהסטטוס ישקף אמת
  } else {
    const picked = await pickCandidate(query, pick);
    if (!picked.chosen) { console.log(picked.printed); process.exit(1); }
    console.log(`🏢 מאבחן את: ${picked.chosen.name} — ${picked.chosen.address}`);
    findings = picked.chosen;
  }

  // שלב 2: יצירת עסק+אבחון ב-DB (סטטוס created)
  // normalizeSiteUrl (לא בנייה ידנית) — מנרמל סכמה, רישיות וסלאש כך שאותו אתר בכתיבים שונים יתמפה לאותה שורת Business.
  // הערה: וריאנט עם/בלי www נשאר שתי כתובות שונות (מקובל ל-MVP פנימי); אם יפריע — להסיר www במפתח החיפוש במשימה 11.
  const siteUrl = url ? normalizeSiteUrl(url) : undefined;
  const created = await createDiagnosisForBusiness(prisma, siteUrl
    ? { name: siteUrl.hostname.replace(/^www\./, ""), placeId: "", website: siteUrl.href }
    : { name: findings!.name, placeId: findings!.placeId, city: undefined });
  console.log(`📋 אבחון ${created.diagnosisId} נוצר`);

  // שלב 3: סריקה תחת סטטוס scanning; כישלון מחזיר ל-created
  await transitionDiagnosis(prisma, created.diagnosisId, "scanning");
  let scan;
  try {
    scan = url
      ? await scanWebsiteOnly(url)
      : await runScan(findings!.placeId, undefined, { priorPlacesCalls: 1 });
  } catch (err) {
    await transitionDiagnosis(prisma, created.diagnosisId, "created");
    throw err;
  }
  await transitionDiagnosis(prisma, created.diagnosisId, "scanned");

  // שלב 4: ציונים, מודל עסק, נרטיב (נרטיב שנכשל לא מפיל אבחון — יש fallback בפנים)
  const score = scoreFindings(DIMENSIONS, scan);
  const model = deriveBusinessModel(scan);
  const nextStep = recommendNextStep(model);
  const narrative = await generateNarrative(scan, score);

  // שלב 5: שמירה ומעבר ל-report_ready
  await saveScanResult(prisma, created.diagnosisId, toScanRow(scan, score, narrative.narrative), model);
  await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");

  // שלב 6: פלט
  mkdirSync("output", { recursive: true });
  const file = join("output", `${slugify(scan.business.name)}-diagnosis-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ findings: scan, score, model, nextStep, narrative }, null, 2), "utf8");

  console.log("\n✅ האבחון הושלם ונשמר (status: report_ready)\n");
  console.log(`📣 ${narrative.narrative.headline}${narrative.usedFallback ? " (נרטיב תבנית — LLM לא אושר)" : ""}`);
  console.log(narrative.narrative.summary + "\n");
  console.log(formatDiagnosisSummary(score, model, nextStep));
  console.log(`\n   קובץ: ${file}`);
  console.log(`   משך סריקה: ${(scan.meta.durationMs / 1000).toFixed(1)} שנ' · עלות Places: $${scan.meta.estCostUsd.toFixed(3)} · טוקנים: ${scan.meta.llmInputTokens + narrative.usage.inputTokens} in / ${scan.meta.llmOutputTokens + narrative.usage.outputTokens} out`);
  if (scan.partial.length > 0) console.log(`   דגלים: ${scan.partial.join(", ")}`);
}

// מריצים רק כשהקובץ הוא נקודת הכניסה — לא כשמייבאים את formatDiagnosisSummary במבחנים
if (process.argv[1]?.endsWith("cli-diagnose.ts")) {
  main()
    .catch((err) => { console.error("❌ האבחון נכשל:", err instanceof Error ? err.message : err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
```

וב-`package.json`:

```json
    "diagnose": "tsx src/cli-diagnose.ts"
```

- [ ] **Step 5: ירוק** — `npx vitest run` → כל החבילה PASS. `npm run typecheck` נקי.

- [ ] **Step 6: בדיקת עשן חיה (עם המפתחות האמיתיים)**

```bash
npm run diagnose -- "אופטיקה בק עפולה"
npm run diagnose -- --url https://www.lavangroup.co.il/
```

Expected: שניהם מסתיימים ב-`report_ready`, מדפיסים ציון, פערים, חוזקות, שלמות וצעד הבא; ללבן גרופ הפער המוביל הוא היעדר פרופיל גוגל וממד המוניטין "אין מידע".

- [ ] **Step 7: commit** — `git add -A && git commit -m "feat: full diagnose CLI - scan to scored report persisted through the state machine"`

---

### משימה 13: שער יציאה 2א

**Files:**
- Create: `docs/milestone-2a-gate.md`

- [ ] **Step 1: יצירת מסמך השער** — ליצור `docs/milestone-2a-gate.md`:

```markdown
# שער יציאה — אבן דרך 2א

מריצים `npm run diagnose` על שלושת עסקי הייחוס ובודקים:

| # | עסק | פקודה | ציון כולל סביר? | פערים נכונים? | status סופי | תקין? |
|---|------|--------|------------------|----------------|--------------|-------|
| 1 | אופטיקה בק עפולה (עשיר) | `npm run diagnose -- "אופטיקה בק עפולה"` | | | | |
| 2 | בית מאפה ברכת רחל ב"ש (דל) | `npm run diagnose -- "בית מאפה ברכת רחל באר שבע"` | | | | |
| 3 | לבן גרופ (אתר-בלבד) | `npm run diagnose -- --url https://www.lavangroup.co.il/` | | | | |

## בדיקות רוחב
- [ ] ב-DB (Supabase Table Editor): שורות ב-businesses / diagnoses / scans / business_models לכל ריצה
- [ ] כל האבחונים בסטטוס `report_ready`; אין אבחון תקוע ב-`scanning`
- [ ] עסק דל: ממדים חסרי-מידע מוצגים "אין מידע" — לא ציון 0
- [ ] הנרטיב לא מכיל אף מספר שלא קיים בנתונים (בדיקה ידנית מול קובץ הפלט)
- [ ] אפס טקסט ביקורות גולמי ואפס שמות בכל מה שנשמר ל-DB (בדיקת עמודת findings)
- [ ] `npm test` — כל החבילה ירוקה; `npm run typecheck` נקי

## החלטת השער
- [ ] עובר — כותבים את תוכנית 2ב (מסכים 1–3)
- [ ] לא עובר — מה חסר: ________________
```

- [ ] **Step 2: מילוי הטבלה** — להריץ את שלוש הפקודות, למלא את הטבלה ואת הצ'קבוקסים לפי התוצאות בפועל (לא למלא מראש).

- [ ] **Step 3: commit** — `git add -A && git commit -m "docs: milestone-2a exit gate results"`

---

## סקירה עצמית (בוצעה בכתיבת התוכנית)

- **כיסוי אפיון:** מכונת מצבים (9.4) → משימה 4; מנוע ציונים דטרמיניסטי + degradation (6) → משימות 5–6; מודל עסק + מקורות + מד שלמות (7, 3.2) → משימה 7; LLM כותב נרטיב ולא מספרים (5, 6) → משימה 8; סכמה מלאה + אינדקסים + pgvector (9.5) → משימה 9; קטלוג ובנצ'מרקים ידניים (5) → משימה 10; שמירה מיידית של הכול (3.1) → משימות 11–12; מדידת עלות לאבחון (9.6) → נשמרת ב-scans ומודפסת ב-CLI. מסכים 1–3, ראיון ו-Roadmap — במכוון מחוץ לתוכנית (2ב ואבני דרך 3–4).
- **אין placeholders:** כל משימה עם קוד מלא ופקודות מדויקות.
- **עקביות טיפוסים:** `ScoreReport`/`DimensionScore`/`Highlight` (משימה 5) נצרכים כלשונם במשימות 8, 11, 12; `BusinessModel` (משימה 7) במשימות 11–12; `DiagnosisStatus` (משימה 4) במשימה 11; `jsRendered`/`no_gbp` (משימות 2–3) בממדים (משימה 6).
```
