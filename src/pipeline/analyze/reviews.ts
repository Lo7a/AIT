import type { Review, ReviewInsights, Theme } from "../types";
import { completeJSON, type LlmUsage } from "../llm/client";

interface RawThemes {
  positiveThemes?: unknown;
  problemThemes?: unknown;
}

export interface AnalyzeDeps {
  complete?: <T>(prompt: string) => Promise<{ data: T; usage: LlmUsage }>;
}

const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

// מסנן פלט מודל לתמות תקינות בלבד — המודל לא תמיד מציית לסכמה
function sanitizeThemes(value: unknown): Theme[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (t): t is Theme =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as Theme).theme === "string" &&
      (t as Theme).theme.trim().length > 0 &&
      typeof (t as Theme).count === "number" &&
      Number.isFinite((t as Theme).count),
  );
}

// אילוץ משפטי (תנאי Google + תיקון 13): מהשלב הזה יוצאות מסקנות בלבד.
// טקסט הביקורות נכנס לפרומפט כעיבוד זמני ולעולם לא נשמר לפלט.
export async function analyzeReviews(
  reviews: Review[],
  deps: AnalyzeDeps = {},
): Promise<{ insights: ReviewInsights; usage: LlmUsage }> {
  const complete = deps.complete ?? (<T>(p: string) => completeJSON<T>(p));
  const withText = reviews.filter((r) => r.text.trim().length > 0);
  if (withText.length === 0) {
    return {
      insights: { totalAnalyzed: 0, positiveThemes: [], problemThemes: [] },
      usage: ZERO_USAGE,
    };
  }

  const reviewLines = withText
    .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.text}`)
    .join("\n");

  const prompt = `אתה מנתח ביקורות של עסק ישראלי. לפניך ${withText.length} ביקורות מ-Google.
זהה תמות חוזרות — גם חיוביות וגם בעיות — ונסח כל תמה כמסקנה כללית קצרה בעברית.
חוקים מחייבים:
- אל תצטט משפטים מהביקורות ואל תכלול שמות של אנשים. מסקנות כלליות בלבד.
- count = בכמה ביקורות התמה מופיעה (מספר שלם).
- החזר JSON בלבד בפורמט: {"positiveThemes":[{"theme":"...","count":1}],"problemThemes":[{"theme":"...","count":1}]}

הביקורות:
${reviewLines}`;

  const { data, usage } = await complete<RawThemes>(prompt);
  return {
    insights: {
      totalAnalyzed: withText.length,
      positiveThemes: sanitizeThemes(data.positiveThemes),
      problemThemes: sanitizeThemes(data.problemThemes),
    },
    usage,
  };
}
