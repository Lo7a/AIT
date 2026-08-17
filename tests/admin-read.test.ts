import { describe, expect, it } from "vitest";
import { aggregateExternalCalls, countByKey } from "../src/server/admin-read";

// העזרים הטהורים של שכבת האדמין - השאילתות עצמן דקות ולא נבדקות (כמו כל שכבות ה-RSC)

describe("countByKey", () => {
  it("סופר לפי מפתח; מערך ריק מחזיר אובייקט ריק", () => {
    const rows = [{ s: "a" }, { s: "b" }, { s: "a" }, { s: "a" }];
    expect(countByKey(rows, (r) => r.s)).toEqual({ a: 3, b: 1 });
    expect(countByKey([], () => "x")).toEqual({});
  });
});

describe("aggregateExternalCalls", () => {
  const day = new Date("2026-08-17T00:00:00Z");
  const inToday = new Date("2026-08-17T10:00:00Z");
  const beforeToday = new Date("2026-08-15T10:00:00Z");
  const row = (over: Partial<Parameters<typeof aggregateExternalCalls>[0][number]>) => ({
    service: "gemini", context: "narrative", ok: true, durationMs: 1000,
    inputTokens: 100, outputTokens: 50, createdAt: inToday, ...over,
  });

  it("מקבץ לפי שירות+הקשר: קריאות, כשלים, טוקנים וממוצע משך", () => {
    const out = aggregateExternalCalls([
      row({}),
      row({ durationMs: 3000, ok: false, inputTokens: 200, outputTokens: 100 }),
      row({ service: "places", context: "places_search", inputTokens: null, outputTokens: null, durationMs: 400 }),
    ], day);
    expect(out.last7d).toHaveLength(2);
    const gemini = out.last7d[0]; // הכי הרבה קריאות - ראשון
    expect(gemini).toMatchObject({
      service: "gemini", context: "narrative", calls: 2, failed: 1,
      inputTokens: 300, outputTokens: 150, avgDurationMs: 2000,
    });
    expect(out.last7d[1]).toMatchObject({ service: "places", calls: 1, inputTokens: 0 });
  });

  it("מוני היממה סופרים רק קריאות אחרי הסף", () => {
    const out = aggregateExternalCalls([
      row({}),
      row({ createdAt: beforeToday, inputTokens: 999, outputTokens: 999 }),
    ], day);
    expect(out.todayCalls).toBe(1);
    expect(out.todayTokens).toBe(150);
    // אבל שתי הקריאות נספרות בסיכום השבועי
    expect(out.last7d[0].calls).toBe(2);
  });

  it("ריק - סיכום ריק בלי קריסה", () => {
    const out = aggregateExternalCalls([], day);
    expect(out).toEqual({ last7d: [], todayCalls: 0, todayTokens: 0 });
  });
});
