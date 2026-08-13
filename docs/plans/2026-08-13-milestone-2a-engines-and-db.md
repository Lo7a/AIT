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

- [ ] **Step 1: מבחן נכשל** — ליצור `tests/dimensions.test.ts`:

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

- [ ] **Step 2: לוודא כישלון** — `npx vitest run tests/dimensions.test.ts` → FAIL.

- [ ] **Step 3: מימוש** — ליצור `src/pipeline/score/dimensions.ts`:

```ts
import type { ScanFindings } from "../types";
import type { DimensionDef } from "./types";

// עזרי "ידוע": מתי מותר בכלל להסיק מהאותות
const noGbp = (f: ScanFindings) => f.partial.includes("no_gbp");
const crawlUsable = (f: ScanFindings) => !!f.websiteSignals && !f.partial.includes("js_rendered");
const reviewsAnalyzed = (f: ScanFindings) => !!f.reviewInsights && f.reviewInsights.totalAnalyzed > 0;

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
        known: () => true, earned: (f) => !f.partial.includes("no_website"),
        gapText: () => "לעסק אין אתר — אין בית דיגיטלי להפנות אליו לקוחות",
        okText: () => "לעסק יש אתר",
      },
      {
        key: "perf", points: 20,
        known: (f) => f.pageSpeed?.performanceScore != null,
        earned: (f) => (f.pageSpeed?.performanceScore ?? 0) >= 70,
        gapText: (f) => `ציון ביצועי מובייל ${f.pageSpeed?.performanceScore}/100 — אתר איטי מבריח לקוחות`,
        okText: (f) => `ביצועי מובייל טובים (${f.pageSpeed?.performanceScore}/100)`,
      },
      {
        key: "lcp", points: 15,
        known: (f) => f.pageSpeed?.lcpMs != null,
        earned: (f) => (f.pageSpeed?.lcpMs ?? Infinity) <= 4000,
        gapText: (f) => `העמוd הראשי נטען ${sec(f.pageSpeed?.lcpMs)} שניות — הרבה מעל היעד של 4`,
        okText: (f) => `זמן טעינה תקין (${sec(f.pageSpeed?.lcpMs)} שניות)`,
      },
      {
        key: "seo", points: 10,
        known: (f) => f.pageSpeed?.seoScore != null,
        earned: (f) => (f.pageSpeed?.seoScore ?? 0) >= 90,
        gapText: (f) => `ציון SEO ${f.pageSpeed?.seoScore}/100 — יש בעיות בסיסיות באינדוקס`,
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
        gapText: () => "אין דירוג בגוגל — סימן לפרופיל רדום",
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
        gapText: (f) => `רק ${f.business.reviewCount ?? 0} ביקורות בגוגל — מעט מדי בשביל לבנות אמון`,
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
        earned: (f) => (f.reviewInsights?.problemThemes.length ?? 0) === 0,
        gapText: (f) => `הביקורות חוזרות על בעיות: ${f.reviewInsights?.problemThemes.slice(0, 2).map((t) => t.theme).join("; ")}`,
        okText: () => "לא עולות בעיות חוזרות מהביקורות",
      },
      {
        key: "positive_themes", points: 15,
        known: reviewsAnalyzed,
        earned: (f) => (f.reviewInsights?.positiveThemes.length ?? 0) > 0,
        gapText: () => "לא זוהו חוזקות עקביות בביקורות",
        okText: (f) => `לקוחות מפרגנים: ${f.reviewInsights?.positiveThemes[0]?.theme}`,
      },
    ],
  },
  {
    key: "accessibility", label: "נגישות ללקוח", weight: 0.25,
    rules: [
      {
        key: "phone_available", points: 15,
        known: () => true,
        earned: (f) => !!f.business.phone || !!f.websiteSignals?.hasPhoneLink,
        gapText: () => "אין מספר טלפון נגיש — לא בגוגל ולא באתר",
        okText: () => "טלפון נגיש ללקוחות",
      },
      {
        key: "whatsapp", points: 25,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasWhatsappLink,
        gapText: () => "אין קישור וואטסאפ באתר — הערוץ שלקוחות ישראלים מצפים לו",
        okText: () => "וואטסאפ זמין באתר",
      },
      {
        key: "contact_form", points: 15,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasContactForm,
        gapText: () => "אין טופס יצירת קשר באתר — לידים הולכים לאיבוד",
        okText: () => "יש טופס יצירת קשר",
      },
      {
        key: "online_booking", points: 30,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasOnlineBooking,
        gapText: () => "אין קביעת תור/הזמנה אונליין — כל תיאום דורש טלפון בשעות הפעילות",
        okText: () => "יש קביעת תור אונליין",
      },
      {
        key: "email_link", points: 15,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasEmailLink,
        gapText: () => "אין כתובת אימייל נגישה באתר",
        okText: () => "אימייל נגיש באתר",
      },
    ],
  },
  {
    key: "infrastructure", label: "תשתית דיגיטלית", weight: 0.15,
    rules: [
      {
        key: "analytics", points: 30,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasGoogleAnalytics,
        gapText: () => "אין Google Analytics — העסק עיוור לתנועה באתר שלו",
        okText: () => "יש מדידת תנועה (Analytics)",
      },
      {
        key: "fb_pixel", points: 25,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasFacebookPixel,
        gapText: () => "אין פיקסל פייסבוק — אי אפשר לעשות רימרקטינג למבקרים",
        okText: () => "פיקסל פייסבוק מותקן",
      },
      {
        key: "chat_widget", points: 20,
        known: crawlUsable, earned: (f) => !!f.websiteSignals?.hasChatWidget,
        gapText: () => "אין צ'אט באתר — פניות מחוץ לשעות הפעילות אובדות",
        okText: () => "יש צ'אט באתר",
      },
      {
        key: "platform_known", points: 10,
        known: (f) => !!f.websiteSignals, earned: (f) => f.websiteSignals?.platform != null,
        gapText: () => "פלטפורמת האתר לא זוהתה",
        okText: (f) => `האתר בנוי על ${f.websiteSignals?.platform}`,
      },
      {
        key: "multi_page", points: 15,
        known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
        gapText: () => "האתר רזה מאוד — עמודים בודדים בלבד",
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

**שים לב לבאג מכוון במבחן העצמי:** בשורת `gapText` של `lcp` כתוב "העמוd" — לתקן ל"העמוד" בזמן המימוש (בדיקת עירנות למבצע: טקסטים בעברית עוברים הגהה).

> **הערת אזהרה מראש (מסקירת איכות של משימה 3, לפני מימוש משימה 6):** חוק `phone_available` למעלה מוגדר `known: () => true` — זה שגוי עבור עסק במסלול `scanWebsiteOnly` (`no_gbp`) שה-crawl שלו נכשל (`crawl_failed`) או מרונדר-JS (`js_rendered`): במקרים האלה `websiteSignals` חסר או לא אמין, ואין מקור אחר לטלפון כי `business.phone` תמיד ריק ב-`no_gbp` (אין Places). כלומר `earned` יוצא תמיד `false`, ועם `known: () => true` הממד טוען בטעות "אין טלפון בשום מקום" במקום "אין מידע". בזמן המימוש לשנות ל-`known: (f) => !noGbp(f) || crawlUsable(f)` (שני העוזרים כבר מוגדרים למעלה בקובץ). בנוסף: משימה 12 צריכה להתייחס לכישלון כפול `crawl_failed`+`pagespeed_failed` במסלול `--url` ככישלון סריקה — לחזור לסטטוס `created` כמו כל כישלון סריקה אחר — ולא לשמור אבחון `report_ready` שלמעשה ריק.

- [ ] **Step 4: ירוק** — `npx vitest run tests/dimensions.test.ts` → PASS. `npm run typecheck` נקי.

- [ ] **Step 5: commit** — `git commit -am "feat: five scoring dimensions with Hebrew evidence texts (process deferred to interview)"`

---

### משימה 7: מודל העסק, מד השלמות והצעד הבא

הסריקה ממלאה חלקית (קרדיט 0.5 לסקציה); הראיון (אבן דרך 3) ישלים ל-1. המד = ממוצע הקרדיטים × 100.

**Files:**
- Create: `src/pipeline/model/business-model.ts`
- Test: `tests/business-model.test.ts`

- [ ] **Step 1: מבחן נכשל** — ליצור `tests/business-model.test.ts` (משתמש ב-fixtures `RICH` ו-`THIN` זהים לאלה של `tests/dimensions.test.ts` — להעתיק אותם לקובץ, לא לייבא בין קובצי מבחן):

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

- [ ] **Step 2: לוודא כישלון** — `npx vitest run tests/business-model.test.ts` → FAIL.

- [ ] **Step 3: מימוש** — ליצור `src/pipeline/model/business-model.ts`:

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

- [ ] **Step 4: ירוק** — `npx vitest run tests/business-model.test.ts` → PASS.

- [ ] **Step 5: commit** — `git commit -am "feat: business model derivation, completeness meter and next-step recommendation"`

---

### משימה 8: נרטיב LLM עם שומר-מספרים

ה-LLM כותב הסברים, לא מספרים (אפיון 6). כל ספרה בנרטיב חייבת להופיע בנתונים; הפרה → ניסיון שני עם אזהרה; הפרה שנייה → נרטיב תבנית דטרמיניסטי.

**Files:**
- Create: `src/pipeline/report/narrative.ts`
- Test: `tests/narrative.test.ts`

- [ ] **Step 1: מבחן נכשל** — ליצור `tests/narrative.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { generateNarrative, extractNumbers } from "../src/pipeline/report/narrative";
import { scoreFindings } from "../src/pipeline/score/engine";
import { DIMENSIONS } from "../src/pipeline/score/dimensions";
import type { ScanFindings } from "../src/pipeline/types";

// fixture RICH — זהה לזה של tests/dimensions.test.ts (מועתק, לא מיובא)
// ... RICH כאן ...

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
    expect((result.narrative as Record<string, unknown>).invented).toBeUndefined();
    expect((result.narrative.gapExplanations[0] as Record<string, unknown>).quote).toBeUndefined();
  });

  it("prompt forbids inventing numbers and quoting reviews", async () => {
    const complete = vi.fn().mockResolvedValue({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateNarrative(RICH, score(), { complete: complete as never });
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("אל תמציא");
    expect(prompt).toContain("אל תצטט");
  });
});

describe("extractNumbers", () => {
  it("finds integers and decimals with dot or comma", () => {
    expect(extractNumbers("ציון 4.9 מתוך 80 ביקורות, 12,7 שניות")).toEqual(["4.9", "80", "12,7"]);
  });
});
```

- [ ] **Step 2: לוודא כישלון** — `npx vitest run tests/narrative.test.ts` → FAIL.

- [ ] **Step 3: מימוש** — ליצור `src/pipeline/report/narrative.ts`:

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

// המספרים המותרים: כל מה שמופיע בנתונים עצמם (בשתי צורות הפירוק — נקודה ופסיק)
function allowedNumbers(f: ScanFindings, score: ScoreReport): Set<string> {
  const source = JSON.stringify(f) + JSON.stringify(score);
  const allowed = new Set<string>();
  for (const n of extractNumbers(source)) {
    allowed.add(n);
    allowed.add(n.replace(".", ","));
    // גם חלקי מספר עשרוני מותרים: "12.7" מתיר גם "12" ו-"7"
    for (const part of n.split(/[.,]/)) allowed.add(part);
  }
  return allowed;
}

function violations(n: ReportNarrative, allowed: Set<string>): string[] {
  const texts = [n.headline, n.summary, ...n.gapExplanations.map((g) => g.explanation)];
  return texts.flatMap(extractNumbers).filter((num) => !allowed.has(num));
}

// בנייה מחדש של האובייקט — שדות שהומצאו על ידי המודל לא שורדים (אותו עיקרון כמו בניתוח הביקורות)
function sanitize(raw: unknown): ReportNarrative {
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
      .filter((g) => g.ruleKey && g.explanation),
  };
}

function buildPrompt(f: ScanFindings, score: ScoreReport, stern: boolean): string {
  const sternLine = stern
    ? "\nאזהרה: בתשובה הקודמת הופיע מספר שלא קיים בנתונים. אסור בתכלית להזכיר אף מספר שלא מופיע בנתונים למטה.\n"
    : "";
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

כתוב הסבר לכל אחד מהפערים המובילים (topGaps) בלבד.

<<<DATA>>>
עסק: ${JSON.stringify({ name: f.business.name, rating: f.business.rating, reviewCount: f.business.reviewCount })}
ציונים: ${JSON.stringify(score.dimensions.map((d) => ({ label: d.label, score: d.score, dataStatus: d.dataStatus })))}
ציון כולל: ${score.overall}
פערים מובילים: ${JSON.stringify(score.topGaps)}
חוזקות: ${JSON.stringify(score.topStrengths)}
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
      : "לא זוהו פערים מהותיים בסריקה הציבורית.",
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
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (const stern of [false, true]) {
    try {
      const result = await complete<unknown>(buildPrompt(f, score, stern));
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
      };
      const narrative = sanitize(result.data);
      if (violations(narrative, allowed).length === 0) {
        return { narrative, usage, usedFallback: false };
      }
    } catch {
      break; // כשל תקשורת/מודל — ישר לתבנית
    }
  }
  return { narrative: fallbackNarrative(f, score), usage, usedFallback: true };
}
```

- [ ] **Step 4: ירוק** — `npx vitest run tests/narrative.test.ts` → PASS. `npm run typecheck` נקי.

- [ ] **Step 5: commit** — `git commit -am "feat: LLM report narrative with number-whitelist guard and deterministic fallback"`

---

### משימה 9: פרויקט Supabase + סכמת Prisma + מיגרציה

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/…` (נוצר על ידי הכלי)
- Modify: `package.json`, `.env`, `.env.example`

- [ ] **Step 1: פעולת משתמש — יצירת פרויקט Supabase (5 דקות, להב עושה):**
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

- [ ] **Step 2: התקנת Prisma**

```bash
npm i -D prisma && npm i @prisma/client
```

- [ ] **Step 3: כתיבת הסכמה** — ליצור `prisma/schema.prisma` (בהתאמה מלאה לאפיון 9.5; תוספות מתועדות: `problem/solution/install_time` בקטלוג — נדרשים לכרטיסי מסך 5; `narrative` ב-scans — הדוח נשמר עם הסריקה):

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

- [ ] **Step 4: ולידציה ומיגרציה**

```bash
npx prisma validate
npx prisma migrate dev --name init
```

Expected: המיגרציה נוצרת ומוחלת, כולל `CREATE EXTENSION IF NOT EXISTS "vector"`. אימות: `npx prisma migrate status` → "Database schema is up to date!".
אם `vector` נכשל: ב-Supabase Dashboard → Database → Extensions → להפעיל `vector`, ואז `npx prisma migrate dev` שוב.

- [ ] **Step 5: סקריפט generate** — ב-`package.json` להוסיף ל-scripts:

```json
    "postinstall": "prisma generate"
```

- [ ] **Step 6: לוודא שהחבילה הקיימת ירוקה** — `npm run typecheck && npm test` → נקי (הסכמה לא נוגעת בקוד).

- [ ] **Step 7: commit** — `git add -A && git commit -m "feat: full Prisma schema per spec 9.5 (all milestone tables, pgvector ready) on Supabase Frankfurt"`
  (לוודא ש-`.env` לא בקומיט — הוא ב-gitignore.)

---

### משימה 10: Seed — קטלוג הזדמנויות ובנצ'מרקים

10 פריטים ראשוניים. `conditions.gapKeys` מפנה למפתחות חוקים מ-`dimensions.ts` — כך ההתאמה באבן דרך 4 תהיה דטרמיניסטית. טווחים מהאפיון (5) ומהיכרות השוק; המייסדים מרחיבים ידנית בהמשך.

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: כתיבת ה-seed** — ליצור `prisma/seed.ts`:

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
    conditions: { gapKeys: ["gbp_exists", "gbp_rating"] },
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
    conditions: { gapKeys: ["contact_form", "lead_handling"] },
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

- [ ] **Step 2: סקריפט** — ב-`package.json`:

```json
    "db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 3: הרצה כפולה (אידמפוטנטיות)**

```bash
npm run db:seed && npm run db:seed
```

Expected: פעמיים `קטלוג: 10 פריטים` — בלי שגיאת כפילות.

- [ ] **Step 4: commit** — `git add -A && git commit -m "feat: seed opportunity catalog (10 items) + benchmarks, idempotent"`

---

### משימה 11: שכבת שמירה — repo דק וממפים טהורים

הלוגיקה (ממפים, ולידציית מעברים) טהורה ונבדקת; קריאות Prisma דקות ונבדקות עם fake פשוט.

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
    update: { data: model.data, fieldSources: model.fieldSources, completenessPct: model.completenessPct },
    create: {
      diagnosisId, data: model.data, fieldSources: model.fieldSources, completenessPct: model.completenessPct,
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

const MODEL: BusinessModel = { data: {} as never, fieldSources: {}, completenessPct: 35 };

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
