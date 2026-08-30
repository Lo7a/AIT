import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySvixSignature, parseReceivedEvent, svixHeadersOf } from "../src/server/mystery-webhook";

const KEY = Buffer.from("a-test-key-of-32-bytes-exactly!!");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = new Date("2026-09-01T10:00:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "em_1", to: ["probe-ab@bedekesek.test"] } });

const sign = (id: string, ts: string, body: string, key: Buffer = KEY) =>
  createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");

describe("verifySvixSignature", () => {
  it("חתימה נכונה בתוך חלון הזמן - עוברת", () => {
    const h = { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY)}` };
    expect(verifySvixSignature(h, BODY, SECRET, NOW)).toBe(true);
  });

  it("כמה חתימות מופרדות ברווח (החלפת סוד) - מספיק שאחת נכונה", () => {
    const h = { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, "אחר")} v1,${sign("msg_1", TS, BODY)}` };
    expect(verifySvixSignature(h, BODY, SECRET, NOW)).toBe(true);
  });

  it("גוף ששונה, מפתח אחר, גרסה לא מוכרת או כותרת חסרה - נדחים", () => {
    const good = sign("msg_1", TS, BODY);
    expect(verifySvixSignature({ id: "msg_1", timestamp: TS, signature: `v1,${good}` }, BODY + " ", SECRET, NOW)).toBe(false);
    expect(verifySvixSignature({ id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY, Buffer.from("other-key"))}` }, BODY, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature({ id: "msg_1", timestamp: TS, signature: `v2,${good}` }, BODY, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature({ id: null, timestamp: TS, signature: `v1,${good}` }, BODY, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature({ id: "msg_1", timestamp: TS, signature: null }, BODY, SECRET, NOW)).toBe(false);
  });

  it("חותמת זמן מחוץ לחמש דקות - נדחית (הגנה מפני שידור חוזר)", () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 6 * 60);
    expect(verifySvixSignature({ id: "msg_1", timestamp: old, signature: `v1,${sign("msg_1", old, BODY)}` }, BODY, SECRET, NOW)).toBe(false);
    const near = String(Math.floor(NOW.getTime() / 1000) - 4 * 60);
    expect(verifySvixSignature({ id: "msg_1", timestamp: near, signature: `v1,${sign("msg_1", near, BODY)}` }, BODY, SECRET, NOW)).toBe(true);
  });

  it("סוד בלי קידומת whsec_ עובד גם; סוד ריק לא מאשר כלום", () => {
    const h = { id: "msg_1", timestamp: TS, signature: `v1,${sign("msg_1", TS, BODY)}` };
    expect(verifySvixSignature(h, BODY, KEY.toString("base64"), NOW)).toBe(true);
    expect(verifySvixSignature(h, BODY, "whsec_", NOW)).toBe(false);
  });

  it("svixHeadersOf קורא את שלוש הכותרות", () => {
    const headers = new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" });
    expect(svixHeadersOf(headers)).toEqual({ id: "a", timestamp: "1", signature: "v1,x" });
    expect(svixHeadersOf(new Headers())).toEqual({ id: null, timestamp: null, signature: null });
  });
});

describe("parseReceivedEvent", () => {
  it("email.received עם email_id - נקרא; נמענים כמערך או כמחרוזת", () => {
    expect(parseReceivedEvent(BODY)).toEqual({ emailId: "em_1", to: ["probe-ab@bedekesek.test"], from: "", createdAt: null });
    const single = JSON.stringify({ type: "email.received", data: { id: "em_2", to: "x@y.test", from: "a@b.test", created_at: "2026-09-01T10:00:00Z" } });
    expect(parseReceivedEvent(single)).toEqual({ emailId: "em_2", to: ["x@y.test"], from: "a@b.test", createdAt: "2026-09-01T10:00:00Z" });
  });

  it("אירוע אחר, JSON שבור או בלי מזהה - null", () => {
    expect(parseReceivedEvent(JSON.stringify({ type: "email.sent", data: { email_id: "x" } }))).toBeNull();
    expect(parseReceivedEvent("{לא json")).toBeNull();
    expect(parseReceivedEvent(JSON.stringify({ type: "email.received", data: {} }))).toBeNull();
    expect(parseReceivedEvent("null")).toBeNull();
  });
});
