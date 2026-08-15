import { describe, expect, it } from "vitest";
import { makeStatusHandler } from "../src/server/api/diagnose-status";

function req(id?: string): Request {
  const url = id != null ? `http://test/api/diagnose/status?id=${id}` : "http://test/api/diagnose/status";
  return new Request(url);
}

describe("makeStatusHandler", () => {
  it("מזהה קיים - 200 עם הסטטוס בלבד", async () => {
    const handler = makeStatusHandler(async (id) => (id === "d1" ? "report_ready" : null));
    const res = await handler(req("d1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "report_ready" });
  });

  it("מזהה לא קיים - 404 עם הודעה עברית", async () => {
    const handler = makeStatusHandler(async () => null);
    const res = await handler(req("missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/[א-ת]/);
  });

  it("בלי פרמטר id - 400, לא קורא ל-getStatus בכלל", async () => {
    let called = false;
    const handler = makeStatusHandler(async () => { called = true; return "report_ready"; });
    const res = await handler(req());
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it("id ריק (?id=) - 400", async () => {
    const handler = makeStatusHandler(async () => "report_ready");
    const res = await handler(req(""));
    expect(res.status).toBe(400);
  });

  it("מעביר את ה-id הגולמי מה-query ל-getStatus", async () => {
    let received: string | null = null;
    const handler = makeStatusHandler(async (id) => { received = id; return "scanning"; });
    await handler(req("some-uuid-123"));
    expect(received).toBe("some-uuid-123");
  });
});

describe("makeStatusHandler - חיפוש לפי יעד (מסך blocked)", () => {
  const byTarget = async (t: { placeId?: string; url?: string }) =>
    t.placeId === "p1" ? { diagnosisId: "d9", status: "report_ready" } : null;

  it("placeId קיים - 200 עם סטטוס וגם id לניווט", async () => {
    const handler = makeStatusHandler(async () => null, byTarget);
    const res = await handler(new Request("http://test/api/diagnose/status?placeId=p1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "report_ready", id: "d9" });
  });

  it("יעד בלי אבחון - 404", async () => {
    const handler = makeStatusHandler(async () => null, byTarget);
    const res = await handler(new Request("http://test/api/diagnose/status?placeId=unknown"));
    expect(res.status).toBe(404);
  });

  it("url מועבר ל-findByTarget כמו שהוא", async () => {
    let received: { placeId?: string; url?: string } | null = null;
    const handler = makeStatusHandler(async () => null, async (t) => { received = t; return null; });
    await handler(new Request("http://test/api/diagnose/status?url=kampai.co.il"));
    expect(received).toEqual({ placeId: undefined, url: "kampai.co.il" });
  });

  it("id מנצח כשמגיעים גם id וגם placeId - התנהגות attach לא משתנה", async () => {
    const handler = makeStatusHandler(async () => "scanning", byTarget);
    const res = await handler(new Request("http://test/api/diagnose/status?id=d1&placeId=p1"));
    expect(await res.json()).toEqual({ status: "scanning" });
  });

  it("בלי findByTarget מוזרק - placeId לבדו נשאר 400 (תאימות לאחור)", async () => {
    const handler = makeStatusHandler(async () => "report_ready");
    const res = await handler(new Request("http://test/api/diagnose/status?placeId=p1"));
    expect(res.status).toBe(400);
  });
});
