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

  it("weights the overall score and renormalizes over missing dimensions", () => {
    // 0.5×100 + 0.3×0, מנורמל על 0.8 → 62.5 → 63; ממוצע לא-משוקלל (50) חייב להיכשל
    const d1 = dim([rule("a", 100, true, true)], 0.5);
    const d2 = { ...dim([rule("b", 100, true, false)], 0.3), key: "reputation" as const };
    const d3 = { ...dim([rule("c", 100, false, false)], 0.2), key: "process" as const };
    const report = scoreFindings([d1, d2, d3], f());
    expect(report.overall).toBe(63);
  });

  it("ranks topGaps by points × dimension weight, not raw points", () => {
    // חוק 30 נק' בממד 0.15 (השפעה 4.5) מול חוק 25 נק' בממד 0.25 (השפעה 6.25)
    const infra = { ...dim([rule("analytics", 30, true, false)], 0.15), key: "infrastructure" as const };
    const access = { ...dim([rule("whatsapp", 25, true, false)], 0.25), key: "accessibility" as const };
    const report = scoreFindings([infra, access], f());
    expect(report.topGaps.map((g) => g.ruleKey)).toEqual(["whatsapp", "analytics"]);
  });

  it("never surfaces unknown rules as gaps and gives them empty text", () => {
    const d = dim([rule("unknown_big", 90, false, false), rule("known_small", 10, true, false)]);
    const report = scoreFindings([d], f());
    expect(report.topGaps.map((g) => g.ruleKey)).toEqual(["known_small"]);
    expect(report.dimensions[0].rules.find((r) => r.key === "unknown_big")?.text).toBe("");
  });

  it("marks full data exactly at the 75% known-points boundary", () => {
    const d = dim([rule("k", 75, true, true), rule("u", 25, false, false)]);
    expect(scoreFindings([d], f()).dimensions[0].dataStatus).toBe("full");
  });
});
