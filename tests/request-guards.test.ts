import { describe, expect, it } from "vitest";
import { guardApiRequest } from "../src/server/api/request-guards";

// שומרי הבקשה (request-guards.ts): הגנת Origin ואכיפת content-type - טהורים לגמרי

function post(headers: Record<string, string>): Request {
  return new Request("https://ait.example/api/thing", { method: "POST", headers });
}

describe("guardApiRequest - Origin", () => {
  it("Origin תואם ל-Host עובר; Origin ממקור אחר נחסם 403", () => {
    expect(guardApiRequest(post({ origin: "https://ait.example", host: "ait.example" }))).toBeNull();
    const blocked = guardApiRequest(post({ origin: "https://evil.example", host: "ait.example" }));
    expect(blocked?.status).toBe(403);
  });

  it("Origin חסר עובר (CLI/curl - שכבת עומק, לא השכבה היחידה); Origin לא-תקני או null נחסמים", () => {
    expect(guardApiRequest(post({ host: "ait.example" }))).toBeNull();
    expect(guardApiRequest(post({ origin: "not a url", host: "ait.example" }))?.status).toBe(403);
    expect(guardApiRequest(post({ origin: "null", host: "ait.example" }))?.status).toBe(403);
  });

  it("פורט שונה = מקור שונה - נחסם (host כולל פורט)", () => {
    expect(guardApiRequest(post({ origin: "http://localhost:4000", host: "localhost:3000" }))?.status).toBe(403);
    expect(guardApiRequest(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBeNull();
  });
});

describe("guardApiRequest - content-type", () => {
  it("requireJson: בלי application/json נחסם 415; עם (כולל charset) עובר", () => {
    const base = { origin: "http://localhost:3000", host: "localhost:3000" };
    expect(guardApiRequest(post(base), { requireJson: true })?.status).toBe(415);
    expect(guardApiRequest(post({ ...base, "content-type": "text/plain" }), { requireJson: true })?.status).toBe(415);
    expect(guardApiRequest(post({ ...base, "content-type": "application/json" }), { requireJson: true })).toBeNull();
    expect(guardApiRequest(post({ ...base, "content-type": "Application/JSON; charset=utf-8" }), { requireJson: true })).toBeNull();
  });

  it("בלי requireJson אין דרישת כותרת (מסלולים בלי גוף)", () => {
    expect(guardApiRequest(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBeNull();
  });
});
