import { describe, it, expect } from "vitest";
import { formatDiagnosisSummary } from "../src/pipeline/report/presenter";
import { DATA_STATUS_LABEL, DIAGNOSIS_STATUS_LABEL, PARTIAL_FLAG_LABEL, scoreTone } from "../src/pipeline/report/presenter";
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

const MODEL: BusinessModel = {
  data: {} as never,
  fieldSources: {},
  credits: {
    profile: 0.5, channels: 0.5, lead_flow: 0.5, scheduling: 0.5, service: 0.5,
    billing: 0, retention: 0, tools: 0.5, pains: 0.5, manual_tasks: 0,
  },
  completenessPct: 35,
};

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

  it("handles an empty topGaps gracefully (healthy business) - no empty gaps section, still shows strengths", () => {
    const healthyScore: ScoreReport = {
      ...SCORE,
      topGaps: [],
    };
    const text = formatDiagnosisSummary(healthyScore, MODEL, {
      action: "interview", reason: "השלם כמה שאלות על טיפול בלידים",
    });
    expect(text).not.toContain("פערים מובילים");
    expect(text).toContain("לא נמצאו פערים מהותיים"); // התו החיובי חייב להישאר, לא רק היעדר הכותרת
    expect(text).toContain("לעסק יש אתר"); // עדיין מציג חוזקות
    expect(text.length).toBeGreaterThan(0);
  });

  it("does NOT print the positive 'no gaps' line when overall is null (no data at all, not a clean bill of health)", () => {
    const noDataScore: ScoreReport = {
      overall: null,
      dimensions: [
        { key: "visibility", label: "נראות דיגיטלית", weight: 0.2, score: null, dataStatus: "none", rules: [] },
      ],
      topGaps: [],
      topStrengths: [],
    };
    const text = formatDiagnosisSummary(noDataScore, MODEL, {
      action: "free_text", reason: "ספר לנו על העסק במילים שלך",
    });
    expect(text).toContain("אין מספיק מידע");
    expect(text).not.toContain("לא נמצאו פערים מהותיים");
    expect(text).not.toContain("בסיס דיגיטלי חזק");
  });
});

describe("מילוני תצוגה", () => {
  it("תווית לכל סטטוס אבחון", () => {
    for (const s of ["created", "scanning", "scanned", "report_ready", "interviewing", "roadmap_ready"] as const) {
      expect(DIAGNOSIS_STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it("תווית לכל דגל partial", () => {
    for (const f of ["no_website", "few_reviews", "no_review_text", "crawl_failed", "pagespeed_failed", "review_analysis_failed", "js_rendered", "no_gbp"] as const) {
      expect(PARTIAL_FLAG_LABEL[f]).toBeTruthy();
    }
  });

  it("scoreTone: סף 75 ירוק, 50 בינוני, מתחת אדום, null לא ידוע", () => {
    expect(scoreTone(75)).toBe("good");
    expect(scoreTone(74)).toBe("mid");
    expect(scoreTone(50)).toBe("mid");
    expect(scoreTone(49)).toBe("low");
    expect(scoreTone(null)).toBe("unknown");
  });

  it("DATA_STATUS_LABEL תואם לתגי ה-CLI הקיימים", () => {
    expect(DATA_STATUS_LABEL.partial).toBe("מידע חלקי");
    expect(DATA_STATUS_LABEL.none).toBe("אין מידע");
  });
});
