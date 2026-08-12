import { describe, it, expect, vi } from "vitest";
import { runScan, type ScanDeps } from "../src/pipeline/scan";
import type { PlaceDetails, WebsiteSignals } from "../src/pipeline/types";

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

const RICH_SIGNALS: WebsiteSignals = {
  pagesCrawled: 3, crawledUrls: ["https://example.co.il"],
  hasContactForm: true, hasWhatsappLink: false, hasPhoneLink: true,
  hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
  hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
};

function richDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    details: vi.fn().mockResolvedValue(RICH_DETAILS),
    crawl: vi.fn().mockResolvedValue(RICH_SIGNALS),
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
    expect(findings.business).toEqual({
      placeId: "pid-1", name: "מוסך הצפון", phone: "04-1234567",
      website: "https://example.co.il", rating: 4.6, reviewCount: 23,
    });
    expect(findings.websiteSignals?.platform).toBe("wordpress");
    expect(findings.pageSpeed?.performanceScore).toBe(42);
    expect(findings.reviewInsights?.totalAnalyzed).toBe(5);
    expect(findings.partial).toEqual([]);
    expect(findings.meta.placesCalls).toBe(1);
    expect(findings.meta.llmInputTokens).toBe(500);
    expect(findings.meta.llmOutputTokens).toBe(60);
    expect(findings.meta.estCostUsd).toBe(0.03);
    expect(typeof findings.meta.durationMs).toBe("number");
    expect(new Date(findings.meta.startedAt).getTime()).not.toBeNaN();
  });

  it("never leaks raw review text into the findings JSON (Google ToS)", async () => {
    const findings = await runScan("pid-1", richDeps());
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("חיכיתי שבוע לתשובה");
    expect(serialized).not.toContain("שירות מעולה");
  });

  it("runs crawl and pagespeed in parallel, not sequentially", async () => {
    const order: string[] = [];
    const deps = richDeps({
      crawl: vi.fn(async () => {
        order.push("crawl-start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("crawl-end");
        return RICH_SIGNALS;
      }),
      pagespeed: vi.fn(async () => {
        order.push("psi-start");
        return { performanceScore: 1, seoScore: 1, lcpMs: 1 };
      }),
    });
    await runScan("pid-1", deps);
    // PSI התחיל לפני שה-crawl הסתיים — כלומר רצו במקביל
    expect(order.indexOf("psi-start")).toBeLessThan(order.indexOf("crawl-end"));
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
    expect(findings.pageSpeed).toBeUndefined();
    expect(findings.partial).toEqual(["no_website", "few_reviews"]);
    expect(findings.reviewInsights).toBeDefined(); // מנתחים גם ביקורת אחת
  });

  it("records partial flags instead of failing when sub-steps throw", async () => {
    const deps = richDeps({
      crawl: vi.fn().mockRejectedValue(new Error("boom")),
      pagespeed: vi.fn().mockRejectedValue(new Error("psi down")),
      analyzeReviews: vi.fn().mockRejectedValue(new Error("llm down")),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partial).toContain("pagespeed_failed");
    expect(findings.partial).toContain("review_analysis_failed");
    expect(findings.websiteSignals).toBeUndefined();
    expect(findings.reviewInsights).toBeUndefined();
    expect(findings.business.name).toBe("מוסך הצפון"); // האבחון עדיין מחזיר ממצאים
    expect(findings.meta.llmInputTokens).toBe(0);
    expect(findings.partialDetails?.crawl_failed).toContain("boom");
  });

  it("propagates a details failure (nothing to scan without the business)", async () => {
    const deps = richDeps({
      details: vi.fn().mockRejectedValue(new Error("Places details HTTP 403")),
    });
    await expect(runScan("pid-1", deps)).rejects.toThrow(/403/);
  });

  it("counts prior places calls in the cost meter", async () => {
    const findings = await runScan("pid-1", richDeps(), { priorPlacesCalls: 1 });
    expect(findings.meta.placesCalls).toBe(2);
    expect(findings.meta.estCostUsd).toBeCloseTo(0.06);
  });
});
