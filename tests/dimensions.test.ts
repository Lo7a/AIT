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

  it("no-GBP with failed crawl: phone_available is unknown, not a false gap", () => {
    const findings: ScanFindings = {
      business: { placeId: "", name: "x.co.il", website: "https://x.co.il/" },
      partial: ["no_gbp", "crawl_failed"],
      meta: META,
    };
    const access = scoreFindings(DIMENSIONS, findings).dimensions.find((d) => d.key === "accessibility")!;
    const phone = access.rules.find((r) => r.key === "phone_available")!;
    expect(phone.known).toBe(false);
  });

  it("no known rule ever renders empty/undefined text on realistic fixtures", () => {
    const gbpCrawlFailed: ScanFindings = {
      business: { placeId: "p9", name: "עסק", website: "https://dead.co.il", rating: 4.5, reviewCount: 30 },
      partial: ["crawl_failed", "pagespeed_failed"],
      meta: META,
    };
    for (const fixture of [RICH, THIN, NO_GBP, gbpCrawlFailed]) {
      for (const d of scoreFindings(DIMENSIONS, fixture).dimensions) {
        for (const r of d.rules.filter((r) => r.known)) {
          expect(r.text.length, `${d.key}/${r.key}`).toBeGreaterThan(0);
          expect(r.text, `${d.key}/${r.key}`).not.toMatch(/undefined|NaN|null/);
        }
      }
    }
  });

  it("product thresholds sit exactly on the inclusive boundary", () => {
    const at = (over: Partial<ScanFindings["business"]>, ps?: ScanFindings["pageSpeed"]): ScanFindings => ({
      business: { placeId: "p1", name: "עסק", website: "https://x.co.il", ...over },
      websiteSignals: RICH.websiteSignals, pageSpeed: ps ?? RICH.pageSpeed,
      reviewInsights: RICH.reviewInsights, partial: [], meta: META,
    });
    const ruleOf = (f: ScanFindings, dim: string, key: string) =>
      scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === dim)!.rules.find((r) => r.key === key)!;
    expect(ruleOf(at({ rating: 4.2 }), "reputation", "rating_good").earned).toBe(true);
    expect(ruleOf(at({ rating: 4.1 }), "reputation", "rating_good").earned).toBe(false);
    expect(ruleOf(at({ reviewCount: 5 }), "reputation", "has_reviews").earned).toBe(true);
    expect(ruleOf(at({ reviewCount: 25 }), "reputation", "review_volume").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 70, seoScore: 90, lcpMs: 4000 }), "visibility", "perf").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 69, seoScore: 89, lcpMs: 4001 }), "visibility", "perf").earned).toBe(false);
  });

  it("phone_available is unknown on the GBP path when crawl failed and GBP has no phone", () => {
    const f: ScanFindings = {
      business: { placeId: "p8", name: "עסק", website: "https://x.co.il" },
      partial: ["crawl_failed"], meta: META,
    };
    const access = scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === "accessibility")!;
    expect(access.rules.find((r) => r.key === "phone_available")!.known).toBe(false);
  });

  it("dead domain: has_website is a gap, not praise", () => {
    const f: ScanFindings = {
      business: { placeId: "p7", name: "עסק", website: "https://dead.co.il", rating: 4.5, reviewCount: 30 },
      partial: ["crawl_failed", "pagespeed_failed"], meta: META,
    };
    const vis = scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === "visibility")!;
    const rule = vis.rules.find((r) => r.key === "has_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toContain("לא הצלחנו לטעון");
  });
});
