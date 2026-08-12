import { describe, it, expect, vi } from "vitest";
import { runPageSpeed } from "../src/pipeline/google/pagespeed";

function psiResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

describe("runPageSpeed", () => {
  it("extracts performance, seo and LCP and builds the right request", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      psiResponse({
        lighthouseResult: {
          categories: {
            performance: { score: 0.42 },
            seo: { score: 0.9 },
          },
          audits: { "largest-contentful-paint": { numericValue: 4123.5 } },
        },
      }));
    const result = await runPageSpeed("https://example.co.il", {
      apiKey: "test-secret-key",
      fetchImpl,
    });
    expect(result.performanceScore).toBe(42);
    expect(result.seoScore).toBe(90);
    expect(result.lcpMs).toBe(4124);
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain("runPagespeed");
    expect(calledUrl).toContain("strategy=mobile");
    expect(calledUrl).toContain("category=PERFORMANCE");
    expect(calledUrl).toContain("category=SEO");
    expect(calledUrl).toContain(encodeURIComponent("https://example.co.il"));
    expect(calledUrl).toContain("key=test-secret-key");
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns undefined fields when lighthouse data is missing", async () => {
    const fetchImpl = vi.fn(async () => psiResponse({}));
    const result = await runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
    expect(result).toEqual({
      performanceScore: undefined,
      seoScore: undefined,
      lcpMs: undefined,
    });
  });

  it("throws a clear error on HTTP failure without leaking the key", async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: false, status: 429, text: async () => "quota exceeded", json: async () => ({}) } as unknown as Response));
    const err = await runPageSpeed("https://example.co.il", {
      apiKey: "test-secret-key",
      fetchImpl,
    }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/429/);
    expect((err as Error).message).toContain("quota exceeded");
    expect((err as Error).message).not.toContain("test-secret-key");
  });

  it("works without an API key (PSI allows keyless low-volume calls)", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => psiResponse({}));
    await runPageSpeed("https://example.co.il", { fetchImpl });
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("key=");
    vi.unstubAllEnvs();
  });

  it("keeps score 0 as 0 and maps null scores to undefined", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      psiResponse({
        lighthouseResult: {
          categories: { performance: { score: null }, seo: { score: 0 } },
          audits: {},
        },
      }));
    const result = await runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
    expect(result.performanceScore).toBeUndefined();
    expect(result.seoScore).toBe(0);
  });

  it("throws when PSI returns 200 with a lighthouse runtimeError", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      psiResponse({
        lighthouseResult: {
          runtimeError: { code: "ERRORED_DOCUMENT_REQUEST", message: "could not load" },
          categories: {},
        },
      }));
    await expect(
      runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl }),
    ).rejects.toThrow(/ERRORED_DOCUMENT_REQUEST/);
  });
});
