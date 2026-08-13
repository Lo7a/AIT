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
