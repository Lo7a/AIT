import { describe, expect, it } from "vitest";
import { makeSearchHandler } from "../src/server/api/search-handler";
import type { BusinessCandidate } from "../src/pipeline/types";

const candidates: BusinessCandidate[] = [
  { placeId: "p1", name: "אופטיקה בק", address: "עפולה", rating: 4.9, reviewCount: 80 },
];

function req(body: unknown): Request {
  return new Request("http://test/api/search", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("makeSearchHandler", () => {
  it("מחזיר מועמדים לשאילתה תקינה", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(req({ query: "אופטיקה בק עפולה" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates });
  });

  it("חותך ל-5 מועמדים לכל היותר", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...candidates[0], placeId: `p${i}` }));
    const handler = makeSearchHandler(async () => many);
    const res = await handler(req({ query: "מאפייה" }));
    expect((await res.json()).candidates).toHaveLength(5);
  });

  it("שאילתה קצרה מדי — 400 עם הודעה עברית", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(req({ query: "א" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/שם עסק/);
  });

  it("שאילתה ארוכה מדי (מעל 120) — 400", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(req({ query: "א".repeat(121) }));
    expect(res.status).toBe(400);
  });

  it("גוף לא-JSON — 400, לא זריקה", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(new Request("http://test/api/search", { method: "POST", body: "לא json" }));
    expect(res.status).toBe(400);
  });

  it("query לא-מחרוזת (מספר) — 400, לא זריקה ולא קריאת חיפוש", async () => {
    let called = false;
    const handler = makeSearchHandler(async () => { called = true; return candidates; });
    const res = await handler(req({ query: 42 }));
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it("כשל Places — 502 עם ההודעה", async () => {
    const handler = makeSearchHandler(async () => { throw new Error("quota"); });
    const res = await handler(req({ query: "מאפייה תל אביב" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("quota");
  });
});
