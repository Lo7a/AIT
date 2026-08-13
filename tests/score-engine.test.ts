import { describe, it, expect } from "vitest";
import { scoreFindings } from "../src/pipeline/score/engine";
import type { DimensionDef } from "../src/pipeline/score/types";
import type { ScanFindings } from "../src/pipeline/types";

// findings מינימלי — החוקים הסינתטיים במבחן לא קוראים ממנו כלום
function f(partial: ScanFindings["partial"] = []): ScanFindings {
  return {
    business: { placeId: "p1", name: "עסק" },
    partial,
    meta: { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
  };
}

function dim(rules: DimensionDef["rules"], weight = 1): DimensionDef {
  return { key: "visibility", label: "בדיקה", weight, rules };
}

const rule = (key: string, points: number, known: boolean, earned: boolean) => ({
  key, points,
  known: () => known, earned: () => earned,
  gapText: () => `פער ${key}`, okText: () => `תקין ${key}`,
});

describe("score engine", () => {
  it("scores earned/known*100 and marks full data", () => {
    const report = scoreFindings([dim([rule("a", 60, true, true), rule("b", 40, true, false)])], f());
    expect(report.dimensions[0].score).toBe(60);
    expect(report.dimensions[0].dataStatus).toBe("full");
    expect(report.overall).toBe(60);
  });

  it("ignores unknown rules instead of penalizing (graceful degradation)", () => {
    const report = scoreFindings([dim([rule("a", 50, true, true), rule("b", 50, false, false)])], f());
    expect(report.dimensions[0].score).toBe(100); // 50 מתוך 50 הידועות
    expect(report.dimensions[0].dataStatus).toBe("partial");
  });

  it("returns null score + none status when nothing is known, and excludes from overall", () => {
    const d1 = dim([rule("a", 100, false, false)], 0.5);
    const d2 = { ...dim([rule("b", 100, true, true)], 0.5), key: "reputation" as const };
    const report = scoreFindings([d1, d2], f());
    expect(report.dimensions[0].score).toBeNull();
    expect(report.dimensions[0].dataStatus).toBe("none");
    expect(report.overall).toBe(100); // משוקלל רק על ממדים עם מידע
  });

  it("collects topGaps (known+not-earned) sorted by lost points, max 3", () => {
    const rules = [rule("g1", 10, true, false), rule("g2", 40, true, false),
                   rule("g3", 30, true, false), rule("g4", 20, true, false)];
    const report = scoreFindings([dim(rules)], f());
    expect(report.topGaps.map((g) => g.ruleKey)).toEqual(["g2", "g3", "g4"]);
    expect(report.topGaps[0].text).toBe("פער g2");
  });

  it("collects topStrengths from earned rules", () => {
    const report = scoreFindings([dim([rule("s1", 25, true, true), rule("s2", 75, true, true)])], f());
    expect(report.topStrengths[0].ruleKey).toBe("s2");
  });

  it("overall is null when no dimension has data", () => {
    const report = scoreFindings([dim([rule("a", 100, false, false)])], f());
    expect(report.overall).toBeNull();
  });
});
