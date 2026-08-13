import { describe, it, expect } from "vitest";
import { formatDiagnosisSummary } from "../src/cli-diagnose";
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

  it("handles an empty topGaps gracefully (healthy business) — no empty gaps section, still shows strengths", () => {
    const healthyScore: ScoreReport = {
      ...SCORE,
      topGaps: [],
    };
    const text = formatDiagnosisSummary(healthyScore, MODEL, {
      action: "interview", reason: "השלם כמה שאלות על טיפול בלידים",
    });
    expect(text).not.toContain("פערים מובילים");
    expect(text).toContain("לעסק יש אתר"); // עדיין מציג חוזקות
    expect(text.length).toBeGreaterThan(0);
  });
});
