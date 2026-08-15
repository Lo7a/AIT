import { describe, expect, it } from "vitest";
import {
  groupByPhase, initialRoadmapState, roadmapReducer, PHASE_LABEL, PHASE_ORDER,
} from "../src/app/roadmap/roadmap-logic";
import type { RoadmapItemView, RoadmapView } from "../src/server/roadmap-repo";

// כל המבחנים כאן אופליין לגמרי (אין fetch, אין React, אין DB) - roadmap-logic.ts טהור בכוונה,
// ראו הערת המודול. use-roadmap.ts הוא היחיד שמדבר עם fetch/רשת בפועל.

function makeItem(overrides: Partial<RoadmapItemView> = {}): RoadmapItemView {
  return {
    id: "item-1",
    catalogId: "cat-1",
    score: 70,
    confidence: "high",
    phase: "automation",
    status: "proposed",
    name: "פריט לדוגמה",
    problem: "בעיה לדוגמה",
    solution: "פתרון לדוגמה",
    costRange: "₪100-500",
    savingRange: "שעה בשבוע",
    complexity: "low",
    installTime: "שבוע",
    reasoning: "נימוק לדוגמה",
    benchmarks: [],
    ...overrides,
  };
}

function makeRoadmap(items: RoadmapItemView[]): RoadmapView {
  return { id: "roadmap-1", diagnosisId: "d1", createdAt: new Date(), items };
}

describe("groupByPhase", () => {
  it("מקבץ פריטים לפי שלב, ומשמיט קבוצות ריקות", () => {
    const items = [
      makeItem({ id: "a", phase: "quick_wins" }),
      makeItem({ id: "b", phase: "ai" }),
    ];
    const groups = groupByPhase(items);
    expect(groups.map((g) => g.phase)).toEqual(["quick_wins", "ai"]);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("סדר הקבוצות תמיד לפי PHASE_ORDER, לא לפי סדר הופעת הפריטים", () => {
    const items = [
      makeItem({ id: "a", phase: "ai" }),
      makeItem({ id: "b", phase: "quick_wins" }),
      makeItem({ id: "c", phase: "automation" }),
    ];
    const groups = groupByPhase(items);
    expect(groups.map((g) => g.phase)).toEqual(["quick_wins", "automation", "ai"]);
  });

  it("שומר על סדר הפריטים בתוך כל קבוצה כמו שהתקבל - לא ממיין מחדש", () => {
    const items = [
      makeItem({ id: "high", phase: "automation", score: 90 }),
      makeItem({ id: "low", phase: "automation", score: 10 }),
      makeItem({ id: "mid", phase: "automation", score: 50 }),
    ];
    const groups = groupByPhase(items);
    expect(groups[0].items.map((i) => i.id)).toEqual(["high", "low", "mid"]);
  });

  it("שלב transformation לא מופיע היום - קבוצה ריקה לא נכנסת לתוצאה", () => {
    const groups = groupByPhase([makeItem({ phase: "automation" })]);
    expect(groups.some((g) => g.phase === "transformation")).toBe(false);
  });

  it("מערך פריטים ריק -> מערך קבוצות ריק", () => {
    expect(groupByPhase([])).toEqual([]);
  });

  it("PHASE_LABEL מכסה את כל ארבעת השלבים מ-PHASE_ORDER", () => {
    for (const phase of PHASE_ORDER) expect(PHASE_LABEL[phase]).toBeTruthy();
  });
});

describe("initialRoadmapState", () => {
  it("initial=null -> buildPhase='idle', roadmap=null, itemBrief ריק", () => {
    const state = initialRoadmapState(null);
    expect(state.buildPhase).toBe("idle");
    expect(state.roadmap).toBeNull();
    expect(state.itemBrief).toEqual({});
  });

  it("initial עם roadmap קיים -> buildPhase='ready'", () => {
    const roadmap = makeRoadmap([makeItem({ id: "a" })]);
    const state = initialRoadmapState(roadmap);
    expect(state.buildPhase).toBe("ready");
    expect(state.roadmap).toBe(roadmap);
  });

  it("פריט עם status='requested' נזרע כ-'requested', פריט 'proposed' נזרע כ-'idle'", () => {
    const roadmap = makeRoadmap([
      makeItem({ id: "a", status: "proposed" }),
      makeItem({ id: "b", status: "requested" }),
    ]);
    const state = initialRoadmapState(roadmap);
    expect(state.itemBrief).toEqual({ a: "idle", b: "requested" });
  });
});

describe("roadmapReducer - בנייה", () => {
  it("buildStart -> buildPhase='building', מנקה שגיאה קודמת", () => {
    const state = { ...initialRoadmapState(null), error: "שגיאה ישנה" };
    const next = roadmapReducer(state, { type: "buildStart" });
    expect(next.buildPhase).toBe("building");
    expect(next.error).toBeNull();
  });

  it("buildOk -> buildPhase='ready', roadmap מוחלף, itemBrief נזרע מחדש מהפריטים החדשים", () => {
    const oldRoadmap = makeRoadmap([makeItem({ id: "old", status: "requested" })]);
    const state = roadmapReducer(initialRoadmapState(oldRoadmap), { type: "buildStart" });

    const newRoadmap = makeRoadmap([makeItem({ id: "new", status: "proposed" })]);
    const next = roadmapReducer(state, { type: "buildOk", payload: newRoadmap });

    expect(next.buildPhase).toBe("ready");
    expect(next.roadmap).toBe(newRoadmap);
    // "old" לא קיים יותר ב-Roadmap החדש (חישוב מחדש יוצר Roadmap חדש עם id-ים חדשים) - itemBrief
    // לא גורר מצב "requested" ישן שכבר לא שייך לשום פריט קיים
    expect(next.itemBrief).toEqual({ new: "idle" });
  });

  it("buildFail -> buildPhase='error', מציג את הודעת השגיאה", () => {
    const next = roadmapReducer(initialRoadmapState(null), { type: "buildFail", error: "לא הצלחנו לבנות Roadmap" });
    expect(next.buildPhase).toBe("error");
    expect(next.error).toBe("לא הצלחנו לבנות Roadmap");
  });
});

describe("roadmapReducer - בקשת Brief פר-פריט", () => {
  const roadmap = makeRoadmap([makeItem({ id: "x", status: "proposed" })]);

  it("itemSendStart -> 'sending' לפריט הזה בלבד, מנקה שגיאה קודמת שלו", () => {
    const withError = { ...initialRoadmapState(roadmap), itemError: { x: "שגיאה ישנה" } };
    const next = roadmapReducer(withError, { type: "itemSendStart", itemId: "x" });
    expect(next.itemBrief.x).toBe("sending");
    expect(next.itemError.x).toBe("");
  });

  it("itemSendOk -> 'requested' לפריט הזה, שאר הפריטים לא מושפעים", () => {
    const twoItems = makeRoadmap([
      makeItem({ id: "x", status: "proposed" }),
      makeItem({ id: "y", status: "proposed" }),
    ]);
    const state = initialRoadmapState(twoItems);
    const next = roadmapReducer(state, { type: "itemSendOk", itemId: "x" });
    expect(next.itemBrief.x).toBe("requested");
    expect(next.itemBrief.y).toBe("idle");
  });

  it("itemSendFail -> חוזר ל-'idle' (לא נשאר תקוע ב-sending) ושומר הודעת שגיאה קריאה", () => {
    const state = roadmapReducer(initialRoadmapState(roadmap), { type: "itemSendStart", itemId: "x" });
    const next = roadmapReducer(state, { type: "itemSendFail", itemId: "x", error: "משהו השתבש" });
    expect(next.itemBrief.x).toBe("idle");
    expect(next.itemError.x).toBe("משהו השתבש");
  });
});
