import { readErrorBody, defaultFetch, type FetchLike } from "../http";
import { reportExternalCall } from "../observe";
export type { FetchLike } from "../http";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmJsonResult<T> {
  data: T;
  usage: LlmUsage;
}

export interface LlmOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  // תווית ההקשר לארכיון הקריאות (external_calls): כל אתר קריאה מזדהה - interview_extract,
  // narrative, roadmap_reasoning, reviews_analysis. חסר = "llm" גנרי (עדיף לתייג תמיד)
  context?: string;
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// מסיר תווי תיחום מתוכן לא-מהימן לפני שהוא נכנס לבלוק <<<...>>> בפרומפט. בלי זה ביקורת
// גוגל עוינת (או שם עסק עוין) שמכילה <<<END>>> סוגרת את בלוק הנתונים והשאר שלה יושב במיקום
// הוראה. מקור אמת יחיד: כל שלוש נקודות הכניסה (analyze/reviews, report/narrative,
// interview/extract) חייבות להשתמש בו, אחרת המשטר מתפצל בשקט
export function stripFenceMarkers(text: string): string {
  return text.replace(/<<<|>>>/g, "");
}

// נקודת ההחלפה היחידה של ספק ה-LLM. כל הצנרת קוראת רק לפונקציה הזו - ולכן זו גם נקודת
// המדידה היחידה של הארכיון (external_calls): טוקנים, משך, והפיילוד המלא נרשמים כאן פעם אחת
// לכל קריאה אמיתית (complete מוזרק בבדיקות עוקף את הפונקציה כולה - בדיקות נשארות שקטות).
export async function completeJSON<T>(
  prompt: string,
  opts: LlmOptions = {},
): Promise<LlmJsonResult<T>> {
  const startedAt = Date.now();
  const context = opts.context ?? "llm";
  try {
    const result = await completeJSONInner<T>(prompt, opts);
    reportExternalCall({
      service: "gemini", context, ok: true, durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      payload: { prompt, body: result.rawBody },
    });
    return { data: result.data, usage: result.usage };
  } catch (err) {
    reportExternalCall({
      service: "gemini", context, ok: false, durationMs: Date.now() - startedAt,
      payload: { prompt, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

async function completeJSONInner<T>(
  prompt: string,
  opts: LlmOptions,
): Promise<LlmJsonResult<T> & { rawBody: unknown }> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.LLM_MODEL ?? "gemini-3.6-flash";
  const fetchImpl: FetchLike = opts.fetchImpl ?? defaultFetch;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetchImpl(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // משימת חילוץ - חשיבה מינימלית (thinkingLevel החליף את thinkingBudget בדור Gemini 3):
      // מהירות, עלות, ומניעת מצב שבו החשיבה בולעת את תקציב הפלט
      generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "LOW" } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const errText = await readErrorBody(res);
    throw new Error(`LLM HTTP ${res.status}: ${errText}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = body.candidates?.[0]?.finishReason ?? body.promptFeedback?.blockReason ?? "unknown";
    throw new Error(`LLM returned an empty response (reason: ${reason})`);
  }
  let data: T;
  try {
    // הערה: T אינו מאומת בזמן ריצה - האחריות על ולידציה של המבנה היא על הקורא
    data = JSON.parse(text) as T;
  } catch {
    // בכוונה בלי קטע מהטקסט - אסור שטקסט ביקורות גולמי ידלוף להודעות שגיאה
    throw new Error(`LLM returned malformed JSON (${text.length} chars)`);
  }
  return {
    data,
    rawBody: body,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
    },
  };
}
