import { describe, it, expect } from "vitest";
import { scoreOpportunity, phaseOf, phaseTierOf, type Phase } from "../src/pipeline/roadmap/opportunity-score";
import type { CatalogRowLite, MatchEvidence, OpportunityMatch } from "../src/pipeline/roadmap/matching";

// עוזר לבניית OpportunityMatch סינתטי - רק השדות שהפונקציות בקובץ הנבדק בפועל קוראות
function catalogItem(overrides: Partial<CatalogRowLite> = {}): CatalogRowLite {
  return {
    id: "c1",
    name: "פריט לדוגמה",
    problem: "בעיה לדוגמה",
    solution: "פתרון לדוגמה",
    conditions: { gapKeys: ["analytics"] },
    costRange: "₪100-1000",
    savingRange: "שעה בשבוע",
    complexity: "medium",
    installTime: "שבוע",
    ...overrides,
  };
}

function evidenceItem(lostWeightedPoints: number): MatchEvidence {
  return { ruleKey: "analytics", dimension: "infrastructure", text: "אין Google Analytics", lostWeightedPoints };
}

function match(overrides: Partial<OpportunityMatch> = {}): OpportunityMatch {
  return {
    catalog: catalogItem(),
    evidence: [],
    unknownKeys: [],
    painQuotes: [],
    ...overrides,
  };
}

describe("scoreOpportunity", () => {
  it("is monotonic: more lost points (same everything else) never lowers the score", () => {
    const low = match({ evidence: [evidenceItem(10)] });
    const high = match({ evidence: [evidenceItem(30)] });

    const lowResult = scoreOpportunity(low, 100, true);
    const highResult = scoreOpportunity(high, 100, true);

    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it("lifts the score by exactly 20 (pre-clamp) when painQuotes is non-empty", () => {
    const withoutPain = match({ evidence: [evidenceItem(20)] });
    const withPain = match({ evidence: [evidenceItem(20)], painQuotes: ["הלקוחות מתלוננים על זמן המענה"] });

    const a = scoreOpportunity(withoutPain, 100, true);
    const b = scoreOpportunity(withPain, 100, true);

    expect(b.score - a.score).toBe(20);
  });

  it("applies a -10 penalty when unknownKeys is non-empty, and reports confidence=medium", () => {
    const complete = match({ evidence: [evidenceItem(20)] });
    const withUnknown = match({ evidence: [evidenceItem(20)], unknownKeys: ["fb_pixel"] });

    const a = scoreOpportunity(complete, 100, true);
    const b = scoreOpportunity(withUnknown, 100, true);

    expect(a.score - b.score).toBe(10);
    expect(a.confidence).toBe("high");
    expect(b.confidence).toBe("medium");
  });

  it("keeps the score within 0-100 for extreme inputs, including pain-only + high complexity", () => {
    const painOnlyHighComplexity = match({
      catalog: catalogItem({ complexity: "high" }),
      evidence: [],
      unknownKeys: ["analytics", "fb_pixel", "whatsapp"],
      painQuotes: ["כאב אחד בלבד"],
    });
    const result = scoreOpportunity(painOnlyHighComplexity, 500, true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    const maxedOut = match({
      catalog: catalogItem({ complexity: "low" }),
      evidence: [evidenceItem(1000)],
      unknownKeys: [],
      painQuotes: ["כאב"],
    });
    const maxedResult = scoreOpportunity(maxedOut, 1000, true);
    expect(maxedResult.score).toBeLessThanOrEqual(100);
    expect(maxedResult.score).toBeGreaterThanOrEqual(0);
  });

  // הקליפ התחתון הוא זה שחי בפועל: הסכום המקסימלי האפשרי הוא 60+20+10=90, אבל הסכום המינימלי
  // (בסיס אפס, בלי כאב, עם unknownKeys, מורכבות גבוהה) הוא -20 - בלי הקליפ היה נכתב ציון שלילי
  // לעמודת score. בלי הבדיקה הזו אפשר להסיר את הקליפ לגמרי ואף בדיקה לא נופלת
  it("clamps a negative raw score to 0 (weakest possible match: no points, unknowns, high complexity)", () => {
    const weakest = match({
      catalog: catalogItem({ complexity: "high" }),
      evidence: [evidenceItem(0)],
      unknownKeys: ["fb_pixel", "analytics"],
      painQuotes: [],
    });
    const result = scoreOpportunity(weakest, 100, true);
    expect(result.score).toBe(0);
    expect(Object.is(result.score, -0)).toBe(false);
  });

  it("gives confidence=low for a pain-only match (empty evidence), regardless of hasInterviewModel", () => {
    const painOnly = match({ evidence: [], painQuotes: ["כואב לי שהתורים לא מנוהלים"] });
    const withModel = scoreOpportunity(painOnly, 100, true);
    const withoutModel = scoreOpportunity(painOnly, 100, false);
    expect(withModel.confidence).toBe("low");
    expect(withoutModel.confidence).toBe("low");
    expect(withModel.score).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic: calling twice with the same input yields a deep-equal result", () => {
    const m = match({ evidence: [evidenceItem(17)], unknownKeys: ["fb_pixel"], painQuotes: ["כאב"] });
    const first = scoreOpportunity(m, 80, true);
    const second = scoreOpportunity(m, 80, true);
    expect(second).toEqual(first);
  });

  it("does not produce NaN when maxLostPoints is 0 (pain-only matches, no lost points anywhere)", () => {
    const m = match({ evidence: [], painQuotes: ["כאב בלי שום ראיה כמותית"] });
    const result = scoreOpportunity(m, 0, true);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("applies the complexity modifier: low +10, medium 0, high -10 (relative to each other)", () => {
    const low = scoreOpportunity(match({ catalog: catalogItem({ complexity: "low" }), evidence: [evidenceItem(20)] }), 100, true);
    const medium = scoreOpportunity(match({ catalog: catalogItem({ complexity: "medium" }), evidence: [evidenceItem(20)] }), 100, true);
    const high = scoreOpportunity(match({ catalog: catalogItem({ complexity: "high" }), evidence: [evidenceItem(20)] }), 100, true);

    expect(low.score - medium.score).toBe(10);
    expect(medium.score - high.score).toBe(10);
  });

  // תיקון ממצא שער יציאה אבן דרך 4, בדיקה 4 (docs/milestone-4-gate.md): בלי מודל מראיון, עסק
  // מקבל לכל היותר medium - אף פעם לא high, גם כשאין שום unknownKeys (ה-gapKeys ידועים ישירות
  // מהסריקה, לא מהראיון)
  describe("hasInterviewModel=false (עסק בלי אף ראיון)", () => {
    it("לעולם לא high, גם כשכל ה-gapKeys ידועים (unknownKeys ריק) - נתקרה ל-medium", () => {
      const fullyKnownFromScan = match({ evidence: [evidenceItem(30)], unknownKeys: [] });
      const result = scoreOpportunity(fullyKnownFromScan, 100, false);
      expect(result.confidence).toBe("medium");
    });

    it("נשאר medium גם כשיש unknownKeys - לא יורד ל-low כל עוד יש ראיה אחת לפחות", () => {
      const withUnknown = match({ evidence: [evidenceItem(30)], unknownKeys: ["fb_pixel"] });
      const result = scoreOpportunity(withUnknown, 100, false);
      expect(result.confidence).toBe("medium");
    });

    it("הציון המספרי זהה בין hasInterviewModel=true ל-false לאותה התאמה - רק הביטחון משתנה", () => {
      const m = match({ evidence: [evidenceItem(25)], unknownKeys: [] });
      const withModel = scoreOpportunity(m, 100, true);
      const withoutModel = scoreOpportunity(m, 100, false);
      expect(withoutModel.score).toBe(withModel.score);
      expect(withModel.confidence).toBe("high");
      expect(withoutModel.confidence).toBe("medium");
    });
  });
});

describe("phaseOf", () => {
  // 11 פריטי הקטלוג האמיתיים מ-prisma/seed.ts (מבנה CATALOG) - רק name/complexity/costRange
  // רלוונטיים לסיווג השלב; שאר השדות ממולאים בערכי דמה כדי לספק CatalogRowLite תקין.
  // עדכון מחירים/פריטים בזרע לא אמור לשנות את המיפוי הזה בלי החלטה מודעת - זו הסיבה
  // שהמבחן הזה קובע ציפייה מפורשת לכל שם, ולא רק "כל פריט מקבל איזשהו שלב".
  const REAL_CATALOG_ITEMS: { name: string; complexity: string; costRange: string; expected: string }[] = [
    { name: "סוכן AI לטיפול בלידים", complexity: "medium", costRange: "הקמה ₪1,800-12,500 + ₪300-1,500 לחודש", expected: "ai" },
    { name: "בוט וואטסאפ לשירות לקוחות", complexity: "medium", costRange: "הקמה ₪2,500-12,000 + ₪100-900 לחודש", expected: "ai" },
    { name: "קביעת תורים אונליין", complexity: "low", costRange: "₪100-500 לחודש", expected: "automation" },
    { name: "הקמת פרופיל Google Business", complexity: "low", costRange: "₪400-2,000 חד-פעמי", expected: "quick_wins" },
    { name: "איסוף ביקורות אוטומטי", complexity: "low", costRange: "הקמה ₪350-3,500 + ₪150-900 לחודש", expected: "automation" },
    { name: "ניהול ומענה לביקורות", complexity: "low", costRange: "₪300-800 לחודש", expected: "automation" },
    { name: "שיפור מהירות האתר", complexity: "medium", costRange: "₪700-9,000 חד-פעמי לפי מורכבות האתר", expected: "automation" },
    { name: "חיבור וואטסאפ לאתר", complexity: "low", costRange: "₪300-800 חד-פעמי", expected: "quick_wins" },
    { name: "התקנת מדידה (Analytics + פיקסל)", complexity: "low", costRange: "₪800-3,500 חד-פעמי", expected: "automation" },
    { name: "חיבור לידים ל-CRM והתראות", complexity: "medium", costRange: "הקמה ₪1,500-8,000 + ₪100-500 לחודש", expected: "automation" },
    { name: "הנגשת אתר + הצהרת נגישות", complexity: "medium", costRange: "תוסף + הצהרה ₪300-1,200 לשנה · הנגשה מלאה לפי התקן ₪1,500-10,000 חד-פעמי", expected: "automation" },
  ];

  it("assigns every one of the 11 real catalog items a sensible, exact phase (no fallthrough)", () => {
    expect(REAL_CATALOG_ITEMS).toHaveLength(11);

    for (const item of REAL_CATALOG_ITEMS) {
      const m = match({ catalog: catalogItem({ name: item.name, complexity: item.complexity, costRange: item.costRange }) });
      expect(phaseOf(m), `phase for "${item.name}"`).toBe(item.expected);
    }
  });

  it("classifies the two AI conversational items (agent + bot) as the ai phase", () => {
    const agent = match({ catalog: catalogItem({ name: "סוכן AI לטיפול בלידים" }) });
    const bot = match({ catalog: catalogItem({ name: "בוט וואטסאפ לשירות לקוחות" }) });
    expect(phaseOf(agent)).toBe("ai");
    expect(phaseOf(bot)).toBe("ai");
  });

  it("classifies the two simple one-time low-complexity setup items as quick_wins", () => {
    const gbp = match({ catalog: catalogItem({ name: "הקמת פרופיל Google Business" }) });
    const whatsapp = match({ catalog: catalogItem({ name: "חיבור וואטסאפ לאתר" }) });
    expect(phaseOf(gbp)).toBe("quick_wins");
    expect(phaseOf(whatsapp)).toBe("quick_wins");
  });

  // ברירת המחדל השמרנית (as-built משימה 3): פריט קטלוג עתידי שעוד לא מופה כאן מקבל automation
  // ולא נופל/זורק - הפונקציה טוטאלית, וההתחייבות ל-ai/quick_wins דורשת החלטה מפורשת בקובץ
  it("falls back to automation for a catalog row that is not in the static map", () => {
    const unmapped = match({ catalog: catalogItem({ name: "פריט קטלוג עתידי שעוד לא מופה" }) });
    expect(phaseOf(unmapped)).toBe("automation");
  });

  it("never assigns transformation to any current catalog item (reserved for future rows)", () => {
    for (const item of REAL_CATALOG_ITEMS) {
      const m = match({ catalog: catalogItem({ name: item.name, complexity: item.complexity, costRange: item.costRange }) });
      expect(phaseOf(m)).not.toBe("transformation");
    }
  });
});

// החלטת מייסד 16.8 ("AI נמכר הכי טוב"): שכבת ai מעל כל השאר, ורק היא - השכבה היא הפונקציה
// המשותפת היחידה לשלוש נקודות המיון (run-roadmap / roadmap-repo / report-highlights), אז
// הבדיקה כאן נועלת את החוזה פעם אחת לכולן
describe("phaseTierOf", () => {
  it("ai הוא השכבה העליונה (0), כל שאר השלבים שכבה אחת (1)", () => {
    expect(phaseTierOf("ai")).toBe(0);
    const rest: Phase[] = ["quick_wins", "automation", "transformation"];
    for (const phase of rest) expect(phaseTierOf(phase), `tier for "${phase}"`).toBe(1);
  });

  it("מיון עולה לפי השכבה מציב ai לפני כל שלב אחר", () => {
    const phases: Phase[] = ["transformation", "quick_wins", "ai", "automation"];
    const sorted = [...phases].sort((a, b) => phaseTierOf(a) - phaseTierOf(b));
    expect(sorted[0]).toBe("ai");
  });
});
