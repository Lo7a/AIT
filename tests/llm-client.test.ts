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
  });

  it("throws a clear error on an HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => "quota", json: async () => ({}),
    } as unknown as Response);
    await expect(
      completeJSON("x", { apiKey: "k", fetchImpl }),
    ).rejects.toThrow(/429/);
  });
});
