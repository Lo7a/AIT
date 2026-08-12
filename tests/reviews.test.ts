import { describe, it, expect, vi } from "vitest";
import { analyzeReviews } from "../src/pipeline/analyze/reviews";
import type { Review } from "../src/pipeline/types";

const REVIEWS: Review[] = [
  { rating: 5, text: "שירות מעולה ומהיר, ממליץ בחום" },
  { rating: 2, text: "חיכיתי שבוע שיחזרו אליי בטלפון" },
  { rating: 1, text: "אף אחד לא עונה לוואטסאפ" },
];

describe("analyzeReviews", () => {
  it("returns empty insights without calling the LLM when there are no reviews", async () => {
    const complete = vi.fn();
    const { insights, usage } = await analyzeReviews([], { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(insights).toEqual({ totalAnalyzed: 0, positiveThemes: [], problemThemes: [] });
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("skips reviews whose text is only whitespace", async () => {
    const complete = vi.fn();
    const { insights } = await analyzeReviews(
      [{ rating: 5, text: "   " }],
      { complete },
    );
    expect(complete).not.toHaveBeenCalled();
    expect(insights.totalAnalyzed).toBe(0);
  });

  it("maps LLM themes into insights and reports usage", async () => {
    const complete = vi.fn().mockResolvedValue({
      data: {
        positiveThemes: [{ theme: "שירות מהיר ואדיב", count: 1 }],
        problemThemes: [{ theme: "זמני תגובה איטיים בטלפון ובוואטסאפ", count: 2 }],
      },
      usage: { inputTokens: 500, outputTokens: 60 },
    });
    const { insights, usage } = await analyzeReviews(REVIEWS, { complete });
    expect(insights.totalAnalyzed).toBe(3);
    expect(insights.positiveThemes).toEqual([{ theme: "שירות מהיר ואדיב", count: 1 }]);
    expect(insights.problemThemes[0].count).toBe(2);
    expect(usage.inputTokens).toBe(500);
    // הפרומפט חייב לכלול את טקסט הביקורות (עיבוד זמני מותר) + דירוג
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("חיכיתי שבוע");
    expect(prompt).toContain("[2/5]");
    // ...וחייב להנחות במפורש לא לצטט ולא לכלול שמות
    expect(prompt).toContain("אל תצטט");
    expect(prompt).toContain("שמות");
  });

  it("tolerates a partially malformed LLM answer (missing arrays)", async () => {
    const complete = vi.fn().mockResolvedValue({
      data: {},
      usage: { inputTokens: 100, outputTokens: 5 },
    });
    const { insights } = await analyzeReviews(REVIEWS, { complete });
    expect(insights).toEqual({ totalAnalyzed: 3, positiveThemes: [], problemThemes: [] });
  });

  it("drops non-conforming theme entries instead of crashing", async () => {
    const complete = vi.fn().mockResolvedValue({
      data: {
        positiveThemes: [{ theme: "תקין", count: 2 }, { bad: true }, "מחרוזת"],
        problemThemes: [{ theme: "בעיה", count: "שתיים" }],
      },
      usage: { inputTokens: 100, outputTokens: 5 },
    });
    const { insights } = await analyzeReviews(REVIEWS, { complete });
    expect(insights.positiveThemes).toEqual([{ theme: "תקין", count: 2 }]);
    expect(insights.problemThemes).toEqual([]);
  });
});
