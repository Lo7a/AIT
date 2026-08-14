import { describe, expect, it } from "vitest";
import {
  makeStateHandler, makeStartHandler, makeMessageHandler, makeFinishHandler,
} from "../src/server/api/interview-handlers";

const snapshot = {
  status: "interviewing", messages: [], askedCount: 0, maxQuestions: 12,
  completenessPct: 30, credits: {}, nextQuestion: { key: "k", section: "lead_flow", text: "שאלה" }, recommendFreeText: false,
};

function post(body: unknown): Request {
  return new Request("http://t/api/interview/d1/message", { method: "POST", body: JSON.stringify(body) });
}

describe("makeStateHandler", () => {
  it("מחזיר snapshot", async () => {
    const h = makeStateHandler(async () => snapshot as never);
    const res = await h(new Request("http://t"), "d1");
    expect(res.status).toBe(200);
    expect((await res.json()).completenessPct).toBe(30);
  });

  it("שגיאת לא-נמצא - 404 עם ההודעה", async () => {
    const h = makeStateHandler(async () => { throw new Error("האבחון לא נמצא או שאין לו סריקה"); });
    const res = await h(new Request("http://t"), "אין");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("לא נמצא");
  });
});

describe("makeMessageHandler", () => {
  it("תור תקין - 200 עם התוצאה", async () => {
    const h = makeMessageHandler(async () => ({
      reply: "רשמתי", usedFallback: false, nextQuestion: null, completenessPct: 40, askedCount: 1, credits: {}, done: true,
    }));
    const res = await h(post({ content: "תשובה", isFreeText: true }), "d1");
    expect(res.status).toBe(200);
    expect((await res.json()).done).toBe(true);
  });

  it("גוף לא תקין - 400 בלי להריץ", async () => {
    let ran = false;
    const h = makeMessageHandler(async () => { ran = true; return {} as never; });
    expect((await h(post({}), "d1")).status).toBe(400);
    expect((await h(post({ content: 5, isFreeText: true }), "d1")).status).toBe(400);
    expect((await h(post({ content: "א", isFreeText: "כן" }), "d1")).status).toBe(400);
    expect((await h(post({ content: "א", isFreeText: true, questionKey: 7 }), "d1")).status).toBe(400);
    expect((await h(new Request("http://t", { method: "POST", body: "לא json" }), "d1")).status).toBe(400);
    expect(ran).toBe(false);
  });

  it("שגיאה עברית מהאורקסטרטור - עוברת עם סטטוס נכון", async () => {
    const h = makeMessageHandler(async () => { throw new Error("הראיון לא פעיל, יש להתחיל אותו קודם"); });
    const res = await h(post({ content: "א", isFreeText: true }), "d1");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("הראיון לא פעיל");
  });

  it("שגיאה לא-עברית - 500 גנרית עברית בלי דליפת פרטים", async () => {
    const h = makeMessageHandler(async () => { throw new Error("ECONNRESET at pool"); });
    const res = await h(post({ content: "א", isFreeText: true }), "d1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("ECONNRESET");
    expect(body.error).toMatch(/[א-ת]/);
  });
});

describe("makeStartHandler / makeFinishHandler", () => {
  it("מסלול תקין - 200", async () => {
    const s = makeStartHandler(async () => snapshot as never);
    expect((await s(new Request("http://t", { method: "POST" }), "d1")).status).toBe(200);
    const f = makeFinishHandler(async () => {});
    expect((await f(new Request("http://t", { method: "POST" }), "d1")).status).toBe(200);
  });

  it("מעבר סטטוס לא חוקי או מרוץ - 409", async () => {
    const f = makeFinishHandler(async () => { throw new Error("מעבר סטטוס לא חוקי: created → report_ready"); });
    expect((await f(new Request("http://t", { method: "POST" }), "d1")).status).toBe(409);
    const s = makeStartHandler(async () => { throw new Error("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (report_ready → interviewing)"); });
    expect((await s(new Request("http://t", { method: "POST" }), "d1")).status).toBe(409);
  });
});
