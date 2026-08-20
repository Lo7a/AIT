import { describe, it, expect } from "vitest";
import { scoreFindings } from "../src/pipeline/score/engine";
import type { DimensionDef } from "../src/pipeline/score/types";
import type { ScanFindings } from "../src/pipeline/types";

// findings מינימלי - החוקים הסינתטיים במבחן לא קוראים ממנו כלום
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

// --- כיבוי חוק לפי ענף (הכרעת מייסד 10, 20.8) ---
// ההבדל מ"לא נבדק" הוא מהותי: שם אין לנו מידע, כאן יש לנו מידע - שהשאלה לא רלוונטית.
// לכן החוק לא מוצג בכלל, ולא מוצג כ"לא נבדק"
describe("industry rule suppression", () => {
  const skippable = (key: string, points: number, earned: boolean) => ({
    ...rule(key, points, true, earned),
    skipFor: ["food_takeaway", "trades_onsite"] as const,
  });

  it("a suppressed rule vanishes from the rule list - it is not rendered as not-checked", () => {
    const d = dim([rule("a", 70, true, true), skippable("b", 30, false)]);
    const kept = scoreFindings([d], f(), "food_dine_in").dimensions[0];
    const dropped = scoreFindings([d], f(), "food_takeaway").dimensions[0];
    expect(kept.rules.map((r) => r.key)).toEqual(["a", "b"]);
    expect(dropped.rules.map((r) => r.key)).toEqual(["a"]);
    // וגם לא מתחבא כלא-ידוע: אין שום שורה עם המפתח הזה
    expect(dropped.rules.find((r) => r.key === "b")).toBeUndefined();
  });

  // זה הלב: החוק יוצא משני צדי השבר, ולכן הציון עולה בלי שהעסק שינה דבר -
  // פשוט הפסקנו להוריד לו נקודות על מה שלא אמור להיות לו
  it("the suppressed points leave BOTH sides of the fraction, not just the numerator", () => {
    const d = dim([rule("a", 70, true, true), skippable("b", 30, false)]);
    expect(scoreFindings([d], f(), "food_dine_in").dimensions[0].score).toBe(70); // 70/100
    expect(scoreFindings([d], f(), "food_takeaway").dimensions[0].score).toBe(100); // 70/70
  });

  it("a suppressed rule is not a top gap either", () => {
    const d = dim([rule("a", 10, true, false), skippable("b", 90, false)]);
    expect(scoreFindings([d], f(), "food_dine_in").topGaps.map((g) => g.ruleKey)).toEqual(["b", "a"]);
    expect(scoreFindings([d], f(), "trades_onsite").topGaps.map((g) => g.ruleKey)).toEqual(["a"]);
  });

  // הכרעה 6.1: עסק בענף לא מזוהה רואה את הכול. כיבוי הוא ידיעה, וב-unknown אין ידיעה
  it("an unidentified industry suppresses nothing - and that is the default", () => {
    const d = dim([rule("a", 70, true, true), skippable("b", 30, false)]);
    expect(scoreFindings([d], f(), "unknown").dimensions[0].rules).toHaveLength(2);
    expect(scoreFindings([d], f()).dimensions[0].rules).toHaveLength(2);
  });

  // הסייג הנמדד: הגבול ישיבה/מהיר הוא החוליה החלשה בטקסונומיה. עסק שסווג "אוכל מהיר"
  // ובכל זאת נמצאה אצלו מערכת הזמנות - הממצא גובר, והחוק נשאר ומזכה אותו. בלי זה סיווג
  // שגוי היה מוחק חוזקה אמיתית, נזק גרוע יותר מהפער שהכיבוי בא למנוע
  it("positive evidence overrides the classification - an earned rule is never suppressed", () => {
    const d = dim([rule("a", 70, true, false), skippable("b", 30, true)]);
    const res = scoreFindings([d], f(), "food_takeaway").dimensions[0];
    expect(res.rules.map((r) => r.key)).toEqual(["a", "b"]);
    expect(res.score).toBe(30); // 30/100 - הנקודות שהורווחו נספרות במלואן
  });

  it("a rule without skipFor is never suppressed by any industry", () => {
    const d = dim([rule("a", 100, true, false)]);
    for (const ind of ["food_takeaway", "trades_onsite", "retail_store", "unknown"] as const) {
      expect(scoreFindings([d], f(), ind).dimensions[0].rules, ind).toHaveLength(1);
    }
  });
});
