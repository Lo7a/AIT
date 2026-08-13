import { describe, it, expect } from "vitest";
import {
  deriveBusinessModel, recommendNextStep, completenessOf, MODEL_SECTIONS,
} from "../src/pipeline/model/business-model";
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

// ביקורות נותחו בפועל אך אף ביקורת לא הכילה טקסט (no_review_text) — "לא נבדק כלום", לא "נבדק ונמצא נקי"
const NO_TEXT: ScanFindings = {
  business: { placeId: "p5", name: "עסק", rating: 4.5, reviewCount: 40 },
  reviewInsights: { totalAnalyzed: 0, positiveThemes: [], problemThemes: [] },
  partial: ["no_website", "no_review_text"],
  meta: META,
};

// אתר js_rendered בלי GBP — אותות שליליים לא אמינים, אבל גילוי חיובי (GA) עדיין נספר
const JS_SITE: ScanFindings = {
  business: { placeId: "", name: "x.co.il", website: "https://x.co.il/" },
  websiteSignals: {
    pagesCrawled: 1, crawledUrls: [], hasContactForm: false, hasWhatsappLink: false,
    hasPhoneLink: false, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, jsRendered: true,
  },
  partial: ["no_gbp", "js_rendered"],
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
    const m = deriveBusinessModel(NO_TEXT);
    expect(m.credits.pains).toBe(0);
    expect(m.data.pains).toEqual({});
  });

  it("does not assert scheduling/tools absences from a js_rendered crawl, but counts positive detections", () => {
    const m = deriveBusinessModel(JS_SITE);
    expect(m.data.scheduling).toEqual({});
    expect(m.credits.scheduling).toBe(0);
    expect(m.credits.tools).toBe(0.5); // GA זוהה — ראיה חיובית נספרת
    expect((m.data.tools as { detected: string[] }).detected).toEqual(["google_analytics"]);
  });

  it("holds the structural invariants on every fixture", () => {
    for (const fixture of [RICH, THIN, NO_TEXT, JS_SITE]) {
      const m = deriveBusinessModel(fixture);
      for (const k of MODEL_SECTIONS) {
        expect(m.credits[k] > 0, `${k}: credit⟺source`).toBe(m.fieldSources[k] !== undefined);
        expect(m.credits[k] > 0, `${k}: credit⟺data`).toBe(Object.keys(m.data[k]).length > 0);
        // ערכי undefined בתוך data לא שורדים JSONB — המפתח חייב להיות מושמט, לא undefined
        expect(Object.values(m.data[k]).includes(undefined), `${k}: no undefined values`).toBe(false);
      }
      expect(m.completenessPct).toBe(completenessOf(m.credits));
    }
  });

  it("pins RICH's exact credit map (the 30% floor has zero headroom)", () => {
    expect(deriveBusinessModel(RICH).credits).toEqual({
      profile: 0.5, channels: 0.5, lead_flow: 0.5, scheduling: 0.5, service: 0,
      billing: 0, retention: 0, tools: 0.5, pains: 0.5, manual_tasks: 0,
    });
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
