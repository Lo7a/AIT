import { readErrorBody, defaultFetch, type FetchLike } from "../http";
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
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// נקודת ההחלפה היחידה של ספק ה-LLM. כל הצנרת קוראת רק לפונקציה הזו.
export async function completeJSON<T>(
  prompt: string,
  opts: LlmOptions = {},
): Promise<LlmJsonResult<T>> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.LLM_MODEL ?? "gemini-2.5-flash";
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
      generationConfig: { responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const errText = await readErrorBody(res);
    throw new Error(`LLM HTTP ${res.status}: ${errText}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = body.candidates?.[0]?.finishReason ?? body.promptFeedback?.blockReason ?? "unknown";
    throw new Error(`LLM returned an empty response (reason: ${reason})`);
  }
  let data: T;
  try {
    // הערה: T אינו מאומת בזמן ריצה — האחריות על ולידציה של המבנה היא על הקורא
    data = JSON.parse(text) as T;
  } catch {
    // בכוונה בלי קטע מהטקסט — אסור שטקסט ביקורות גולמי ידלוף להודעות שגיאה
    throw new Error(`LLM returned malformed JSON (${text.length} chars)`);
  }
  return {
    data,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
