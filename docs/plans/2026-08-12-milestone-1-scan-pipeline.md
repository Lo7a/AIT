# תוכנית ביצוע — אבן דרך 1: צנרת הסריקה (Scan Pipeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** סקריפט CLI שמקבל שם עסק ישראלי ומחזיר קובץ JSON של ממצאי סריקה ציבורית (Places + אתר + PageSpeed + תובנות ביקורות) — בלי UI, בלי DB — ואז שער יציאה: הרצה על 5 עסקים אמיתיים (מהם 2 דלי-דאטה).

**Architecture:** פונקציות טהורות עם הזרקת תלויות (fetch ו-LLM ניתנים להחלפה במבחנים). צנרת: resolve (Places search) ← fetch (details | crawl | PageSpeed במקביל) ← analyze (ביקורות ב-LLM) ← findings JSON. הקוד נכתב כספרייה (`src/pipeline/`) שתיובא כמו-שהיא לאפליקציית Next.js באבן דרך 2. אין שמירת טקסט ביקורות גולמי בשום פלט (תנאי Google).

**Tech Stack:** TypeScript + Node 20+, tsx (הרצה), vitest (בדיקות), cheerio (פירסור HTML), dotenv. ‏LLM: ‏Gemini Flash דרך REST (שכבת חינם, ניתן להחלפה בקונפיג). ‏APIs: ‏Google Places (New), ‏PageSpeed Insights.

**מוסכמות לכל המשימות:**
- כל הפקודות רצות מ-`C:\Users\lahav\Desktop\AIT`.
- אחרי כל משימה: קומיט. הודעות קומיט באנגלית, בפורמט `feat|test|chore: ...`.
- מבחנים לא פונים לרשת לעולם — כל fetch מוזרק. הרצות חיות רק במשימה 10.

---

### משימה 0: הקמת הפרויקט

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`

- [ ] **צעד 1: צור `package.json`**

```json
{
  "name": "ait-pipeline",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "scan": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **צעד 2: צור `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **צעד 3: צור `.gitignore`**

```
node_modules/
dist/
.env
output/
```

- [ ] **צעד 4: צור `.env.example`**

```
# מפתח GCP עם Places API (New) + PageSpeed Insights API מופעלים
GOOGLE_API_KEY=
# מפתח מ-Google AI Studio (שכבת חינם)
GEMINI_API_KEY=
# מודל ברירת המחדל לפיתוח
LLM_MODEL=gemini-2.5-flash
```

- [ ] **צעד 5: התקן תלויות**

Run: `npm install`
Expected: נוצר `node_modules/` + `package-lock.json` בלי שגיאות.

- [ ] **צעד 6: ודא שהשלד תקין**

Run: `npx tsc --noEmit && npx vitest run --passWithNoTests`
Expected: שניהם מסתיימים בהצלחה (אין עדיין קבצים — זה בסדר).

- [ ] **צעד 7: קומיט**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: scaffold TypeScript pipeline project (tsx, vitest, cheerio)"
```

---

### משימה 1: טיפוסי הליבה

**Files:**
- Create: `src/pipeline/types.ts`

- [ ] **צעד 1: צור את `src/pipeline/types.ts`**

```typescript
export interface BusinessCandidate {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
}

// הביקורות כאן הן זמניות (in-memory) לצורך ניתוח בלבד — לעולם לא נשמרות לפלט
export interface Review {
  rating: number;
  text: string;
  relativeTime?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  reviews: Review[];
}

export interface WebsiteSignals {
  pagesCrawled: number;
  crawledUrls: string[];
  hasContactForm: boolean;
  hasWhatsappLink: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasOnlineBooking: boolean;
  hasChatWidget: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  platform?: string;
}

export interface PageSpeedResult {
  performanceScore?: number; // 0-100
  seoScore?: number;         // 0-100
  lcpMs?: number;
}

export interface Theme {
  theme: string; // מסקנה קצרה בעברית — בלי ציטוטים ובלי שמות
  count: number;
}

export interface ReviewInsights {
  totalAnalyzed: number;
  positiveThemes: Theme[];
  problemThemes: Theme[];
}

export interface ScanMeta {
  startedAt: string;
  durationMs: number;
  placesCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  estCostUsd: number;
}

export interface ScanFindings {
  business: {
    placeId: string;
    name: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
  };
  websiteSignals?: WebsiteSignals;
  pageSpeed?: PageSpeedResult;
  reviewInsights?: ReviewInsights;
  partial: string[]; // "no_website" | "few_reviews" | "crawl_failed" | "pagespeed_failed" | "review_analysis_failed"
  meta: ScanMeta;
}
```

- [ ] **צעד 2: בדיקת קומפילציה**

Run: `npx tsc --noEmit`
Expected: בלי שגיאות.

- [ ] **צעד 3: קומיט**

```bash
git add src/pipeline/types.ts
git commit -m "feat: core pipeline types (findings, signals, insights, meta)"
```

---

### משימה 2: לקוח LLM ‏(Gemini REST, ניתן להחלפה)

**Files:**
- Create: `src/pipeline/llm/client.ts`
- Test: `tests/llm-client.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/llm-client.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { completeJSON } from "../src/pipeline/llm/client";

function geminiResponse(jsonText: string, inTok = 100, outTok = 20) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: jsonText }] } }],
      usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok },
    }),
    text: async () => "",
  } as unknown as Response;
}

describe("completeJSON", () => {
  it("parses the model's JSON answer and reports token usage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse('{"hello":"world"}'));
    const result = await completeJSON<{ hello: string }>("say hello as json", {
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });
    expect(result.data.hello).toBe("world");
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(20);
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain("test-model:generateContent");
  });

  it("throws a clear error on an HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => "quota", json: async () => ({}),
    } as unknown as Response);
    await expect(
      completeJSON("x", { apiKey: "k", fetchImpl }),
    ).rejects.toThrow(/429/);
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/llm-client.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/llm/client.ts`**

```typescript
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmJsonResult<T> {
  data: T;
  usage: LlmUsage;
}

export type FetchLike = typeof fetch;

export interface LlmOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// נקודת ההחלפה היחידה של ספק ה-LLM. כל הצנרת קוראת רק לפונקציה הזו.
export async function completeJSON<T>(
  prompt: string,
  opts: LlmOptions = {},
): Promise<LlmJsonResult<T>> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.LLM_MODEL ?? "gemini-2.5-flash";
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetchImpl(`${BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("LLM returned an empty response");
  return {
    data: JSON.parse(text) as T,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/llm-client.test.ts`
Expected: PASS ‏(2 מבחנים).

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/llm/client.ts tests/llm-client.test.ts
git commit -m "feat: swappable LLM client (Gemini REST, JSON mode, usage tracking)"
```

---

### משימה 3: Google Places — חיפוש ופרטים

**Files:**
- Create: `src/pipeline/google/places.ts`
- Test: `tests/places.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/places.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { searchBusiness, getPlaceDetails } from "../src/pipeline/google/places";

function jsonResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

describe("searchBusiness", () => {
  it("maps Places searchText results to candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      places: [{
        id: "pid-1",
        displayName: { text: "מוסך הצפון" },
        formattedAddress: "העצמאות 1, חיפה",
        rating: 4.6,
        userRatingCount: 23,
      }],
    }));
    const results = await searchBusiness("מוסך הצפון חיפה", { apiKey: "k", fetchImpl });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      placeId: "pid-1",
      name: "מוסך הצפון",
      address: "העצמאות 1, חיפה",
      rating: 4.6,
      reviewCount: 23,
    });
  });

  it("returns an empty array when nothing is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const results = await searchBusiness("עסק שלא קיים", { apiKey: "k", fetchImpl });
    expect(results).toEqual([]);
  });
});

describe("getPlaceDetails", () => {
  it("maps details incl. reviews and never loses review text for analysis", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      id: "pid-1",
      displayName: { text: "מוסך הצפון" },
      nationalPhoneNumber: "04-1234567",
      websiteUri: "https://example.co.il",
      rating: 4.6,
      userRatingCount: 23,
      reviews: [
        { rating: 5, text: { text: "שירות מעולה" }, relativePublishTimeDescription: "לפני חודש" },
        { rating: 2, originalText: { text: "חיכיתי שבוע לתשובה" } },
      ],
    }));
    const details = await getPlaceDetails("pid-1", { apiKey: "k", fetchImpl });
    expect(details.name).toBe("מוסך הצפון");
    expect(details.website).toBe("https://example.co.il");
    expect(details.reviews).toHaveLength(2);
    expect(details.reviews[0].text).toBe("שירות מעולה");
    expect(details.reviews[1].text).toBe("חיכיתי שבוע לתשובה");
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/places.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/google/places.ts`**

```typescript
import type { BusinessCandidate, PlaceDetails, Review } from "../types";
import type { FetchLike } from "../llm/client";

export interface PlacesOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

function resolveOpts(opts: PlacesOptions) {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
  return { apiKey, fetchImpl: opts.fetchImpl ?? fetch };
}

export async function searchBusiness(
  query: string,
  opts: PlacesOptions = {},
): Promise<BusinessCandidate[]> {
  const { apiKey, fetchImpl } = resolveOpts(opts);
  const res = await fetchImpl(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "he", regionCode: "IL" }),
  });
  if (!res.ok) throw new Error(`Places search HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
    }[];
  };
  return (body.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    rating: p.rating,
    reviewCount: p.userRatingCount,
  }));
}

export async function getPlaceDetails(
  placeId: string,
  opts: PlacesOptions = {},
): Promise<PlaceDetails> {
  const { apiKey, fetchImpl } = resolveOpts(opts);
  const fieldMask =
    "id,displayName,nationalPhoneNumber,websiteUri,rating,userRatingCount,reviews";
  const res = await fetchImpl(
    `${DETAILS_URL}/${placeId}?languageCode=he`,
    {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
    },
  );
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    id: string;
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: {
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      relativePublishTimeDescription?: string;
    }[];
  };
  const reviews: Review[] = (body.reviews ?? [])
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.text?.text ?? r.originalText?.text ?? "",
      relativeTime: r.relativePublishTimeDescription,
    }))
    .filter((r) => r.text.length > 0);
  return {
    placeId: body.id,
    name: body.displayName?.text ?? "",
    phone: body.nationalPhoneNumber,
    website: body.websiteUri,
    rating: body.rating,
    reviewCount: body.userRatingCount,
    reviews,
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/places.test.ts`
Expected: PASS ‏(3 מבחנים).

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/google/places.ts tests/places.test.ts
git commit -m "feat: Places API (New) search + details with Hebrew reviews"
```

---

### משימה 4: חילוץ סיגנלים מ-HTML ‏(פונקציה טהורה)

**Files:**
- Create: `src/pipeline/crawler/signals.ts`
- Test: `tests/signals.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/signals.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { extractSignals } from "../src/pipeline/crawler/signals";

const RICH_HTML = `
<html><head>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script>gtag('config','G-XYZ');</script>
</head><body>
  <a href="https://wa.me/972539860164">ווטסאפ</a>
  <a href="tel:04-1234567">התקשרו</a>
  <a href="mailto:info@example.co.il">מייל</a>
  <a href="/contact">צור קשר</a>
  <a href="/about">אודות</a>
  <a href="https://other-site.com/page">חיצוני</a>
  <form action="/submit"><input name="name"/></form>
  <link href="/wp-content/themes/x/style.css" rel="stylesheet"/>
</body></html>`;

describe("extractSignals", () => {
  it("detects contact channels, pixels, platform and internal links", () => {
    const s = extractSignals(RICH_HTML, "https://example.co.il");
    expect(s.hasWhatsappLink).toBe(true);
    expect(s.hasPhoneLink).toBe(true);
    expect(s.hasEmailLink).toBe(true);
    expect(s.hasContactForm).toBe(true);
    expect(s.hasFacebookPixel).toBe(true);
    expect(s.hasGoogleAnalytics).toBe(true);
    expect(s.platform).toBe("wordpress");
    expect(s.internalLinks).toContain("https://example.co.il/contact");
    expect(s.internalLinks).toContain("https://example.co.il/about");
    expect(s.internalLinks.some((u) => u.includes("other-site.com"))).toBe(false);
  });

  it("returns all-false for an empty page", () => {
    const s = extractSignals("<html><body>שלום</body></html>", "https://example.co.il");
    expect(s.hasWhatsappLink).toBe(false);
    expect(s.hasContactForm).toBe(false);
    expect(s.platform).toBeUndefined();
    expect(s.internalLinks).toEqual([]);
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/signals.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/crawler/signals.ts`**

```typescript
import * as cheerio from "cheerio";

export interface PageSignals {
  hasContactForm: boolean;
  hasWhatsappLink: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasOnlineBooking: boolean;
  hasChatWidget: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  platform?: string;
  internalLinks: string[];
}

export function extractSignals(html: string, baseUrl: string): PageSignals {
  const $ = cheerio.load(html);
  const raw = html.toLowerCase();
  const origin = new URL(baseUrl).origin;

  const internalLinks: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = "";
      if (abs.origin === origin && abs.toString() !== baseUrl) {
        internalLinks.push(abs.toString());
      }
    } catch {
      // href לא תקין — מתעלמים
    }
  });

  let platform: string | undefined;
  if (raw.includes("wp-content") || raw.includes("wp-includes")) platform = "wordpress";
  else if (raw.includes("wixstatic.com") || raw.includes("wix.com")) platform = "wix";
  else if (raw.includes("cdn.shopify.com")) platform = "shopify";

  return {
    hasContactForm: $("form").length > 0,
    hasWhatsappLink: /wa\.me\/|api\.whatsapp\.com/.test(raw),
    hasPhoneLink: $('a[href^="tel:"]').length > 0,
    hasEmailLink: $('a[href^="mailto:"]').length > 0,
    hasOnlineBooking: /calendly|vcita|setmore|simplybook/.test(raw),
    hasChatWidget: /tawk\.to|tidio|intercom|crisp\.chat/.test(raw),
    hasFacebookPixel: /fbq\(|connect\.facebook\.net/.test(raw),
    hasGoogleAnalytics: /gtag\(|googletagmanager|google-analytics/.test(raw),
    platform,
    internalLinks: [...new Set(internalLinks)],
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/signals.test.ts`
Expected: PASS ‏(2 מבחנים).

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/crawler/signals.ts tests/signals.test.ts
git commit -m "feat: pure HTML signal extraction (contact channels, pixels, platform)"
```

---

### משימה 5: ה-Crawler ‏(עד 8 עמודים, עדיפות לעמודי מפתח)

**Files:**
- Create: `src/pipeline/crawler/crawl.ts`
- Test: `tests/crawl.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/crawl.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { crawlWebsite } from "../src/pipeline/crawler/crawl";

const HOME = `<html><body>
  <a href="/contact">צור קשר</a>
  <a href="/gallery">גלריה</a>
  <form></form>
</body></html>`;
const CONTACT = `<html><body><a href="https://wa.me/972501234567">וואטסאפ</a></body></html>`;
const GALLERY = `<html><body>תמונות</body></html>`;

function htmlResponse(html: string) {
  return { ok: true, status: 200, text: async () => html } as unknown as Response;
}

describe("crawlWebsite", () => {
  it("crawls home + prioritized pages and merges signals with OR", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.pagesCrawled).toBe(3);
    expect(signals.hasContactForm).toBe(true);   // מהבית
    expect(signals.hasWhatsappLink).toBe(true);  // מעמוד צור קשר
    // עמוד "צור קשר" מקבל עדיפות על "גלריה" ברשימת ההמתנה
    expect(signals.crawledUrls[1]).toContain("/contact");
  });

  it("throws when the homepage is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(
      crawlWebsite("https://down.example", { fetchImpl }),
    ).rejects.toThrow();
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/crawl.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/crawler/crawl.ts`**

```typescript
import type { WebsiteSignals } from "../types";
import type { FetchLike } from "../llm/client";
import { extractSignals, type PageSignals } from "./signals";

export interface CrawlOptions {
  fetchImpl?: FetchLike;
  maxPages?: number;
  timeoutMs?: number;
}

// מילות מפתח שמקדמות עמוד בתור — העמודים שהכי מלמדים על העסק
const PRIORITY_KEYWORDS = [
  "contact", "about", "service", "price", "book",
  "קשר", "אודות", "שירות", "מחיר", "תור",
];

const BOOL_KEYS = [
  "hasContactForm", "hasWhatsappLink", "hasPhoneLink", "hasEmailLink",
  "hasOnlineBooking", "hasChatWidget", "hasFacebookPixel", "hasGoogleAnalytics",
] as const;

function priorityOf(url: string): number {
  const lower = decodeURIComponent(url).toLowerCase();
  return PRIORITY_KEYWORDS.some((k) => lower.includes(k)) ? 0 : 1;
}

async function fetchPage(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "AIT-Scanner/0.1 (+business diagnosis)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function crawlWebsite(
  siteUrl: string,
  opts: CrawlOptions = {},
): Promise<WebsiteSignals> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 8;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  // עמוד הבית חייב להצליח — בלעדיו אין סריקת אתר
  const homeHtml = await fetchPage(siteUrl, fetchImpl, timeoutMs);
  const home = extractSignals(homeHtml, siteUrl);

  const merged: PageSignals = { ...home };
  const crawledUrls = [siteUrl];
  const queue = [...home.internalLinks].sort((a, b) => priorityOf(a) - priorityOf(b));
  const visited = new Set([siteUrl]);

  for (const url of queue) {
    if (crawledUrls.length >= maxPages) break;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchPage(url, fetchImpl, timeoutMs);
      const page = extractSignals(html, siteUrl);
      for (const key of BOOL_KEYS) merged[key] = merged[key] || page[key];
      merged.platform = merged.platform ?? page.platform;
      crawledUrls.push(url);
    } catch {
      // עמוד פנימי שנפל לא מפיל את הסריקה
    }
  }

  return {
    pagesCrawled: crawledUrls.length,
    crawledUrls,
    hasContactForm: merged.hasContactForm,
    hasWhatsappLink: merged.hasWhatsappLink,
    hasPhoneLink: merged.hasPhoneLink,
    hasEmailLink: merged.hasEmailLink,
    hasOnlineBooking: merged.hasOnlineBooking,
    hasChatWidget: merged.hasChatWidget,
    hasFacebookPixel: merged.hasFacebookPixel,
    hasGoogleAnalytics: merged.hasGoogleAnalytics,
    platform: merged.platform,
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/crawl.test.ts`
Expected: PASS ‏(2 מבחנים).

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/crawler/crawl.ts tests/crawl.test.ts
git commit -m "feat: website crawler with priority queue and graceful page failures"
```

---

### משימה 6: PageSpeed Insights

**Files:**
- Create: `src/pipeline/google/pagespeed.ts`
- Test: `tests/pagespeed.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/pagespeed.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runPageSpeed } from "../src/pipeline/google/pagespeed";

describe("runPageSpeed", () => {
  it("extracts performance, seo and LCP from the API response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        lighthouseResult: {
          categories: {
            performance: { score: 0.42 },
            seo: { score: 0.9 },
          },
          audits: { "largest-contentful-paint": { numericValue: 4123.5 } },
        },
      }),
      text: async () => "",
    } as unknown as Response);
    const result = await runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
    expect(result.performanceScore).toBe(42);
    expect(result.seoScore).toBe(90);
    expect(result.lcpMs).toBe(4124);
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/pagespeed.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/google/pagespeed.ts`**

```typescript
import type { PageSpeedResult } from "../types";
import type { FetchLike } from "../llm/client";

export interface PageSpeedOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
}

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function runPageSpeed(
  url: string,
  opts: PageSpeedOptions = {},
): Promise<PageSpeedResult> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({ url, strategy: "mobile" });
  params.append("category", "PERFORMANCE");
  params.append("category", "SEO");
  if (apiKey) params.set("key", apiKey);

  const res = await fetchImpl(`${PSI_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(60_000), // PSI איטי — עד דקה
  });
  if (!res.ok) throw new Error(`PageSpeed HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number }; seo?: { score?: number } };
      audits?: { "largest-contentful-paint"?: { numericValue?: number } };
    };
  };
  const cats = body.lighthouseResult?.categories;
  const lcp = body.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
  return {
    performanceScore: cats?.performance?.score != null ? Math.round(cats.performance.score * 100) : undefined,
    seoScore: cats?.seo?.score != null ? Math.round(cats.seo.score * 100) : undefined,
    lcpMs: lcp != null ? Math.round(lcp) : undefined,
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/pagespeed.test.ts`
Expected: PASS.

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/google/pagespeed.ts tests/pagespeed.test.ts
git commit -m "feat: PageSpeed Insights adapter (performance, SEO, LCP)"
```

---

### משימה 7: ניתוח ביקורות ב-LLM ‏(מסקנות בלבד — בלי ציטוטים)

**Files:**
- Create: `src/pipeline/analyze/reviews.ts`
- Test: `tests/reviews.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/reviews.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { analyzeReviews } from "../src/pipeline/analyze/reviews";
import type { Review } from "../src/pipeline/types";

const REVIEWS: Review[] = [
  { rating: 5, text: "שירות מעולה ומהיר, ממליץ בחום" },
  { rating: 2, text: "חיכיתי שבוע שיחזרו אליי בטלפון" },
  { rating: 1, text: "אף אחד לא עונה לוואטסאפ" },
];

describe("analyzeReviews", () => {
  it("returns empty insights without calling the LLM when there are no reviews", async () => {
    const complete = vi.fn();
    const { insights, usage } = await analyzeReviews([], { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(insights.totalAnalyzed).toBe(0);
    expect(usage.inputTokens).toBe(0);
  });

  it("maps LLM themes into insights and reports usage", async () => {
    const complete = vi.fn().mockResolvedValue({
      data: {
        positiveThemes: [{ theme: "שירות מהיר ואדיב", count: 1 }],
        problemThemes: [{ theme: "זמני תגובה איטיים בטלפון ובוואטסאפ", count: 2 }],
      },
      usage: { inputTokens: 500, outputTokens: 60 },
    });
    const { insights, usage } = await analyzeReviews(REVIEWS, { complete });
    expect(insights.totalAnalyzed).toBe(3);
    expect(insights.problemThemes[0].count).toBe(2);
    expect(usage.inputTokens).toBe(500);
    // הפרומפט חייב לכלול את טקסט הביקורות (עיבוד זמני מותר)
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("חיכיתי שבוע");
    // ...אבל הוא חייב להנחות במפורש לא לצטט
    expect(prompt).toContain("אל תצטט");
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/reviews.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/analyze/reviews.ts`**

```typescript
import type { Review, ReviewInsights, Theme } from "../types";
import { completeJSON, type LlmUsage } from "../llm/client";

interface RawThemes {
  positiveThemes?: Theme[];
  problemThemes?: Theme[];
}

export interface AnalyzeDeps {
  complete?: <T>(prompt: string) => Promise<{ data: T; usage: LlmUsage }>;
}

const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

// אילוץ משפטי (תנאי Google + תיקון 13): מהשלב הזה יוצאות מסקנות בלבד.
// טקסט הביקורות נכנס לפרומפט כעיבוד זמני ולעולם לא נשמר לפלט.
export async function analyzeReviews(
  reviews: Review[],
  deps: AnalyzeDeps = {},
): Promise<{ insights: ReviewInsights; usage: LlmUsage }> {
  const complete = deps.complete ?? (<T>(p: string) => completeJSON<T>(p));
  const withText = reviews.filter((r) => r.text.trim().length > 0);
  if (withText.length === 0) {
    return {
      insights: { totalAnalyzed: 0, positiveThemes: [], problemThemes: [] },
      usage: ZERO_USAGE,
    };
  }

  const reviewLines = withText
    .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.text}`)
    .join("\n");

  const prompt = `אתה מנתח ביקורות של עסק ישראלי. לפניך ${withText.length} ביקורות מ-Google.
זהה תמות חוזרות — גם חיוביות וגם בעיות — ונסח כל תמה כמסקנה כללית קצרה בעברית.
חוקים מחייבים:
- אל תצטט משפטים מהביקורות ואל תכלול שמות של אנשים. מסקנות כלליות בלבד.
- count = בכמה ביקורות התמה מופיעה.
- החזר JSON בלבד בפורמט: {"positiveThemes":[{"theme":"...","count":1}],"problemThemes":[{"theme":"...","count":1}]}

הביקורות:
${reviewLines}`;

  const { data, usage } = await complete<RawThemes>(prompt);
  return {
    insights: {
      totalAnalyzed: withText.length,
      positiveThemes: data.positiveThemes ?? [],
      problemThemes: data.problemThemes ?? [],
    },
    usage,
  };
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/reviews.test.ts`
Expected: PASS ‏(2 מבחנים).

- [ ] **צעד 5: קומיט**

```bash
git add src/pipeline/analyze/reviews.ts tests/reviews.test.ts
git commit -m "feat: LLM review analysis - conclusions only, no raw quotes (ToS)"
```

---

### משימה 8: המנצח (Orchestrator) — `runScan`

**Files:**
- Create: `src/pipeline/scan.ts`
- Test: `tests/scan.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/scan.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runScan, type ScanDeps } from "../src/pipeline/scan";
import type { PlaceDetails } from "../src/pipeline/types";

const RICH_DETAILS: PlaceDetails = {
  placeId: "pid-1", name: "מוסך הצפון", phone: "04-1234567",
  website: "https://example.co.il", rating: 4.6, reviewCount: 23,
  reviews: [
    { rating: 5, text: "שירות מעולה" },
    { rating: 2, text: "חיכיתי שבוע לתשובה" },
    { rating: 4, text: "מקצועיים" },
    { rating: 3, text: "בסדר גמור" },
    { rating: 5, text: "אמינים" },
  ],
};

function richDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    details: vi.fn().mockResolvedValue(RICH_DETAILS),
    crawl: vi.fn().mockResolvedValue({
      pagesCrawled: 3, crawledUrls: ["https://example.co.il"],
      hasContactForm: true, hasWhatsappLink: false, hasPhoneLink: true,
      hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
      hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
    }),
    pagespeed: vi.fn().mockResolvedValue({ performanceScore: 42, seoScore: 90, lcpMs: 4100 }),
    analyzeReviews: vi.fn().mockResolvedValue({
      insights: {
        totalAnalyzed: 5,
        positiveThemes: [{ theme: "שירות אדיב", count: 3 }],
        problemThemes: [{ theme: "זמני תגובה איטיים", count: 1 }],
      },
      usage: { inputTokens: 500, outputTokens: 60 },
    }),
    ...overrides,
  };
}

describe("runScan", () => {
  it("produces full findings for a rich-footprint business", async () => {
    const findings = await runScan("pid-1", richDeps());
    expect(findings.business.name).toBe("מוסך הצפון");
    expect(findings.websiteSignals?.platform).toBe("wordpress");
    expect(findings.pageSpeed?.performanceScore).toBe(42);
    expect(findings.reviewInsights?.totalAnalyzed).toBe(5);
    expect(findings.partial).toEqual([]);
    expect(findings.meta.placesCalls).toBe(1);
    expect(findings.meta.llmInputTokens).toBe(500);
  });

  it("never leaks raw review text into the findings JSON (Google ToS)", async () => {
    const findings = await runScan("pid-1", richDeps());
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("חיכיתי שבוע לתשובה");
    expect(serialized).not.toContain("שירות מעולה");
  });

  it("degrades gracefully for a thin-footprint business (no website, few reviews)", async () => {
    const thin: PlaceDetails = {
      placeId: "pid-2", name: "אינסטלטור דוד", phone: "050-1111111",
      website: undefined, rating: 5, reviewCount: 2,
      reviews: [{ rating: 5, text: "מקצוען" }],
    };
    const deps = richDeps({ details: vi.fn().mockResolvedValue(thin) });
    const findings = await runScan("pid-2", deps);
    expect(deps.crawl).not.toHaveBeenCalled();
    expect(deps.pagespeed).not.toHaveBeenCalled();
    expect(findings.websiteSignals).toBeUndefined();
    expect(findings.partial).toContain("no_website");
    expect(findings.partial).toContain("few_reviews");
    expect(findings.reviewInsights).toBeDefined(); // מנתחים גם ביקורת אחת
  });

  it("records a partial flag instead of failing when the crawl throws", async () => {
    const deps = richDeps({ crawl: vi.fn().mockRejectedValue(new Error("boom")) });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.reviewInsights).toBeDefined();
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/scan.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/scan.ts`**

```typescript
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
const EST_PLACES_DETAILS_USD = 0.03; // הערכה גסה לקריאת details עם ביקורות

export async function runScan(
  placeId: string,
  deps: ScanDeps = defaultDeps,
): Promise<ScanFindings> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const partial: string[] = [];
  let llmUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  const details = await deps.details(placeId);
  const placesCalls = 1;

  let websiteSignals: WebsiteSignals | undefined;
  let pageSpeed: PageSpeedResult | undefined;
  if (details.website) {
    const [crawlResult, psiResult] = await Promise.allSettled([
      deps.crawl(details.website),
      deps.pagespeed(details.website),
    ]);
    if (crawlResult.status === "fulfilled") websiteSignals = crawlResult.value;
    else partial.push("crawl_failed");
    if (psiResult.status === "fulfilled") pageSpeed = psiResult.value;
    else partial.push("pagespeed_failed");
  } else {
    partial.push("no_website");
  }

  if (details.reviews.length < FEW_REVIEWS_THRESHOLD) partial.push("few_reviews");

  let reviewInsights: ReviewInsights | undefined;
  try {
    const { insights, usage } = await deps.analyzeReviews(details.reviews);
    reviewInsights = insights;
    llmUsage = usage;
  } catch {
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
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/scan.test.ts`
Expected: PASS ‏(4 מבחנים).

- [ ] **צעד 5: הרץ את כל חבילת המבחנים**

Run: `npx vitest run && npx tsc --noEmit`
Expected: כל המבחנים עוברים, אפס שגיאות טיפוסים.

- [ ] **צעד 6: קומיט**

```bash
git add src/pipeline/scan.ts tests/scan.test.ts
git commit -m "feat: scan orchestrator with graceful degradation and cost metering"
```

---

### משימה 9: ה-CLI

**Files:**
- Create: `src/cli.ts`, `src/pipeline/slug.ts`
- Test: `tests/slug.test.ts`

- [ ] **צעד 1: כתוב מבחן נכשל — `tests/slug.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { slugify } from "../src/pipeline/slug";

describe("slugify", () => {
  it("keeps Hebrew, replaces spaces, strips characters illegal in filenames", () => {
    expect(slugify("מוסך הצפון בע\"מ")).toBe("מוסך-הצפון-בעמ");
    expect(slugify("  Pizza / Roma  ")).toBe("pizza-roma");
  });
});
```

- [ ] **צעד 2: הרץ וודא כישלון**

Run: `npx vitest run tests/slug.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **צעד 3: מימוש — `src/pipeline/slug.ts`**

```typescript
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[\\/:*?<>|]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **צעד 4: הרץ וודא הצלחה**

Run: `npx vitest run tests/slug.test.ts`
Expected: PASS.

- [ ] **צעד 5: מימוש — `src/cli.ts`**

```typescript
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { searchBusiness } from "./pipeline/google/places";
import { runScan } from "./pipeline/scan";
import { slugify } from "./pipeline/slug";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let pick: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pick") pick = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  return { query: positional.join(" ").trim(), pick };
}

async function main() {
  const { query, pick } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.log('שימוש: npm run scan -- "שם העסק והעיר" [--pick N]');
    process.exit(1);
  }

  console.log(`🔎 מחפש: "${query}"...`);
  const candidates = await searchBusiness(query);
  if (candidates.length === 0) {
    console.log("לא נמצא עסק מתאים. נסה לנסח אחרת או להוסיף עיר.");
    process.exit(1);
  }
  if (candidates.length > 1 && pick === undefined) {
    console.log("נמצאו כמה מועמדים — הרץ שוב עם ‎--pick <מספר>:");
    candidates.slice(0, 5).forEach((c, i) => {
      const stats = c.rating != null ? ` (⭐ ${c.rating}, ${c.reviewCount ?? 0} ביקורות)` : "";
      console.log(`  ${i + 1}. ${c.name} — ${c.address}${stats}`);
    });
    process.exit(0);
  }

  const chosen = candidates[(pick ?? 1) - 1];
  if (!chosen) {
    console.log(`--pick ${pick} מחוץ לטווח (נמצאו ${candidates.length}).`);
    process.exit(1);
  }

  console.log(`🏢 סורק את: ${chosen.name} — ${chosen.address}`);
  const findings = await runScan(chosen.placeId);

  mkdirSync("output", { recursive: true });
  const file = join("output", `${slugify(chosen.name)}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(findings, null, 2), "utf8");

  console.log("\n✅ הסריקה הושלמה");
  console.log(`   קובץ: ${file}`);
  console.log(`   משך: ${(findings.meta.durationMs / 1000).toFixed(1)} שניות`);
  console.log(`   חלקים חסרים: ${findings.partial.length ? findings.partial.join(", ") : "אין — סריקה מלאה"}`);
  if (findings.reviewInsights) {
    console.log(`   תובנות מ-${findings.reviewInsights.totalAnalyzed} ביקורות: ` +
      `${findings.reviewInsights.problemThemes.length} בעיות, ` +
      `${findings.reviewInsights.positiveThemes.length} חוזקות`);
  }
  console.log(`   טוקנים: ${findings.meta.llmInputTokens} in / ${findings.meta.llmOutputTokens} out` +
    ` · עלות APIs משוערת: $${findings.meta.estCostUsd.toFixed(3)}`);
}

main().catch((err) => {
  console.error("❌ שגיאה:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **צעד 6: בדיקת קומפילציה מלאה**

Run: `npx tsc --noEmit && npx vitest run`
Expected: הכול ירוק.

- [ ] **צעד 7: קומיט**

```bash
git add src/cli.ts src/pipeline/slug.ts tests/slug.test.ts
git commit -m "feat: scan CLI - search, pick candidate, write findings JSON"
```

---

### משימה 10: שער היציאה — 5 עסקים אמיתיים

**Files:**
- Create: `.env` (לא נכנס ל-git), `docs/milestone-1-gate.md`

- [ ] **צעד 1: השג מפתחות (פעם אחת)**

1. **GCP:** console.cloud.google.com ← צור פרויקט ← הפעל את שני ה-APIs: ‏"Places API (New)" ו-"PageSpeed Insights API" ← צור API Key ← העתק ל-`GOOGLE_API_KEY` ב-`.env`. ‏(Places דורש חשבון חיוב מופעל; יש מכסת חינם חודשית.)
2. **Gemini:** aistudio.google.com ← ‏Get API key ← העתק ל-`GEMINI_API_KEY` ב-`.env`.
3. צור `.env` לפי `.env.example` וודא שהוא לא נכנס ל-git: ‏`git status` לא אמור להציג אותו.

- [ ] **צעד 2: הרצת עשן ראשונה על עסק מוכר**

Run: `npm run scan -- "שם עסק שאתם מכירים + עיר"`
Expected: קובץ JSON ב-`output/`, משך < 90 שניות. פתחו את הקובץ ובדקו ידנית: העסק הנכון? הסיגנלים מהאתר נכונים? התובנות מהביקורות נכונות (השוו מול הביקורות בגוגל)? אין טקסט ביקורת גולמי בקובץ?

- [ ] **צעד 3: צור את `docs/milestone-1-gate.md` ומלא תוך כדי**

```markdown
# שער יציאה — אבן דרך 1

הקריטריון (מהאפיון): לפחות 3 ממצאים מעניינים לעסק עשיר-דאטה, לפחות 1–2 לעסק דל-דאטה.
"ממצא מעניין" = משהו שהיינו אומרים לבעל העסק והוא היה מרים גבה.

| # | עסק | טביעת רגל | איתור נכון? | משך (שנ') | ממצאים מעניינים | תקין? |
|---|------|-----------|-------------|-----------|------------------|-------|
| 1 |      | עשירה     |             |           |                  |       |
| 2 |      | עשירה     |             |           |                  |       |
| 3 |      | עשירה     |             |           |                  |       |
| 4 |      | דלה       |             |           |                  |       |
| 5 |      | דלה       |             |           |                  |       |

## בדיקת ToS
- [ ] אף קובץ פלט לא מכיל טקסט ביקורת גולמי או שם כותב ביקורת

## החלטת השער
- [ ] עובר — ממשיכים לאבן דרך 2 (מנוע ציונים + דוח)
- [ ] לא עובר — מה חסר ומה מתקנים: ________________
```

- [ ] **צעד 4: הרץ על 5 העסקים** (3 עשירים, 2 דלים — עסקים שאתם מכירים אישית) ומלא את הטבלה.

- [ ] **צעד 5: קומיט של תוצאות השער**

```bash
git add docs/milestone-1-gate.md
git commit -m "docs: milestone 1 gate results (5 real businesses)"
```

הערה: קובצי `output/*.json` לא נכנסים ל-git (יש בהם מידע על עסקים אמיתיים) — הם ב-.gitignore.

---

## סיום אבן דרך 1

בסיום: כל המבחנים ירוקים, ‏CLI עובד על עסקים אמיתיים, טבלת השער מלאה והוחלט עובר/לא-עובר. אם עובר — אבן דרך 2 (סכמת DB + מנוע ציונים + מסכים 1–3) מקבלת תוכנית משלה.
