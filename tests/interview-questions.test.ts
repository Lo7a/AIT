import { describe, expect, it } from "vitest";
import {
  QUESTION_BANK, MAX_GUIDED_QUESTIONS, pickNextQuestion,
} from "../src/pipeline/interview/questions";
import { deriveBusinessModel } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const richFindings: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה בק", rating: 4.9, reviewCount: 80, website: "https://x.co.il" },
  websiteSignals: {
    pagesCrawled: 8, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
  },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

describe("QUESTION_BANK", () => {
  it("בדיוק 12 שאלות, מפתחות ייחודיים, כולן עם סקציה חוקית", () => {
    expect(QUESTION_BANK).toHaveLength(MAX_GUIDED_QUESTIONS);
    expect(new Set(QUESTION_BANK.map((q) => q.key)).size).toBe(12);
  });

  it("אין שאלה על pains - כאבים עולים מתשובות, לא מחקירה", () => {
    expect(QUESTION_BANK.every((q) => q.section !== "pains")).toBe(true);
  });

  it("פותחן תלוי-הקשר: כשיש טופס באתר, שאלת הלידים מזכירה אותו", () => {
    const model = deriveBusinessModel(richFindings);
    const q = QUESTION_BANK.find((x) => x.key === "lead_flow_intake")!;
    expect(q.text(richFindings, model)).toContain("טופס");
    const bare: ScanFindings = { ...richFindings, websiteSignals: undefined };
    expect(q.text(bare, deriveBusinessModel(bare))).not.toContain("טופס");
  });
});

describe("pickNextQuestion", () => {
  it("מתחיל מהסקציה הראשונה בעדיפות שקרדיטה מתחת ל-1 (lead_flow)", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, []);
    expect(q?.section).toBe("lead_flow");
    expect(q?.key).toBe("lead_flow_intake");
  });

  it("מדלג על שאלות שכבר נשאלו בתוך הסקציה", () => {
    const model = deriveBusinessModel(richFindings);
    const q = pickNextQuestion(model, richFindings, ["lead_flow_intake"]);
    expect(q?.key).toBe("lead_flow_lost");
  });

  it("סקציה עם קרדיט 1 מדולגת כולה", () => {
    const model = deriveBusinessModel(richFindings);
    model.credits.lead_flow = 1;
    const q = pickNextQuestion(model, richFindings, []);
    expect(q?.section).toBe("service");
  });

  it("אחרי 12 שאלות שנשאלו - null (התקרה הקשיחה)", () => {
    const model = deriveBusinessModel(richFindings);
    const asked = QUESTION_BANK.map((q) => q.key);
    expect(pickNextQuestion(model, richFindings, asked)).toBeNull();
  });

  it("כשכל הסקציות בקרדיט 1 - null גם אם נשאלו פחות מ-12", () => {
    const model = deriveBusinessModel(richFindings);
    for (const k of Object.keys(model.credits)) model.credits[k as keyof typeof model.credits] = 1;
    expect(pickNextQuestion(model, richFindings, [])).toBeNull();
  });

  it("התקרה הקשיחה עומדת בפני עצמה, גם כשהמפתחות שנשאלו אינם מהבנק", () => {
    const asked = Array.from({ length: MAX_GUIDED_QUESTIONS }, (_, i) => `not_in_bank_${i}`);
    expect(pickNextQuestion(deriveBusinessModel(richFindings), richFindings, asked)).toBeNull();
  });
});
