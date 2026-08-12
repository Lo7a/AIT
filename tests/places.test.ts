import { describe, it, expect, vi } from "vitest";
import { searchBusiness, getPlaceDetails } from "../src/pipeline/google/places";

function jsonResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

describe("searchBusiness", () => {
  it("maps Places searchText results to candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      places: [{
        id: "pid-1",
        displayName: { text: "מוסך הצפון" },
        formattedAddress: "העצמאות 1, חיפה",
        rating: 4.6,
        userRatingCount: 23,
      }],
    }));
    const results = await searchBusiness("מוסך הצפון חיפה", { apiKey: "test-secret-key", fetchImpl });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      placeId: "pid-1",
      name: "מוסך הצפון",
      address: "העצמאות 1, חיפה",
      rating: 4.6,
      reviewCount: 23,
    });
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("test-secret-key"); // בדיקת שפיות בסיסית — אין מפתח ב-URL
    const calledInit = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-secret-key");
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
    const body = JSON.parse(calledInit.body as string);
    expect(body.textQuery).toBe("מוסך הצפון חיפה");
    expect(body.languageCode).toBe("he");
    expect(body.regionCode).toBe("IL");
  });

  it("returns an empty array when nothing is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const results = await searchBusiness("עסק שלא קיים", { apiKey: "k", fetchImpl });
    expect(results).toEqual([]);
  });

  it("fails fast without an API key and never calls fetch", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(searchBusiness("x", { fetchImpl })).rejects.toThrow(/GOOGLE_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("throws a clear error on search HTTP failure, surfacing the body but not the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => "server exploded", json: async () => ({}),
    } as unknown as Response);
    const err = await searchBusiness("x", { apiKey: "test-secret-key", fetchImpl }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/500/);
    expect((err as Error).message).toContain("server exploded");
    expect((err as Error).message).not.toContain("test-secret-key");
  });
});

describe("getPlaceDetails", () => {
  it("maps details incl. reviews and drops empty-text reviews", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      id: "pid-1",
      displayName: { text: "מוסך הצפון" },
      nationalPhoneNumber: "04-1234567",
      websiteUri: "https://example.co.il",
      rating: 4.6,
      userRatingCount: 23,
      reviews: [
        { rating: 5, text: { text: "שירות מעולה" }, relativePublishTimeDescription: "לפני חודש" },
        { rating: 2, originalText: { text: "חיכיתי שבוע לתשובה" } },
        { rating: 4 },
        { rating: 3, text: { text: "טוב מאוד" }, originalText: { text: "Very good service" } },
      ],
    }));
    const details = await getPlaceDetails("pid-1", { apiKey: "test-secret-key", fetchImpl });
    expect(details.reviews).toHaveLength(3);
    expect(details).toEqual({
      placeId: "pid-1",
      name: "מוסך הצפון",
      phone: "04-1234567",
      website: "https://example.co.il",
      rating: 4.6,
      reviewCount: 23,
      reviews: [
        { rating: 5, text: "שירות מעולה", relativeTime: "לפני חודש" },
        { rating: 2, text: "חיכיתי שבוע לתשובה", relativeTime: undefined },
        { rating: 3, text: "טוב מאוד", relativeTime: undefined },
      ],
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/places/pid-1");
    expect(url).toContain("languageCode=he");
    expect(url).not.toContain("test-secret-key");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-secret-key");
    expect(headers["X-Goog-FieldMask"]).toContain("reviews");
  });

  it("throws a clear error on HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => "forbidden", json: async () => ({}),
    } as unknown as Response);
    await expect(getPlaceDetails("pid-1", { apiKey: "k", fetchImpl })).rejects.toThrow(/403/);
  });
});
