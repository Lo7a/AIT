import { describe, expect, it } from "vitest";
import {
  INITIAL_LOGIN_STATE, isValidEmail, linkErrorMessage, loginReducer, type LoginState,
} from "../src/app/login/login-logic";

// ה-reducer הטהור של מסך הכניסה (login-logic.ts) - כל המעברים אופליין, בלי React ובלי Supabase

const editing = (email: string): LoginState => loginReducer(INITIAL_LOGIN_STATE, { type: "edit", email });

describe("isValidEmail", () => {
  it("מקבל כתובת סבירה ודוחה קשקוש", () => {
    expect(isValidEmail("owner@example.com")).toBe(true);
    expect(isValidEmail("  owner@example.com  ")).toBe(true);
    expect(isValidEmail("owner")).toBe(false);
    expect(isValidEmail("owner@")).toBe(false);
    expect(isValidEmail("owner@host")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("loginReducer", () => {
  it("שליחה עם אימייל תקין עוברת ל-sending ואז ל-sent", () => {
    const sending = loginReducer(editing("owner@example.com"), { type: "submit" });
    expect(sending.phase).toBe("sending");
    expect(sending.error).toBeNull();
    const sent = loginReducer(sending, { type: "sent" });
    expect(sent.phase).toBe("sent");
  });

  it("שליחה עם אימייל פסול נשארת idle עם שגיאה בעברית", () => {
    const state = loginReducer(editing("לא אימייל"), { type: "submit" });
    expect(state.phase).toBe("idle");
    expect(state.error).toContain("אימייל");
  });

  it("עריכה מנקה שגיאה קודמת; בזמן שליחה עריכה ושליחה כפולה נבלעות", () => {
    const withError = loginReducer(editing("bad"), { type: "submit" });
    expect(loginReducer(withError, { type: "edit", email: "fix@example.com" }).error).toBeNull();
    const sending = loginReducer(editing("owner@example.com"), { type: "submit" });
    expect(loginReducer(sending, { type: "edit", email: "other@example.com" })).toBe(sending);
    expect(loginReducer(sending, { type: "submit" })).toBe(sending);
  });

  it("כשל שליחה חוזר ל-idle עם ההודעה; reset ממצב sent חוזר לטופס עם אותו אימייל", () => {
    const sending = loginReducer(editing("owner@example.com"), { type: "submit" });
    const failed = loginReducer(sending, { type: "failed", message: "נכשל" });
    expect(failed.phase).toBe("idle");
    expect(failed.error).toBe("נכשל");
    const sent = loginReducer(sending, { type: "sent" });
    const back = loginReducer(sent, { type: "reset" });
    expect(back.phase).toBe("idle");
    expect(back.email).toBe("owner@example.com");
    expect(back.error).toBeNull();
  });

  it("sent מתקבל רק מתוך sending - אירוע תועה לא משנה מצב", () => {
    expect(loginReducer(INITIAL_LOGIN_STATE, { type: "sent" })).toBe(INITIAL_LOGIN_STATE);
  });
});

describe("linkErrorMessage", () => {
  it("error=link מתורגם להודעה; כל השאר null", () => {
    expect(linkErrorMessage("link")).toContain("קישור");
    expect(linkErrorMessage("other")).toBeNull();
    expect(linkErrorMessage(null)).toBeNull();
  });
});
