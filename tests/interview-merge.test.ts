import { describe, expect, it } from "vitest";
import { applyInterviewUpdates } from "../src/pipeline/interview/merge";
import { deriveBusinessModel, completenessOf } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק", website: "https://x.co.il" },
  websiteSignals: {
    pagesCrawled: 3, crawledUrls: [], hasContactForm: true, hasWhatsappLink: false,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: false,
  },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

describe("applyInterviewUpdates", () => {
  it("ממזג שדות, מרים קרדיט ל-1, מוסיף מקור, ומחשב שלמות מחדש", () => {
    const before = deriveBusinessModel(findings);
    const after = applyInterviewUpdates(before, [
      { section: "lead_flow", fields: { handler: "דנה" } },
    ], "interview");
    expect(after.data.lead_flow).toEqual({ hasContactForm: true, handler: "דנה" });
    expect(after.credits.lead_flow).toBe(1);
    expect(after.fieldSources.lead_flow).toEqual(["scan", "interview"]);
    expect(after.completenessPct).toBe(completenessOf(after.credits));
    expect(after.completenessPct).toBeGreaterThan(before.completenessPct);
  });

  it("לא משנה את המודל המקורי (טהור) ולא נוגע בסקציות אחרות", () => {
    const before = deriveBusinessModel(findings);
    const snapshot = JSON.parse(JSON.stringify(before));
    applyInterviewUpdates(before, [{ section: "billing", fields: { tool: "iCount" } }], "interview");
    expect(before).toEqual(snapshot);
  });

  it("מקור לא מוכפל בעדכון שני לאותה סקציה", () => {
    const m1 = applyInterviewUpdates(deriveBusinessModel(findings), [{ section: "billing", fields: { a: "1" } }], "interview");
    const m2 = applyInterviewUpdates(m1, [{ section: "billing", fields: { b: "2" } }], "interview");
    expect(m2.fieldSources.billing).toEqual(["interview"]);
    expect(m2.data.billing).toEqual({ a: "1", b: "2" });
  });

  it("מערך עדכונים ריק - המודל חוזר זהה (אבל עותק חדש)", () => {
    const before = deriveBusinessModel(findings);
    const after = applyInterviewUpdates(before, [], "free_text");
    expect(after).toEqual(before);
    expect(after).not.toBe(before);
  });
});
