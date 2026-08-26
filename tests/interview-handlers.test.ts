import { describe, expect, it } from "vitest";
import {
  makeStateHandler, makeStartHandler, makeMessageHandler, makeFinishHandler, MAX_CONTENT_CHARS,
} from "../src/server/api/interview-handlers";
import { InterviewError, NOT_ACTIVE_MESSAGE } from "../src/pipeline/interview/contract";

// כל המבחנים כאן אופליין לגמרי - ה-handlers מקבלים פונקציות מוזרקות (getState/start/turn/finish),
// בלי DB אמיתי. מאז משימה 3-12: קוד הסטטוס נגזר אך ורק מ-InterviewError.kind, לא מהיוריסטיקת
// regex-על-עברית הישנה - ראו interview-handlers.ts ו-src/pipeline/interview/contract.ts.

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

  it("InterviewError('not_found') - 404 עם ההודעה", async () => {
    const h = makeStateHandler(async () => { throw new InterviewError("האבחון לא נמצא או שאין לו סריקה", "not_found"); });
    const res = await h(new Request("http://t"), "אין");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("לא נמצא");
  });
});

describe("makeMessageHandler", () => {
  it("תור תקין - 200 עם התוצאה", async () => {
    const h = makeMessageHandler(async () => ({
      reply: "רשמתי", usedFallback: false, nextQuestion: null, completenessPct: 40, askedCount: 1, credits: {}, done: true, plan: [], ledger: [],
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

  it("גוף JSON התקני שהוא null - 400 עם JSON תקין {error}, לא 500 מ-HTML של קריסה לא-מטופלת", async () => {
    let ran = false;
    const h = makeMessageHandler(async () => { ran = true; return {} as never; });
    const res = await h(post(null), "d1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(ran).toBe(false);
  });

  it("תוכן רווחים בלבד - 400, לא מגיע ל-turn", async () => {
    let ran = false;
    const h = makeMessageHandler(async () => { ran = true; return {} as never; });
    const res = await h(post({ content: "   ", isFreeText: true }), "d1");
    expect(res.status).toBe(400);
    expect(ran).toBe(false);
  });

  it(`תוכן באורך MAX_CONTENT_CHARS (${MAX_CONTENT_CHARS}) עובר ולידציה; MAX_CONTENT_CHARS+1 נדחה לפני שום עבודה`, async () => {
    let seenContent: string | null = null;
    const h = makeMessageHandler(async (_id, input) => {
      seenContent = input.content;
      return { reply: "אוקיי", usedFallback: false, nextQuestion: null, completenessPct: 0, askedCount: 0, credits: {}, done: true, plan: [], ledger: [] };
    });
    const ok = "א".repeat(MAX_CONTENT_CHARS);
    const res1 = await h(post({ content: ok, isFreeText: true }), "d1");
    expect(res1.status).toBe(200);
    expect(seenContent).toBe(ok);

    const tooLong = "א".repeat(MAX_CONTENT_CHARS + 1);
    const res2 = await h(post({ content: tooLong, isFreeText: true }), "d1");
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toContain("ארוכה");
  });

  it("InterviewError('invalid') מהאורקסטרטור - 400 עם ההודעה המדויקת (לא רק 'מכיל')", async () => {
    const h = makeMessageHandler(async () => { throw new InterviewError(NOT_ACTIVE_MESSAGE, "invalid"); });
    const res = await h(post({ content: "א", isFreeText: true }), "d1");
    expect(res.status).toBe(400);
    // פין שוויון מדויק מול הקבוע ב-contract.ts (לא מחרוזת מוקלדת כאן) - תופס דריפט: אם השרת
    // ינסח מחדש את ההודעה בלי לעדכן את contract.ts, use-interview-chat.ts כבר לא יזהה "לא פעיל"
    expect((await res.json()).error).toBe(NOT_ACTIVE_MESSAGE);
  });

  it("שגיאה לא-InterviewError - 500 גנרי עברית בלי דליפת פרטים", async () => {
    const h = makeMessageHandler(async () => { throw new Error("ECONNRESET at pool"); });
    const res = await h(post({ content: "א", isFreeText: true }), "d1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("ECONNRESET");
    expect(body.error).toMatch(/[א-ת]/);
  });

  it("שגיאת תשתית עם עברית בתוכן (למשל נתוני עסק בהודעת Prisma) - עדיין 500 גנרי, לא 400 עם ההודעה הגולמית", async () => {
    const h = makeMessageHandler(async () => { throw new Error('Unique constraint failed on business "עסק בעמ"'); });
    const res = await h(post({ content: "א", isFreeText: true }), "d1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("עסק בעמ");
    expect(body.error).not.toContain("Unique constraint");
    expect(body.error).toMatch(/[א-ת]/); // עדיין עברית - זו ההודעה הגנרית שלנו, לא תרגום של השגיאה
  });
});

describe("makeStartHandler / makeFinishHandler", () => {
  it("מסלול תקין - 200", async () => {
    const s = makeStartHandler(async () => snapshot as never);
    expect((await s(new Request("http://t", { method: "POST" }), "d1")).status).toBe(200);
    const f = makeFinishHandler(async () => {});
    expect((await f(new Request("http://t", { method: "POST" }), "d1")).status).toBe(200);
  });

  it("InterviewError('conflict') - 409", async () => {
    const f = makeFinishHandler(async () => {
      throw new InterviewError("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (interviewing -> report_ready)", "conflict");
    });
    expect((await f(new Request("http://t", { method: "POST" }), "d1")).status).toBe(409);
    const s = makeStartHandler(async () => {
      throw new InterviewError("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (report_ready -> interviewing)", "conflict");
    });
    expect((await s(new Request("http://t", { method: "POST" }), "d1")).status).toBe(409);
  });

  it("שגיאה לא-InterviewError (כולל מעבר לא-חוקי במכונת המצבים) - 500 גנרי, לא 409 מזויף", async () => {
    const f = makeFinishHandler(async () => { throw new Error("מעבר סטטוס לא חוקי: created -> report_ready"); });
    const res = await f(new Request("http://t", { method: "POST" }), "d1");
    expect(res.status).toBe(500);
  });
});
