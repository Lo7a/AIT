export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmJsonResult<T> {
  data: T;
  usage: LlmUsage;
}

export type FetchLike = typeof fetch;

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
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetchImpl(`${BASE_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("LLM returned an empty response");
  return {
    data: JSON.parse(text) as T,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
