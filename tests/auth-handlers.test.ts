import { describe, expect, it } from "vitest";
import {
  makeCallbackHandler, makeConfirmHandler, makeSignoutHandler, sanitizeNextPath,
} from "../src/server/api/auth-handlers";

// ראוטי ההתחברות (auth-handlers.ts): כל הניתוב, הולידציה והגנת ה-open-redirect - אופליין
// עם closures מזויפים, בלי Supabase

const ORIGIN = "https://ait.example";
const locationOf = (res: Response) => new URL(res.headers.get("location")!);

describe("sanitizeNextPath", () => {
  it("נתיב פנימי עובר כמו שהוא", () => {
    expect(sanitizeNextPath("/report/abc")).toBe("/report/abc");
  });
  it("כתובת מלאה, יחסית-פרוטוקול, ריק או חסר - נופלים לדף הבית", () => {
    expect(sanitizeNextPath("https://evil.example/")).toBe("/");
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(sanitizeNextPath("report/abc")).toBe("/");
    expect(sanitizeNextPath(null)).toBe("/");
  });
});

describe("makeConfirmHandler", () => {
  it("קישור תקין: מאמת, יוצר שורת מראה, ומפנה ל-next הפנימי", async () => {
    const calls: string[] = [];
    const handler = makeConfirmHandler(
      async (tokenHash) => { calls.push(`verify:${tokenHash}`); return true; },
      async () => { calls.push("ensure"); },
    );
    const res = await handler(new Request(`${ORIGIN}/auth/confirm?token_hash=th123&next=/report/abc`));
    expect(res.status).toBe(303);
    expect(locationOf(res).pathname).toBe("/report/abc");
    expect(calls).toEqual(["verify:th123", "ensure"]);
  });

  it("next חיצוני נחסם - מפנה לדף הבית", async () => {
    const handler = makeConfirmHandler(async () => true, async () => {});
    const res = await handler(new Request(`${ORIGIN}/auth/confirm?token_hash=th&next=//evil.example`));
    expect(locationOf(res).pathname).toBe("/");
    expect(locationOf(res).origin).toBe(ORIGIN);
  });

  it("בלי token_hash - חזרה למסך הכניסה עם שגיאת קישור, בלי לגעת באימות", async () => {
    let touched = false;
    const handler = makeConfirmHandler(async () => { touched = true; return true; }, async () => {});
    const res = await handler(new Request(`${ORIGIN}/auth/confirm`));
    const loc = locationOf(res);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("link");
    expect(touched).toBe(false);
  });

  it("אימות שנכשל (קישור פג/שומש) - חזרה למסך הכניסה עם שגיאה", async () => {
    const handler = makeConfirmHandler(async () => false, async () => {});
    const res = await handler(new Request(`${ORIGIN}/auth/confirm?token_hash=expired`));
    expect(locationOf(res).searchParams.get("error")).toBe("link");
  });

  it("כשל ביצירת שורת המראה לא חוסם את הכניסה - השכבה מרפאת את עצמה בבקשה הבאה", async () => {
    const handler = makeConfirmHandler(async () => true, async () => { throw new Error("db down"); });
    const res = await handler(new Request(`${ORIGIN}/auth/confirm?token_hash=th`));
    expect(res.status).toBe(303);
    expect(locationOf(res).pathname).toBe("/");
  });

  it("חריגה מהאימות עצמו - שגיאת קישור, לא 500", async () => {
    const handler = makeConfirmHandler(async () => { throw new Error("network"); }, async () => {});
    const res = await handler(new Request(`${ORIGIN}/auth/confirm?token_hash=th`));
    expect(locationOf(res).searchParams.get("error")).toBe("link");
  });
});

describe("makeCallbackHandler", () => {
  it("code תקין: מחליף לסשן, יוצר שורת מראה, ומפנה פנימה", async () => {
    const calls: string[] = [];
    const handler = makeCallbackHandler(
      async (code) => { calls.push(`exchange:${code}`); return true; },
      async () => { calls.push("ensure"); },
    );
    const res = await handler(new Request(`${ORIGIN}/auth/callback?code=c123`));
    expect(res.status).toBe(303);
    expect(locationOf(res).pathname).toBe("/");
    expect(calls).toEqual(["exchange:c123", "ensure"]);
  });

  it("בלי code או החלפה שנכשלה - חזרה למסך הכניסה עם שגיאה", async () => {
    const failing = makeCallbackHandler(async () => false, async () => {});
    expect(locationOf(await failing(new Request(`${ORIGIN}/auth/callback?code=bad`))).searchParams.get("error")).toBe("link");
    const missing = makeCallbackHandler(async () => true, async () => {});
    expect(locationOf(await missing(new Request(`${ORIGIN}/auth/callback`))).pathname).toBe("/login");
  });
});

describe("makeSignoutHandler", () => {
  it("מנתק ומפנה הביתה ב-303 (הדפדפן ממשיך ב-GET אחרי POST)", async () => {
    let signedOut = false;
    const handler = makeSignoutHandler(async () => { signedOut = true; });
    const res = await handler(new Request(`${ORIGIN}/auth/signout`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(locationOf(res).pathname).toBe("/");
    expect(signedOut).toBe(true);
  });

  it("גם כשל בצד Supabase מחזיר הביתה - אין מה להציג מעבר לזה", async () => {
    const handler = makeSignoutHandler(async () => { throw new Error("auth down"); });
    const res = await handler(new Request(`${ORIGIN}/auth/signout`, { method: "POST" }));
    expect(locationOf(res).pathname).toBe("/");
  });
});
