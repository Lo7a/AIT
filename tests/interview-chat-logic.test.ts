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

  it("selectedOptions/customInputOpen מתחילים ריקים/סגורים", () => {
    const state = initialChatState(makeSnapshot());
    expect(state.selectedOptions).toEqual([]);
    expect(state.customInputOpen).toBe(false);
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

  it("content מפורש (שליחת צ'יפ) עוקף את state.input כתוכן ההודעה - וגם מנקה את התיבה, כמו שליחה רגילה", () => {
    const state = { ...initialChatState(makeSnapshot()), input: "טקסט שלא נשלח" };
    const next = chatReducer(state, { type: "send", content: "וואטסאפ" });
    expect(next.busy).toBe(true);
    expect(next.input).toBe(""); // אותה התנהגות ניקוי כמו שליחה רגילה - לא ה-content שנבחר בתיבה
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ role: "user", content: "וואטסאפ" });
  });

  it("content ריק (רווחים בלבד) הוא no-op גם כשמגיע כ-content מפורש", () => {
    const state = initialChatState(makeSnapshot());
    expect(chatReducer(state, { type: "send", content: "   " })).toBe(state);
  });

  it("שליחה (עם או בלי content) מאפסת selectedOptions/customInputOpen - יוצאים מהקשר השאלה שנענתה", () => {
    const state = {
      ...initialChatState(makeSnapshot()), input: "תשובה", selectedOptions: ["א", "ב"], customInputOpen: true,
    };
    const next = chatReducer(state, { type: "send" });
    expect(next.selectedOptions).toEqual([]);
    expect(next.customInputOpen).toBe(false);
  });
});

describe("chatReducer - toggleOption (צ'יפים בבחירה מרובה)", () => {
  it("מוסיף תווית שטרם נבחרה", () => {
    const state = initialChatState(makeSnapshot());
    const next = chatReducer(state, { type: "toggleOption", label: "וואטסאפ" });
    expect(next.selectedOptions).toEqual(["וואטסאפ"]);
  });

  it("לחיצה שנייה על אותה תווית מסירה אותה (toggle)", () => {
    const withOne = chatReducer(initialChatState(makeSnapshot()), { type: "toggleOption", label: "וואטסאפ" });
    const withTwo = chatReducer(withOne, { type: "toggleOption", label: "טלפון" });
    expect(withTwo.selectedOptions).toEqual(["וואטסאפ", "טלפון"]);
    const removedFirst = chatReducer(withTwo, { type: "toggleOption", label: "וואטסאפ" });
    expect(removedFirst.selectedOptions).toEqual(["טלפון"]);
  });

  it("נעול בזמן busy - no-op, אותו state בדיוק", () => {
    const state = { ...initialChatState(makeSnapshot()), busy: true };
    expect(chatReducer(state, { type: "toggleOption", label: "וואטסאפ" })).toBe(state);
  });
});

describe("chatReducer - openCustomInput (\"אחר\")", () => {
  it("חושף את תיבת הטקסט (customInputOpen=true) בלי לגעת ב-freeText הגלובלי", () => {
    const state = initialChatState(makeSnapshot({ nextQuestion: Q1, recommendFreeText: false }));
    expect(state.freeText).toBe(false);
    const next = chatReducer(state, { type: "openCustomInput" });
    expect(next.customInputOpen).toBe(true);
    expect(next.freeText).toBe(false); // "אחר" הוא לא מעבר למצב חופשי גלובלי - עדיין אותה שאלה מונחית
  });

  it("נעול בזמן busy - no-op, אותו state בדיוק", () => {
    const state = { ...initialChatState(makeSnapshot()), busy: true };
    expect(chatReducer(state, { type: "openCustomInput" })).toBe(state);
  });
});

describe("chatReducer - איפוס מצב צ'יפים במעברי הקשר", () => {
  it("turnOk מאפס selectedOptions/customInputOpen - השאלה הבאה מתחילה נקייה", () => {
    const withChips = {
      ...initialChatState(makeSnapshot()), input: "תשובה", selectedOptions: ["א"], customInputOpen: true,
    };
    const sent = chatReducer(withChips, { type: "send" });
    const turn: TurnResult = {
      reply: "טוב", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.selectedOptions).toEqual([]);
    expect(next.customInputOpen).toBe(false);
  });

  it("snapshot מאפס selectedOptions/customInputOpen", () => {
    const withChips = { ...initialChatState(makeSnapshot()), selectedOptions: ["א", "ב"], customInputOpen: true };
    const next = chatReducer(withChips, { type: "snapshot", payload: makeSnapshot() });
    expect(next.selectedOptions).toEqual([]);
    expect(next.customInputOpen).toBe(false);
  });

  it("skip מאפס selectedOptions/customInputOpen", () => {
    const withChips = {
      ...initialChatState(makeSnapshot({ nextQuestion: Q1 })), selectedOptions: ["א"], customInputOpen: true,
    };
    const next = chatReducer(withChips, { type: "skip" });
    expect(next.selectedOptions).toEqual([]);
    expect(next.customInputOpen).toBe(false);
  });

  it("setFreeText (שני הכיוונים) מאפס selectedOptions/customInputOpen", () => {
    const withChips = {
      ...initialChatState(makeSnapshot({ nextQuestion: Q1 })), selectedOptions: ["א"], customInputOpen: true,
    };
    const toFree = chatReducer(withChips, { type: "setFreeText", value: true });
    expect(toFree.selectedOptions).toEqual([]);
    expect(toFree.customInputOpen).toBe(false);

    const withChips2 = { ...toFree, selectedOptions: ["ב"], customInputOpen: true };
    const backToGuided = chatReducer(withChips2, { type: "setFreeText", value: false });
    expect(backToGuided.selectedOptions).toEqual([]);
    expect(backToGuided.customInputOpen).toBe(false);
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

  it("usedFallback=true עדיין מציג את התשובה כמו שהיא (מוצג verbatim), ו-nextQuestion=null -> freeText=true", () => {
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
    expect(next.freeText).toBe(true);
  });

  it("מצב מונחה חוזר אוטומטית כשמגיעה שאלה חדשה לא-דולגה, גם אם freeText היה true קודם (בלי כוונה דביקה)", () => {
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

  it("turnOk לא מתעלם מ-skippedKeys: nextQuestion שכבר דולגה => freeText=true", () => {
    const withSkip = { ...initialChatState(makeSnapshot()), skippedKeys: [Q2.key], input: "תשובה" };
    const sent = chatReducer(withSkip, { type: "send" });
    const turn: TurnResult = {
      reply: "עוד תודה", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.freeText).toBe(true);
  });
});

describe("chatReducer - setFreeText וכוונה דביקה (freeTextIntent)", () => {
  it("setFreeText(true) נועל כוונה - turnOk עם שאלה חדשה לא-דולגה נשאר בחופשי", () => {
    let state = initialChatState(makeSnapshot({ nextQuestion: Q1 }));
    state = chatReducer(state, { type: "setFreeText", value: true });
    expect(state.freeText).toBe(true);
    expect(state.freeTextIntent).toBe(true);

    const sent = chatReducer({ ...state, input: "תשובה" }, { type: "send" });
    const turn: TurnResult = {
      reply: "טוב", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.freeText).toBe(true);
  });

  it("אחרי setFreeText(false) (\"חזרה לשאלות\") - turnOk עם שאלה חדשה חוזר למונחה", () => {
    let state = initialChatState(makeSnapshot({ nextQuestion: Q1 }));
    state = chatReducer(state, { type: "setFreeText", value: true });
    state = chatReducer(state, { type: "setFreeText", value: false });
    expect(state.freeText).toBe(false);
    expect(state.freeTextIntent).toBe(false);

    const sent = chatReducer({ ...state, input: "תשובה" }, { type: "send" });
    const turn: TurnResult = {
      reply: "טוב", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.freeText).toBe(false);
  });

  it("חופשי-בכפייה מדילוג לא נועל כוונה מפורשת - turnOk עם שאלה חדשה לא-דולגה חוזר למונחה", () => {
    const skipped = chatReducer(initialChatState(makeSnapshot({ nextQuestion: Q1 })), { type: "skip" });
    expect(skipped.freeText).toBe(true);
    expect(skipped.freeTextIntent).toBe(false); // תוצאה של דילוג, לא בחירה מפורשת של המשתמש

    const sent = chatReducer({ ...skipped, input: "תשובה" }, { type: "send" });
    const turn: TurnResult = {
      reply: "טוב", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false,
    };
    const next = chatReducer(sent, { type: "turnOk", payload: turn });
    expect(next.freeText).toBe(false);
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

  it("recommendFreeText=true בשאלה גלויה ולא-דולגה => freeText=true (נתיב start, לא רק resume)", () => {
    const state = initialChatState(makeSnapshot({ nextQuestion: Q1, recommendFreeText: false }));
    expect(state.freeText).toBe(false);
    const next = chatReducer(state, {
      type: "snapshot",
      payload: makeSnapshot({ nextQuestion: Q1, recommendFreeText: true }),
    });
    expect(next.freeText).toBe(true);
  });

  it("freeTextIntent דביק נשמר גם דרך snapshot - לא נמחק ברענון", () => {
    const intentOn = chatReducer(initialChatState(makeSnapshot({ nextQuestion: Q1 })), {
      type: "setFreeText", value: true,
    });
    expect(intentOn.freeTextIntent).toBe(true);

    const next = chatReducer(intentOn, {
      type: "snapshot",
      payload: makeSnapshot({ nextQuestion: Q2, recommendFreeText: false }),
    });
    expect(next.freeText).toBe(true);
  });

  it("keepError=true משמר שגיאה קיימת (למשל הודעת \"הראיון כבר נסגר\"); בלי הדגל - מנקה", () => {
    const sent = chatReducer({ ...initialChatState(makeSnapshot()), input: "משהו" }, { type: "send" });
    const failed = chatReducer(sent, { type: "turnFail", error: "הראיון כבר נסגר. לחיצה על סיום הראיון תעביר לדוח המעודכן." });
    expect(failed.error).not.toBeNull();

    const kept = chatReducer(failed, { type: "snapshot", payload: makeSnapshot(), keepError: true });
    expect(kept.error).toBe(failed.error);

    const cleared = chatReducer(failed, { type: "snapshot", payload: makeSnapshot() });
    expect(cleared.error).toBeNull();
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

// closed נגזר מסטטוס אמיתי מהשרת (משימה 3-12) - בלי זה שני טאבים פתוחים על אותו ראיון: טאב
// שמסיים את הראיון לא "מדליף" את זה לטאב השני, שממשיך להציג תיבת קלט פעילה על ראיון שכבר נסגר
describe("chatReducer - closed נגזר מ-snapshot.status", () => {
  it("snapshot עם status=report_ready => closed=true", () => {
    const state = initialChatState(makeSnapshot({ status: "interviewing" }));
    expect(state.closed).toBe(false);
    const next = chatReducer(state, { type: "snapshot", payload: makeSnapshot({ status: "report_ready" }) });
    expect(next.closed).toBe(true);
  });

  it("snapshot עם status=interviewing => closed=false (גם אם היה true קודם)", () => {
    const state = { ...initialChatState(makeSnapshot()), closed: true };
    const next = chatReducer(state, { type: "snapshot", payload: makeSnapshot({ status: "interviewing" }) });
    expect(next.closed).toBe(false);
  });

  it("startFail => closed=true (start נכשל = הראיון אף פעם לא הפך לפעיל, שליחה מובטחת להיכשל)", () => {
    const state = initialChatState(makeSnapshot());
    expect(state.closed).toBe(false);
    const next = chatReducer(state, { type: "startFail", error: "שגיאה כלשהי" });
    expect(next.closed).toBe(true);
    expect(next.starting).toBe(false);
  });
});
