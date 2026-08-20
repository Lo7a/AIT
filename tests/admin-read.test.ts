import { describe, expect, it } from "vitest";
import { aggregateExternalCalls, type ExternalCallGroup } from "../src/server/admin-read";

// העזרים הטהורים של שכבת האדמין - השאילתות עצמן דקות ולא נבדקות (כמו כל שכבות ה-RSC)

describe("aggregateExternalCalls", () => {
  // הקלט הוא קבוצות מהמסד (groupBy service+context+ok) ולא שורות גולמיות: מאז 20.8
  // הקיבוץ קורה במסד, כי שליפת כל קריאות השבוע גדלה בקצב השימוש
  const group = (over: Partial<ExternalCallGroup> = {}): ExternalCallGroup => ({
    service: "gemini", context: "narrative", ok: true,
    calls: 1, inputTokens: 100, outputTokens: 50, totalDurationMs: 1000,
    ...over,
  });

  it("ממזג הצליח ונכשל לשורה אחת לכל שירות+הקשר", () => {
    const out = aggregateExternalCalls(
      [
        group(),
        group({ ok: false, calls: 1, inputTokens: 200, outputTokens: 100, totalDurationMs: 3000 }),
        group({ service: "places", context: "places_search", inputTokens: 0, outputTokens: 0, totalDurationMs: 400 }),
      ],
      { calls: 3, tokens: 450 },
    );
    expect(out.byServiceContext).toHaveLength(2);
    const gemini = out.byServiceContext[0]; // הכי הרבה קריאות - ראשון
    expect(gemini).toMatchObject({
      service: "gemini", context: "narrative", calls: 2, failed: 1,
      inputTokens: 300, outputTokens: 150, avgDurationMs: 2000,
    });
    expect(out.byServiceContext[1]).toMatchObject({ service: "places", calls: 1, inputTokens: 0 });
  });

  it("מוני היממה מגיעים מהמסד ולא מחושבים כאן", () => {
    const out = aggregateExternalCalls([group()], { calls: 7, tokens: 1234 });
    expect(out.todayCalls).toBe(7);
    expect(out.todayTokens).toBe(1234);
  });

  it("קבוצה עם כמה קריאות תורמת את כולן, לא אחת", () => {
    const out = aggregateExternalCalls(
      [group({ calls: 5, inputTokens: 500, outputTokens: 250, totalDurationMs: 5000 })],
      { calls: 5, tokens: 750 },
    );
    expect(out.byServiceContext[0]).toMatchObject({ calls: 5, failed: 0, avgDurationMs: 1000 });
  });

  it("ריק - סיכום ריק בלי קריסה", () => {
    const out = aggregateExternalCalls([], { calls: 0, tokens: 0 });
    expect(out).toEqual({ byServiceContext: [], todayCalls: 0, todayTokens: 0 });
  });
});
