import { describe, expect, it } from "vitest";
import {
  chatReducer, initialChatState, visibleNext, sectionProgress, type NextQuestion,
} from "../src/app/interview/chat-logic";
import { INTERVIEW_SECTIONS } from "../src/pipeline/interview/questions";
import type { InterviewSnapshot, TurnResult } from "../src/server/run-interview";

// כל המבחנים כאן אופליין לגמרי - אין fetch, אין React, אין DB. chat-logic.ts טהור בכוונה
// (ראו הערת המודול שם) כדי שאפשר יהיה לבדוק את כל מכונת המצבים של הראיון בלי תשתית כבדה.

const Q1: NextQuestion = { key: "lead_flow_intake", section: "lead_flow", text: "איך מגיעות אליכם פניות חדשות?" };
const Q2: NextQuestion = { key: "service_repeat", section: "service", text: "אילו שאלות חוזרות אתם עונים עליהן?" };

function emptyCredits(overrides: Record<string, number> = {}): Record<string, number> {
  const base: Record<string, number> = { pains: 0 };
  for (const s of INTERVIEW_SECTIONS) base[s.key] = 0;
  return { ...base, ...overrides };
}

function makeSnapshot(overrides: Partial<InterviewSnapshot> = {}): InterviewSnapshot {
  return {
    status: "interviewing",
    messages: [],
    askedCount: 0,
    maxQuestions: 12,
    completenessPct: 10,
    credits: emptyCredits(),
    nextQuestion: Q1,
    recommendFreeText: false,
    ...overrides,
  };
}

describe("visibleNext", () => {
  it("מחזיר null כשאין שאלה הבאה בכלל", () => {
    expect(visibleNext(null, [])).toBeNull();
  });

  it("מעביר שאלה שלא דולגה כמו שהיא", () => {
    expect(visibleNext(Q1, [])).toEqual(Q1);
    expect(visibleNext(Q1, ["other_key"])).toEqual(Q1);
  });

  it("מסתיר שאלה שהמפתח שלה נמצא ב-skippedKeys", () => {
    expect(visibleNext(Q1, [Q1.key])).toBeNull();
  });
});

describe("initialChatState - גזירת מצב חופשי/מונחה התחלתי", () => {
  it("recommendFreeText=true -> מצב חופשי גם כשיש שאלה מונחה זמינה", () => {
    const state = initialChatState(makeSnapshot({ recommendFreeText: true, nextQuestion: Q1 }));
    expect(state.freeText).toBe(true);
  });

  it("nextQuestion=null -> מצב חופשי גם כש-recommendFreeText כבוי", () => {
    const state = initialChatState(makeSnapshot({ recommendFreeText: false, nextQuestion: null }));
    expect(state.freeText).toBe(true);
  });

  it("אחרת - מצב מונחה", () => {
    const state = initialChatState(makeSnapshot({ recommendFreeText: false, nextQuestion: Q1 }));
    expect(state.freeText).toBe(false);
  });

  it("starting=true כשהסטטוס ההתחלתי אינו interviewing (עדיין צריך POST start)", () => {
    expect(initialChatState(makeSnapshot({ status: "report_ready" })).starting).toBe(true);
  });

  it("starting=false כשכבר interviewing - נתיב resume, אין צורך ב-start", () => {
    expect(initialChatState(makeSnapshot({ status: "interviewing" })).starting).toBe(false);
  });

  it("היסטוריית resume מתורגמת ל-ChatMessage בלי createdAt/questionKey", () => {
    const state = initialChatState(makeSnapshot({
      messages: [
        { id: "m1", role: "user", content: "שלום", questionKey: Q1.key, isFreeText: false, createdAt: new Date() },
        { id: "m2", role: "assistant", content: "תודה", questionKey: null, isFreeText: false, createdAt: new Date() },
      ],
    }));
    expect(state.messages).toEqual([
      { id: "m1", role: "user", content: "שלום" },
      { id: "m2", role: "assistant", content: "תודה" },
    ]);
  });
});

describe("chatReducer - send", () => {
  it("שליחה בזמן busy היא no-op - אותו state בדיוק", () => {
    const state = { ...initialChatState(makeSnapshot()), busy: true, input: "תשובה" };
    expect(chatReducer(state, { type: "send" })).toBe(state);
  });

  it("שליחה עם קלט ריק (כולל רווחים בלבד) היא no-op", () => {
    const state = { ...initialChatState(makeSnapshot()), input: "   " };
    expect(chatReducer(state, { type: "send" })).toBe(state);
  });

  it("הוספה אופטימית של הודעת משתמש + ניקוי קלט + busy=true", () => {
    const state = { ...initialChatState(makeSnapshot()), input: "  יש לנו הרבה פניות בטלפון  " };
    const next = chatReducer(state, { type: "send" });
    expect(next.busy).toBe(true);
    expect(next.input).toBe("");
    expect(next.error).toBeNull();
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ role: "user", content: "יש לנו הרבה פניות בטלפון" });
  });
});

describe("chatReducer - turnOk", () => {
  it("מוסיף תשובת assistant ומעדכן שלמות/קרדיטים/askedCount/שאלה הבאה", () => {
    const sent = chatReducer({ ...initialChatState(makeSnapshot()), input: "תשובה" }, { type: "send" });
    const turn: TurnResult = {
      reply: "תודה על התשובה",
      usedFallback: false,
      nextQuestion: Q2,
      completenessPct: 30,
      credits: emptyCredits({ lead_flow: 1 }),
      askedCount: 1,
      done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.busy).toBe(false);
    expect(next.error).toBeNull();
    expect(next.messages).toHaveLength(2);
    expect(next.messages[1]).toMatchObject({ role: "assistant", content: "תודה על התשובה" });
    expect(next.completenessPct).toBe(30);
    expect(next.credits.lead_flow).toBe(1);
    expect(next.askedCount).toBe(1);
    expect(next.next).toEqual(Q2);
  });

  it("usedFallback=true עדיין מציג את התשובה כמו שהיא (מוצג verbatim)", () => {
    const sent = chatReducer({ ...initialChatState(makeSnapshot()), input: "תשובה" }, { type: "send" });
    const turn: TurnResult = {
      reply: "תשובת ברירת מחדל בלי חילוץ",
      usedFallback: true,
      nextQuestion: null,
      completenessPct: 20,
      credits: emptyCredits(),
      askedCount: 1,
      done: true,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.messages[1].content).toBe("תשובת ברירת מחדל בלי חילוץ");
  });

  it("מצב מונחה חוזר אוטומטית כשמגיעה שאלה חדשה לא-דולגה, גם אם freeText היה true קודם", () => {
    const sent = chatReducer(
      { ...initialChatState(makeSnapshot()), freeText: true, input: "תשובה" },
      { type: "send" },
    );
    const turn: TurnResult = {
      reply: "טוב", usedFallback: false, nextQuestion: Q2, completenessPct: 30,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    expect(chatReducer(sent, { type: "turnOk", payload: turn }).freeText).toBe(false);
  });
});

describe("chatReducer - turnFail", () => {
  it("מסיר את ההודעה האופטימית ומשחזר את הטקסט המדויק לתיבת הקלט", () => {
    const original = "הטקסט המקורי שלי, בדיוק ככה";
    const sent = chatReducer({ ...initialChatState(makeSnapshot()), input: original }, { type: "send" });
    expect(sent.messages).toHaveLength(1);

    const failed = chatReducer(sent, { type: "turnFail", error: "שגיאה מהשרת" });
    expect(failed.messages).toHaveLength(0);
    expect(failed.input).toBe(original);
    expect(failed.busy).toBe(false);
    expect(failed.error).toBe("שגיאה מהשרת");
  });
});

describe("chatReducer - skip", () => {
  it("מוסיף את המפתח ל-skippedKeys ומסתיר את השאלה דרך visibleNext", () => {
    const state = initialChatState(makeSnapshot({ nextQuestion: Q1, recommendFreeText: false }));
    expect(state.freeText).toBe(false);
    const next = chatReducer(state, { type: "skip" });
    expect(next.skippedKeys).toEqual([Q1.key]);
    expect(visibleNext(next.next, next.skippedKeys)).toBeNull();
    expect(next.freeText).toBe(true);
  });

  it("דילוג כשאין שאלה גלויה כרגע - no-op, אותו state", () => {
    const state = initialChatState(makeSnapshot({ nextQuestion: null }));
    expect(chatReducer(state, { type: "skip" })).toBe(state);
  });
});

describe("chatReducer - snapshot (נתיב פישור 409 / רענון אחרי שגיאה)", () => {
  it("מחליף הודעות/התקדמות/שאלה הבאה במלואם - בלי לשכפל הודעות קיימות", () => {
    const sent = chatReducer({ ...initialChatState(makeSnapshot()), input: "משהו" }, { type: "send" });
    expect(sent.messages).toHaveLength(1);

    const serverSnapshot = makeSnapshot({
      messages: [
        { id: "srv1", role: "user", content: "משהו", questionKey: Q1.key, isFreeText: false, createdAt: new Date() },
        { id: "srv2", role: "assistant", content: "תודה", questionKey: null, isFreeText: false, createdAt: new Date() },
      ],
      completenessPct: 25,
      askedCount: 1,
      nextQuestion: Q2,
    });
    const next = chatReducer(sent, { type: "snapshot", payload: serverSnapshot });
    expect(next.messages).toEqual([
      { id: "srv1", role: "user", content: "משהו" },
      { id: "srv2", role: "assistant", content: "תודה" },
    ]);
    expect(next.completenessPct).toBe(25);
    expect(next.askedCount).toBe(1);
    expect(next.next).toEqual(Q2);
    expect(next.busy).toBe(false);
    expect(next.starting).toBe(false);
    expect(next.error).toBeNull();
  });

  it("לא מוחק skippedKeys קיימים - דילוג הוא מצב לקוח בלבד שהשרת לא יודע עליו", () => {
    const skipped = chatReducer(initialChatState(makeSnapshot({ nextQuestion: Q1 })), { type: "skip" });
    expect(skipped.skippedKeys).toEqual([Q1.key]);

    const next = chatReducer(skipped, { type: "snapshot", payload: makeSnapshot({ nextQuestion: Q1 }) });
    expect(next.skippedKeys).toEqual([Q1.key]);
    expect(visibleNext(next.next, next.skippedKeys)).toBeNull();
  });
});

describe("sectionProgress", () => {
  it("מכסה בדיוק את 9 הסקציות המרואיינות, באותו סדר של INTERVIEW_SECTIONS", () => {
    const progress = sectionProgress(emptyCredits());
    expect(progress).toHaveLength(9);
    expect(progress.map((p) => p.key)).toEqual(INTERVIEW_SECTIONS.map((s) => s.key));
    expect(progress.every((p) => p.state === "none")).toBe(true);
  });

  it("סף 1 -> full, 0.5 -> partial, 0 -> none", () => {
    const progress = sectionProgress(emptyCredits({ lead_flow: 1, service: 0.5, billing: 0 }));
    expect(progress.find((p) => p.key === "lead_flow")?.state).toBe("full");
    expect(progress.find((p) => p.key === "service")?.state).toBe("partial");
    expect(progress.find((p) => p.key === "billing")?.state).toBe("none");
  });
});
