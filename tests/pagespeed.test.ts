import { describe, it, expect, vi } from "vitest";
import { runPageSpeed } from "../src/pipeline/google/pagespeed";
import type { FetchLike } from "../src/pipeline/http";

function psiResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

function timeoutError() {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
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
    // המפתח בכותרת ולא ב-URL (מדיניות docs/llm.md) - נבדק חי מול PSI: 200 עם נתוני Lighthouse מלאים
    expect(calledUrl).not.toContain("key=");
    expect(calledUrl).not.toContain("test-secret-key");
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-secret-key");
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
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers as Record<string, string>).not.toHaveProperty("x-goog-api-key");
    vi.unstubAllEnvs();
  });

  it("דומיין עברי (IDN) נשלח ל-PSI בצורת punycode - לא ביוניקוד", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => psiResponse({}));
    await runPageSpeed("https://www.סבא-אדוארד.ישראל/", { apiKey: "k", fetchImpl });
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    // new URL מנרמל את ה-host ל-xn-- (המקרה החי: PSI החזיר INVALID_URL על הצורה היוניקודית)
    expect(calledUrl).toContain("xn--");
    expect(calledUrl).not.toContain(encodeURIComponent("סבא"));
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

  it("returns a trimmed raw payload (categories/core metrics/loadingExperience) - not the full audits tree", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      psiResponse({
        loadingExperience: { overall_category: "AVERAGE" },
        lighthouseResult: {
          categories: { performance: { score: 0.42 }, seo: { score: 0.9 } },
          audits: {
            "largest-contentful-paint": { numericValue: 4123.5 },
            "cumulative-layout-shift": { numericValue: 0.12 },
            "total-blocking-time": { numericValue: 300 },
            // audit לא-ליבה שלא אמור להגיע ל-raw המקוצץ (עץ ה-audits המלא הוא מגה-בייטים)
            "unused-css-rules": { numericValue: 999, details: { items: new Array(500).fill({}) } },
          },
        },
      }));
    const result = await runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
    expect(result.raw).toEqual({
      categories: { performance: { score: 0.42 }, seo: { score: 0.9 } },
      metrics: {
        "largest-contentful-paint": 4123.5,
        "cumulative-layout-shift": 0.12,
        "total-blocking-time": 300,
      },
      loadingExperience: { overall_category: "AVERAGE" },
    });
    expect(JSON.stringify(result.raw)).not.toContain("unused-css-rules");
  });

  it("raw is undefined when lighthouseResult is missing entirely", async () => {
    const fetchImpl = vi.fn(async () => psiResponse({}));
    const result = await runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
    expect(result.raw).toBeUndefined();
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

describe("PSI retry on timeout", () => {
  it("retries once after a timeout and succeeds", async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(psiResponse({
        lighthouseResult: {
          categories: { performance: { score: 0.4 }, seo: { score: 1 } },
          audits: { "largest-contentful-paint": { numericValue: 8000 } },
        },
      }));
    const result = await runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl });
    expect(result.performanceScore).toBe(40);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [c1, c2] = fetchImpl.mock.calls;
    expect(c2[0]).toBe(c1[0]); // אותה כתובת בדיוק
    expect((c2[1] as RequestInit).signal).not.toBe((c1[1] as RequestInit).signal); // חלון טיים-אאוט טרי
  });

  it("throws after two consecutive timeouts", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(timeoutError());
    await expect(runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl })).rejects.toThrow(/timeout/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on a non-timeout failure", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: false, status: 500, text: async () => "boom", json: async () => ({}),
    } as unknown as Response);
    await expect(runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl })).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a refused-connection error (TypeError, not a timeout)", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(runPageSpeed("https://x.co.il", { apiKey: "k", fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("PSI - מארח פנימי", () => {
  // כאן אין SSRF (השרתים של גוגל מבצעים את ה-fetch, לא אנחנו) - הדילוג הוא לעקביות
  // ולחיסכון: אין טעם לשלם קריאת PSI על מארח שגוגל ממילא לא תגיע אליו
  it("skips the PSI call entirely for an internal host", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(runPageSpeed("http://127.0.0.1:6379/", { apiKey: "k", fetchImpl }))
      .rejects.toThrow(/127\.0\.0\.1/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
