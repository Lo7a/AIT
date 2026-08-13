import { describe, it, expect } from "vitest";
import { deriveBusinessModel, recommendNextStep, MODEL_SECTIONS } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

// עסק עשיר עם אתר מלא — בסגנון אופטיקה בק (זהה ל-tests/dimensions.test.ts)
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

// עסק דל בלי אתר — בסגנון ברכת רחל (זהה ל-tests/dimensions.test.ts)
const THIN: ScanFindings = {
  business: { placeId: "p2", name: "מאפיה", phone: "08-000", rating: 4.4, reviewCount: 8 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [], problemThemes: [{ theme: "מחירים גבוהים", count: 2 }] },
  partial: ["no_website"],
  meta: META,
};

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

  it("gives pains zero credit when analysis ran but no review had text", () => {
    const noText: ScanFindings = {
      business: { placeId: "p5", name: "עסק", rating: 4.5, reviewCount: 40 },
      reviewInsights: { totalAnalyzed: 0, positiveThemes: [], problemThemes: [] },
      partial: ["no_website", "no_review_text"], meta: META,
    };
    const m = deriveBusinessModel(noText);
    expect(m.credits.pains).toBe(0);
    expect(m.data.pains).toEqual({});
  });

  it("does not assert scheduling/tools absences from a js_rendered crawl, but counts positive detections", () => {
    const jsSite: ScanFindings = {
      business: { placeId: "", name: "x.co.il", website: "https://x.co.il/" },
      websiteSignals: {
        pagesCrawled: 1, crawledUrls: [], hasContactForm: false, hasWhatsappLink: false,
        hasPhoneLink: false, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
        hasFacebookPixel: false, hasGoogleAnalytics: true, jsRendered: true,
      },
      partial: ["no_gbp", "js_rendered"], meta: META,
    };
    const m = deriveBusinessModel(jsSite);
    expect(m.data.scheduling).toEqual({});
    expect(m.credits.scheduling).toBe(0);
    expect(m.credits.tools).toBe(0.5); // GA זוהה — ראיה חיובית נספרת
    expect((m.data.tools as { detected: string[] }).detected).toEqual(["google_analytics"]);
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
