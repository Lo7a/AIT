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
  });

  it("returns an empty array when nothing is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const results = await searchBusiness("עסק שלא קיים", { apiKey: "k", fetchImpl });
    expect(results).toEqual([]);
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
      ],
    }));
    const details = await getPlaceDetails("pid-1", { apiKey: "k", fetchImpl });
    expect(details.name).toBe("מוסך הצפון");
    expect(details.website).toBe("https://example.co.il");
    expect(details.reviews).toHaveLength(2);
    expect(details.reviews[0].text).toBe("שירות מעולה");
    expect(details.reviews[1].text).toBe("חיכיתי שבוע לתשובה");
  });

  it("throws a clear error on HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => "forbidden", json: async () => ({}),
    } as unknown as Response);
    await expect(getPlaceDetails("pid-1", { apiKey: "k", fetchImpl })).rejects.toThrow(/403/);
  });
});
