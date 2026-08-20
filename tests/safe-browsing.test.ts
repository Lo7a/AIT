import { describe, expect, it, vi } from "vitest";
import { readSafeBrowsing } from "../src/pipeline/health/safe-browsing";

// בדיקות readSafeBrowsing (תחקיר 21.8): כשל תשתית - מפתח חסר, שגיאת HTTP, כשל רשת -
// נזרק כדי שהסיבה תגיע להערות האיסוף דרך collectHealth; דילוג מכוון (מארח פנימי) נשאר
// undefined שקט. הכול אופליין: fetch מזויף, מפתח מוזרק דרך opts

const now = () => new Date("2026-08-21T10:00:00Z");

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("readSafeBrowsing - כשלי תשתית נזרקים, לא נבלעים", () => {
  it("מפתח חסר - זריקה עם הסיבה, לא undefined שקט (החשד המרכזי מסביבת ורסל)", async () => {
    const fetchImpl = vi.fn();
    await expect(readSafeBrowsing("https://example.co.il", { apiKey: "", fetchImpl, now }))
      .rejects.toThrow("GOOGLE_API_KEY חסר");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("שגיאת HTTP - זריקה עם הסטטוס בלבד, בלי גוף השגיאה", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, { error: "API not enabled" }));
    await expect(readSafeBrowsing("https://example.co.il", { apiKey: "k", fetchImpl, now }))
      .rejects.toThrow("Web Risk החזיר 403");
  });

  it("כשל רשת - השגיאה המקורית נזרקת הלאה", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    await expect(readSafeBrowsing("https://example.co.il", { apiKey: "k", fetchImpl, now }))
      .rejects.toThrow("fetch failed");
  });

  it("מארח פנימי - דילוג מכוון: undefined בשקט, בלי קריאת רשת ובלי זריקה", async () => {
    const fetchImpl = vi.fn();
    expect(await readSafeBrowsing("http://127.0.0.1/admin", { apiKey: "k", fetchImpl, now })).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("readSafeBrowsing - מסלול תקין", () => {
  it("גוף ריק = לא ברשימה, עם checkedAt של רגע הבדיקה", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const check = await readSafeBrowsing("https://example.co.il", { apiKey: "k", fetchImpl, now });
    expect(check).toEqual({ flagged: false, checkedAt: "2026-08-21T10:00:00.000Z" });
  });

  it("נוכחות threat = מסומן", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { threat: { threatTypes: ["MALWARE"] } }));
    const check = await readSafeBrowsing("https://example.co.il", { apiKey: "k", fetchImpl, now });
    expect(check?.flagged).toBe(true);
  });
});
