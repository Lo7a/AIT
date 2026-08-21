import { describe, expect, it } from "vitest";
import {
  AGENT_NAMES, MAX_BODY_CHARS, isAgentName, isAuthorName, requireAgentName,
  sanitizeChatText, makeAgentChatPostHandler,
} from "../src/server/agent-chat";
import type { SessionUser } from "../src/server/auth/session";

const admin: SessionUser = { id: "u1", authId: "a1", email: null, role: "admin" } as SessionUser;
const owner: SessionUser = { id: "u2", authId: "a2", email: null, role: "owner" } as SessionUser;

describe("שמות וזהות", () => {
  it("שני סוכנים בדיוק, ו-founder הוא מחבר אבל לא סוכן", () => {
    expect(AGENT_NAMES).toHaveLength(2);
    expect(isAgentName("founder")).toBe(false);
    expect(isAuthorName("founder")).toBe(true);
    expect(isAgentName("lahav-claude")).toBe(true);
    expect(isAgentName("מישהו")).toBe(false);
  });

  it("requireAgentName: ערך חוקי עובר, חסר או שגוי זורק עם הדרכה", () => {
    expect(requireAgentName({ AIT_AGENT_NAME: "elad-claude" })).toBe("elad-claude");
    expect(() => requireAgentName({})).toThrow(/AIT_AGENT_NAME/);
    expect(() => requireAgentName({ AIT_AGENT_NAME: "claude" })).toThrow(/AIT_AGENT_NAME/);
  });
});

describe("sanitizeChatText - הודעה לערוץ עוברת את אותם כללי תווים כמו כל טקסט במערכת", () => {
  // התווים הבעייתיים נבנים ב-fromCharCode בכוונה: ליטרל שלהם בקובץ היה נופל בעצמו
  // בסריקת התווים האסורים של הריפו
  const ESC = String.fromCharCode(27);
  const RLO = String.fromCharCode(0x202e);
  const RLM = String.fromCharCode(0x200f);
  const EN_DASH = String.fromCharCode(0x2013);
  const LF = String.fromCharCode(10);

  it("תו בקרה (ESC של ANSI) נמחק - ה-CLI מדפיס לטרמינל של הסוכן השני", () => {
    expect(sanitizeChatText("שלום" + ESC + "עולם")).toBe("שלוםעולם");
  });

  it("תווי כיווניות נמחקים (Trojan Source)", () => {
    expect(sanitizeChatText("א" + RLO + "ב" + RLM + "ג")).toBe("אבג");
  });

  it("שורות חדשות שורדות - הודעה מרובת שורות לגיטימית", () => {
    expect(sanitizeChatText("שורה 1" + LF + "שורה 2")).toBe("שורה 1" + LF + "שורה 2");
  });

  it("מקף ארוך הופך לרגיל", () => {
    expect(sanitizeChatText("לפני " + EN_DASH + " אחרי")).toBe("לפני - אחרי");
  });
});

describe("makeAgentChatPostHandler", () => {
  const form = (body: string, thread?: string) => {
    const f = new FormData();
    f.set("body", body);
    if (thread != null) f.set("thread", thread);
    return f;
  };

  const collect = () => {
    const calls = { sent: [] as unknown[], events: [] as unknown[] };
    const deps = {
      getRealUser: async () => admin,
      send: async (author: string, body: string, thread: string) => {
        calls.sent.push({ author, body, thread });
        return { id: "m1" };
      },
      emit: async (input: unknown) => { calls.events.push(input); },
    };
    return { calls, deps };
  };

  it("אדמין שולח - נכתב כ-founder, והחשבון ששלח נרשם ביומן עם מזהה ההודעה", async () => {
    const { calls, deps } = collect();
    const res = await makeAgentChatPostHandler(deps)(form("סיימתי את התובלה", "brief"));
    expect(res).toEqual({ kind: "ok" });
    expect(calls.sent).toEqual([{ author: "founder", body: "סיימתי את התובלה", thread: "brief" }]);
    // זה מה שמצדיק את המחבר האנונימי: בלי האירוע אין שום דרך לדעת איזה מייסד שלח
    expect(calls.events).toEqual([
      { type: "agent_message_sent", userId: "u1", metadata: { messageId: "m1", thread: "brief" } },
    ]);
  });

  it("בלי thread - נופל ל-general", async () => {
    const { calls, deps } = collect();
    await makeAgentChatPostHandler(deps)(form("שלום"));
    expect((calls.sent[0] as { thread: string }).thread).toBe("general");
  });

  it("לא מחובר - 401, לא אדמין - 404 (לא 403, אין מה להסגיר)", async () => {
    const { deps } = collect();
    const anon = makeAgentChatPostHandler({ ...deps, getRealUser: async () => null });
    expect(await anon(form("x"))).toEqual({ kind: "error", status: 401, message: "נדרשת התחברות" });
    const notAdmin = makeAgentChatPostHandler({ ...deps, getRealUser: async () => owner });
    expect(await notAdmin(form("x"))).toEqual({ kind: "error", status: 404, message: "לא נמצא" });
  });

  it("גוף ריק או ארוך מדי - 400, בלי שליחה ובלי אירוע", async () => {
    const { calls, deps } = collect();
    const handler = makeAgentChatPostHandler(deps);
    expect((await handler(form("   "))).kind).toBe("error");
    expect((await handler(form("א".repeat(MAX_BODY_CHARS + 1)))).kind).toBe("error");
    expect(calls.sent).toHaveLength(0);
    expect(calls.events).toHaveLength(0);
  });
});
