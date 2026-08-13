import { describe, it, expect, vi } from "vitest";
import { generateNarrative, extractNumbers, fallbackNarrative, type CompleteFn } from "../src/pipeline/report/narrative";
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

function llmReply(obj: unknown): CompleteFn {
  return async () => ({ data: obj, usage: { inputTokens: 10, outputTokens: 5 } });
}

const GOOD = {
  headline: "העסק חזק במוניטין אבל האתר האיטי עוצר אותו",
  summary: "דירוג 4.9 עם 80 ביקורות — נכס אמיתי. האתר קיים אבל איטי.",
  gapExplanations: [{ ruleKey: "online_booking", explanation: "עסק מבוסס תורים בלי קביעת תור אונליין מפסיד לקוחות" }],
};

describe("generateNarrative", () => {
  it("returns the model's narrative when all numbers exist in the data", async () => {
    const result = await generateNarrative(RICH, score(), { complete: llmReply(GOOD) });
    expect(result.narrative.headline).toBe(GOOD.headline);
    expect(result.usedFallback).toBe(false);
  });

  it("retries once when the model invents a number, with a stern warning", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ data: { ...GOOD, summary: "העסק מפסיד 37% מהלקוחות" }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete });
    expect(complete).toHaveBeenCalledTimes(2);
    expect((complete.mock.calls[1][0] as string)).toContain("אסור");
    expect(result.usedFallback).toBe(false);
    expect(result.narrative.summary).toBe(GOOD.summary);
  });

  it("rejects rule points as an alibi for invented numbers (narrow whitelist)", async () => {
    // 40 הוא points של חוק — אסור שהוא יכשיר "40% מהלקוחות"; 25/30/35 הם points/weights
    const bad = { ...GOOD, summary: "העסק מפסיד 40% מהלקוחות ועוד 35 אחוז" };
    const complete = vi.fn().mockResolvedValue({ data: bad, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete });
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to a deterministic template after two violations", async () => {
    const bad = { ...GOOD, summary: "חיסכון של 5000 שקל בחודש" };
    const complete = vi.fn().mockResolvedValue({ data: bad, usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await generateNarrative(RICH, score(), { complete });
    expect(result.usedFallback).toBe(true);
    expect(result.narrative.headline).toContain("אופטיקה"); // התבנית משתמשת בשם העסק
  });

  it("falls back when the LLM call itself throws", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("429"));
    const result = await generateNarrative(RICH, score(), { complete });
    expect(result.usedFallback).toBe(true);
  });

  it("sanitizer drops fields the model invented", async () => {
    const withExtra = { ...GOOD, invented: "x", gapExplanations: [{ ...GOOD.gapExplanations[0], quote: "ציטוט אסור" }] };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withExtra) });
    expect((result.narrative as unknown as Record<string, unknown>).invented).toBeUndefined();
    expect((result.narrative.gapExplanations[0] as unknown as Record<string, unknown>).quote).toBeUndefined();
  });

  it("prompt forbids inventing numbers/quotes and includes dimension keys for joining", async () => {
    const complete = vi.fn().mockResolvedValue({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateNarrative(RICH, score(), { complete });
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
    const result = await generateNarrative(struggling, s, { complete: llmReply(echo) });
    expect(result.usedFallback).toBe(false);
  });

  it("accepts the canonical 'X מתוך 100' phrasing", async () => {
    const s = score();
    const canonical = { ...GOOD, summary: `ציון ${s.overall} מתוך 100 — יש בסיס טוב` };
    const result = await generateNarrative(RICH, s, { complete: llmReply(canonical) });
    expect(result.usedFallback).toBe(false);
  });

  it("treats empty/garbage LLM output as failure, not blank success", async () => {
    for (const garbage of [{}, null, "not an object", { foo: "bar" }]) {
      const result = await generateNarrative(RICH, score(), { complete: llmReply(garbage) });
      expect(result.usedFallback, JSON.stringify(garbage)).toBe(true);
    }
  });

  it("does not whitelist scan telemetry numbers", async () => {
    const withMeta: ScanFindings = {
      ...RICH,
      meta: { startedAt: "2026-08-13T14:05:22Z", durationMs: 48211, placesCalls: 2, llmInputTokens: 12043, llmOutputTokens: 1997, estCostUsd: 0.0231 },
    };
    const bad = { ...GOOD, summary: "העסק מפסיד 48211 שקל" };
    const result = await generateNarrative(withMeta, scoreFindings(DIMENSIONS, withMeta), { complete: llmReply(bad) });
    expect(result.usedFallback).toBe(true);
  });

  it("tolerates thousands separators for real data numbers", async () => {
    const withThousands = { ...GOOD, summary: "העמוד נטען אחרי 12,700 מילישניות — לאט מדי" };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withThousands) });
    expect(result.usedFallback).toBe(false); // 12700 קיים בנתונים
  });

  it("prompt serializes gaps without points", async () => {
    const complete = vi.fn().mockResolvedValue({ data: GOOD, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateNarrative(RICH, score(), { complete });
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/"points":/);
  });

  it("drops explanations for rule keys that are not in topGaps", async () => {
    const withFake = { ...GOOD, gapExplanations: [...GOOD.gapExplanations, { ruleKey: "rule_999", explanation: "הסבר מומצא" }] };
    const result = await generateNarrative(RICH, score(), { complete: llmReply(withFake) });
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
