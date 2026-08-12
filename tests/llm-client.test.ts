import { describe, it, expect, vi } from "vitest";
import { completeJSON } from "../src/pipeline/llm/client";

function geminiResponse(jsonText: string, inTok = 100, outTok = 20) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: jsonText }] } }],
      usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok },
    }),
    text: async () => "",
  } as unknown as Response;
}

describe("completeJSON", () => {
  it("parses the model's JSON answer and reports token usage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse('{"hello":"world"}'));
    const result = await completeJSON<{ hello: string }>("say hello as json", {
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });
    expect(result.data.hello).toBe("world");
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(20);
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain("test-model:generateContent");
    expect(calledUrl).not.toContain("test-key"); // המפתח לעולם לא ב-URL
    const calledInit = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(calledInit.body as string);
    expect(body.contents[0].parts[0].text).toBe("say hello as json");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("throws a clear error on an HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => "quota", json: async () => ({}),
    } as unknown as Response);
    await expect(
      completeJSON("x", { apiKey: "k", fetchImpl }),
    ).rejects.toThrow(/429/);
  });

  it("fails fast without an API key and never calls fetch", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(completeJSON("x", { fetchImpl })).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("reports the finish reason when the response has no text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => "",
      json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }),
    } as unknown as Response);
    await expect(completeJSON("x", { apiKey: "k", fetchImpl })).rejects.toThrow(/SAFETY/);
  });

  it("wraps malformed JSON in a clear error without echoing the text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse("<html>not json"));
    const err = await completeJSON("x", { apiKey: "k", fetchImpl }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/malformed JSON/);
    expect((err as Error).message).not.toContain("<html>");
  });
});
