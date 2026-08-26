import { describe, expect, it } from "vitest";
import {
  chatReducer, initialChatState, visibleNext, sectionProgress, answerFor, type NextQuestion,
} from "../src/app/interview/chat-logic";
import { INTERVIEW_SECTIONS } from "../src/pipeline/interview/questions";
import type { InterviewSnapshot, TurnResult, PlanItem } from "../src/server/run-interview";

// כל המבחנים כאן אופליין לגמרי - אין fetch, אין React, אין DB. chat-logic.ts טהור בכוונה
// (ראו הערת המודול שם) כדי שאפשר יהיה לבדוק את כל מכונת המצבים של הראיון בלי תשתית כבדה.

const Q1: NextQuestion = { key: "lead_flow_intake", label: "איך מגיעות פניות", section: "lead_flow", text: "איך מגיעות אליכם פניות חדשות?" };
const Q2: NextQuestion = { key: "service_repeat", label: "שאלות חוזרות", section: "service", text: "אילו שאלות חוזרות אתם עונים עליהן?" };

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
    plan: [], ledger: [],
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

  it("היסטוריית resume מתורגמת ל-ChatMessage בלי createdAt (questionKey כן נשמר - חזרה לשאלה נשענת עליו)", () => {
    const state = initialChatState(makeSnapshot({
      messages: [
        { id: "m1", role: "user", content: "שלום", questionKey: Q1.key, isFreeText: false, createdAt: new Date() },
        { id: "m2", role: "assistant", content: "תודה", questionKey: null, isFreeText: false, createdAt: new Date() },
      ],
    }));
    expect(state.messages).toEqual([
      { id: "m1", role: "user", content: "שלום", questionKey: Q1.key },
      { id: "m2", role: "assistant", content: "תודה", questionKey: null },
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
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
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
      plan: [], ledger: [],
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
      plan: [], ledger: [],
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
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
    };
    expect(chatReducer(sent, { type: "turnOk", payload: turn }).freeText).toBe(false);
  });

  it("turnOk לא מתעלם מ-skippedKeys: nextQuestion שכבר דולגה => freeText=true", () => {
    const withSkip = { ...initialChatState(makeSnapshot()), skippedKeys: [Q2.key], input: "תשובה" };
    const sent = chatReducer(withSkip, { type: "send" });
    const turn: TurnResult = {
      reply: "עוד תודה", usedFallback: false, nextQuestion: Q2, completenessPct: 25,
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
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
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
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
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
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
      credits: emptyCredits(), askedCount: 1, done: false, plan: [], ledger: [],
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
      { id: "srv1", role: "user", content: "משהו", questionKey: Q1.key },
      { id: "srv2", role: "assistant", content: "תודה", questionKey: null },
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

// ===== חזרה לשאלה שנענתה (הכרעת אלעד 26.8) =====
// הרשימה הממוספרת מאפשרת ללחוץ על שאלה שכבר נענתה ולשנות את התשובה. קדימה אי אפשר לקפוץ -
// זו הכרעה מוצרית, והשומר שלה יושב כאן ב-reducer ולא רק ב-disabled של הכפתור בתצוגה.
const PLAN: PlanItem[] = [
  {
    key: "lead_flow_intake", label: "איך מגיעות פניות", section: "lead_flow",
    text: "איך מגיעות אליכם פניות חדשות?",
    options: ["בעיקר טלפון", "וואטסאפ", "טופס באתר"], multiSelect: true, answered: true,
  },
  {
    key: "service_repeat", label: "שאלות חוזרות", section: "service",
    text: "אילו שאלות חוזרות אתם עונים עליהן?",
    options: ["מחיר ותנאים", "זמינות ותורים"], answered: false,
  },
];

function answeredState() {
  return initialChatState(makeSnapshot({
    plan: PLAN,
    nextQuestion: PLAN[1],
    messages: [
      {
        id: "m1", role: "user", content: "בעיקר טלפון, וואטסאפ",
        questionKey: "lead_flow_intake", isFreeText: false, createdAt: new Date(),
      },
      { id: "m2", role: "assistant", content: "רשמתי.", questionKey: null, isFreeText: false, createdAt: new Date() },
    ],
  }));
}

describe("answerFor", () => {
  it("מחזיר את התשובה האחרונה לאותה שאלה, לא את הראשונה", () => {
    const messages = [
      { id: "a", role: "user" as const, content: "עד 10", questionKey: "lead_flow_volume" },
      { id: "b", role: "user" as const, content: "10-30", questionKey: "lead_flow_volume" },
    ];
    expect(answerFor(messages, "lead_flow_volume")).toBe("10-30");
  });

  it("null כשאין תשובה לשאלה, וכשאין שאלה בכלל", () => {
    expect(answerFor([{ id: "a", role: "user", content: "משהו", questionKey: null }], "lead_flow_volume")).toBeNull();
    expect(answerFor([], null)).toBeNull();
  });
});

describe("chatReducer - חזרה לשאלה שנענתה", () => {
  it("פותחת את השאלה ומסמנת את התשובה הקודמת", () => {
    const next = chatReducer(answeredState(), { type: "revisit", key: "lead_flow_intake" });
    expect(next.revisitKey).toBe("lead_flow_intake");
    expect(next.selectedOptions).toEqual(["בעיקר טלפון", "וואטסאפ"]);
    expect(next.freeText).toBe(false);
  });

  // הכלל המוצרי: קדימה קופצים רק בתשובה או בדילוג, אף פעם לא מהרשימה
  it("שאלה שטרם נענתה - no-op, אי אפשר לקפוץ קדימה", () => {
    const state = answeredState();
    expect(chatReducer(state, { type: "revisit", key: "service_repeat" })).toBe(state);
  });

  it("מפתח שאינו בתוכנית - no-op", () => {
    const state = answeredState();
    expect(chatReducer(state, { type: "revisit", key: "not_in_plan" })).toBe(state);
  });

  it("בזמן תור באוויר - no-op, כמו כל שאר הפעולות", () => {
    const busy = { ...answeredState(), busy: true };
    expect(chatReducer(busy, { type: "revisit", key: "lead_flow_intake" })).toBe(busy);
  });

  // בלי השומר הזה דילוג בזמן עריכה היה מסמן את השאלה הנוכחית - זו שלא מוצגת כרגע
  it("דילוג בזמן עריכה - no-op", () => {
    const editing = chatReducer(answeredState(), { type: "revisit", key: "lead_flow_intake" });
    expect(chatReducer(editing, { type: "skip" })).toBe(editing);
  });

  it("כתיבה חופשית שהמשתמש בחר בה חוזרת אחרי ביטול העריכה", () => {
    const free = chatReducer(answeredState(), { type: "setFreeText", value: true });
    const editing = chatReducer(free, { type: "revisit", key: "lead_flow_intake" });
    expect(editing.freeText).toBe(false);
    expect(editing.freeTextIntent).toBe(true); // הכוונה נשמרה, רק המצב המוצג השתנה
    const back = chatReducer(editing, { type: "cancelRevisit" });
    expect(back.revisitKey).toBeNull();
    expect(back.freeText).toBe(true);
  });

  it("תשובה שנשלחה סוגרת את העריכה מעצמה", () => {
    const editing = chatReducer(answeredState(), { type: "revisit", key: "lead_flow_intake" });
    const turn: TurnResult = {
      reply: "רשמתי", usedFallback: false, nextQuestion: PLAN[1], completenessPct: 30,
      credits: emptyCredits(), askedCount: 2, done: false, plan: PLAN, ledger: [],
    };
    expect(chatReducer(editing, { type: "turnOk", payload: turn }).revisitKey).toBeNull();
  });

  it("snapshot טרי מהשרת גובר על עריכה פתוחה", () => {
    const editing = chatReducer(answeredState(), { type: "revisit", key: "lead_flow_intake" });
    expect(chatReducer(editing, { type: "snapshot", payload: makeSnapshot({ plan: PLAN }) }).revisitKey).toBeNull();
  });

  it("ההודעה האופטימית נושאת את מפתח השאלה, כדי שהתשובה תימצא מיד גם לפני רענון", () => {
    const sent = chatReducer(answeredState(), { type: "send", content: "טופס באתר", questionKey: "lead_flow_intake" });
    expect(answerFor(sent.messages, "lead_flow_intake")).toBe("טופס באתר");
  });
});
