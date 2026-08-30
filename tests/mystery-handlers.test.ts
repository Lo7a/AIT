import { describe, expect, it } from "vitest";
import {
  makeRequestMysteryHandler, makeTickHandler, makeInboundHandler, makeAdminMysteryHandler,
} from "../src/server/api/mystery-handlers";
import { InterviewError } from "../src/pipeline/interview/contract";
import type { ReceivedEmail } from "../src/server/mail";

// אופליין לגמרי: כל תלות מוזרקת, אותו סגנון כמו roadmap-handlers.test.ts

const post = (url = "http://t/api/mystery/d1", init: RequestInit = {}) => new Request(url, { method: "POST", ...init });

describe("makeRequestMysteryHandler", () => {
  it("הצלחה - 200 עם הסבב והערוצים", async () => {
    const h = makeRequestMysteryHandler(async (id) => ({ runId: `run-${id}`, channels: ["email"] }));
    const res = await h(post(), "d1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-d1", channels: ["email"] });
  });

  it("InterviewError ממופה לסטטוס; שגיאה אחרת = 500 גנרי בלי דליפה", async () => {
    const conflict = makeRequestMysteryHandler(async () => { throw new InterviewError("כבר בדרך", "conflict"); });
    expect((await conflict(post(), "d1")).status).toBe(409);
    const invalid = makeRequestMysteryHandler(async () => { throw new InterviewError("אין ערוץ", "invalid"); });
    expect(await (await invalid(post(), "d1")).json()).toEqual({ error: "אין ערוץ" });
    const boom = makeRequestMysteryHandler(async () => { throw new Error("prisma: connection string leaked"); });
    const res = await boom(post(), "d1");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("prisma");
  });
});

describe("makeTickHandler", () => {
  const run = async () => ({ sent: 1, failed: 0, closed: 2, reported: 1 });

  it("בלי סוד בסביבה - 503 והריצה לא נקראת", async () => {
    let called = false;
    const h = makeTickHandler({ secret: undefined, run: async () => { called = true; return run(); } });
    expect((await h(post("http://t/api/mystery/tick", { headers: { "x-tick-secret": "x" } }))).status).toBe(503);
    expect(called).toBe(false);
  });

  it("סוד שגוי או חסר - 401; סוד נכון - התוצאה", async () => {
    const h = makeTickHandler({ secret: "s3cret", run });
    expect((await h(post("http://t/api/mystery/tick"))).status).toBe(401);
    expect((await h(post("http://t/api/mystery/tick", { headers: { "x-tick-secret": "wrong" } }))).status).toBe(401);
    expect((await h(post("http://t/api/mystery/tick", { headers: { "x-tick-secret": "s3cre" } }))).status).toBe(401);
    const ok = await h(post("http://t/api/mystery/tick", { headers: { "x-tick-secret": "s3cret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sent: 1, failed: 0, closed: 2, reported: 1 });
  });
});

describe("makeInboundHandler", () => {
  const received: ReceivedEmail = {
    id: "em_1", from: "info@biz.test", to: ["probe-ab@bedekesek.test"], subject: "Re: שאלה קטנה", text: "בטח", createdAt: "2026-09-01T10:00:00Z", raw: { id: "em_1" },
  };
  const event = JSON.stringify({ type: "email.received", data: { email_id: "em_1", to: ["probe-ab@bedekesek.test"] } });
  const svix = { "svix-id": "m1", "svix-timestamp": "1", "svix-signature": "v1,x" };

  it("בלי סוד - 503; חתימה לא תקפה - 401 ושום דבר לא נמשך", async () => {
    let fetched = 0;
    const base = { fetchReceived: async () => { fetched++; return received; }, record: async () => ({ matched: true }) };
    expect((await makeInboundHandler({ ...base, secret: undefined })(post("http://t/in", { body: event }))).status).toBe(503);
    const bad = makeInboundHandler({ ...base, secret: "whsec_x", verify: () => false });
    expect((await bad(post("http://t/in", { body: event, headers: svix }))).status).toBe(401);
    expect(fetched).toBe(0);
  });

  it("אירוע שאינו email.received - 200 ignored; email.received - מושך את המייל ומתעד", async () => {
    const recorded: unknown[] = [];
    const h = makeInboundHandler({
      secret: "whsec_x", verify: () => true,
      fetchReceived: async (id) => ({ ...received, id }),
      record: async (r) => { recorded.push(r); return { matched: true }; },
    });
    const other = await h(post("http://t/in", { body: JSON.stringify({ type: "email.sent", data: {} }), headers: svix }));
    expect(await other.json()).toEqual({ ignored: true });
    const res = await h(post("http://t/in", { body: event, headers: svix }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matched: true });
    expect(recorded).toEqual([{
      to: ["probe-ab@bedekesek.test"], from: "info@biz.test", receivedAt: "2026-09-01T10:00:00Z", text: "בטח", payload: { id: "em_1" },
    }]);
  });

  it("כשל במשיכת המייל - 500 כדי ש-Resend ינסה שוב", async () => {
    const h = makeInboundHandler({
      secret: "whsec_x", verify: () => true,
      fetchReceived: async () => { throw new Error("Resend Receiving החזיר 502"); },
      record: async () => ({ matched: true }),
    });
    expect((await h(post("http://t/in", { body: event, headers: svix }))).status).toBe(500);
  });
});

describe("makeAdminMysteryHandler", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it("לא אדמין - 404 (לא 403); קלט שבור - 400; פעולה לא מוכרת - 400", async () => {
    let marked = 0;
    const deny = makeAdminMysteryHandler({ isAdmin: async () => false, mark: async () => { marked++; } });
    expect(await deny(form({ probeId: "p1", action: "sent" }))).toMatchObject({ kind: "error", status: 404 });
    const allow = makeAdminMysteryHandler({ isAdmin: async () => true, mark: async () => { marked++; } });
    expect(await allow(form({ action: "sent" }))).toMatchObject({ kind: "error", status: 400 });
    expect(await allow(form({ probeId: "p1", action: "delete" }))).toMatchObject({ kind: "error", status: 400 });
    expect(marked).toBe(0);
  });

  it("אדמין עם פעולה חוקית - ok; מעבר לא חוקי מהאורקסטרטור - 400 עם ההודעה", async () => {
    const calls: [string, string][] = [];
    const h = makeAdminMysteryHandler({ isAdmin: async () => true, mark: async (id, a) => { calls.push([id, a]); } });
    expect(await h(form({ probeId: "p1", action: "answered" }))).toEqual({ kind: "ok", probeId: "p1" });
    expect(calls).toEqual([["p1", "answered"]]);
    const bad = makeAdminMysteryHandler({ isAdmin: async () => true, mark: async () => { throw new InterviewError("המעבר לא חוקי", "invalid"); } });
    expect(await bad(form({ probeId: "p1", action: "sent" }))).toEqual({ kind: "error", status: 400, message: "המעבר לא חוקי" });
  });
});
