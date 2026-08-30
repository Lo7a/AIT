import { describe, expect, it } from "vitest";
import { findContactForm, submitForm, type FormIdentity } from "../src/pipeline/mystery/form";
import type { LookupLike } from "../src/pipeline/resolve-guard";

const ID: FormIdentity = { name: "נועה", email: "probe-abc@example-mail.test", message: "שלום, שאלה קטנה" };
const PAGE = "https://business.example.co.il/contact/";
const publicLookup: LookupLike = async () => [{ address: "93.184.216.34", family: 4 }];

describe("findContactForm", () => {
  it("טופס Contact Form 7: שדות חבויים עוברים כמו שהם, השדות ממופים לפי שם", () => {
    const html = `<form action="/contact/#wpcf7-f12-o1" method="post" class="wpcf7-form">
      <input type="hidden" name="_wpcf7" value="12"/>
      <input type="hidden" name="_wpcf7_unit_tag" value="wpcf7-f12-o1"/>
      <input type="text" name="your-name" placeholder="שם מלא"/>
      <input type="email" name="your-email"/>
      <input type="tel" name="your-phone"/>
      <textarea name="your-message"></textarea>
      <input type="submit" value="שלח"/>
    </form>`;
    const form = findContactForm(html, PAGE, ID)!;
    expect(form.action).toBe("https://business.example.co.il/contact/#wpcf7-f12-o1");
    expect(form.fields).toEqual({
      _wpcf7: "12", _wpcf7_unit_tag: "wpcf7-f12-o1",
      "your-name": "נועה", "your-email": ID.email, "your-message": ID.message,
    });
    expect(form.hasMessageField).toBe(true);
  });

  it("שדות בעברית לפי placeholder, נושא קבוע, טלפון רק אם ניתן", () => {
    const html = `<form method="POST" action="send.php">
      <input name="f1" placeholder="השם שלך" required/>
      <input name="f2" placeholder="טלפון נייד" required/>
      <input name="f3" placeholder="נושא"/>
      <textarea name="f4" placeholder="הודעה"></textarea>
      <button type="submit">שלח</button>
    </form>`;
    const form = findContactForm(html, PAGE, { ...ID, phone: "050-0000000" })!;
    expect(form.action).toBe("https://business.example.co.il/contact/send.php");
    expect(form.fields).toEqual({ f1: "נועה", f2: "050-0000000", f3: "שאלה קטנה", f4: ID.message });
    // בלי טלפון: שדה טלפון נדרש נשלח ריק (עדיף על טלפון מומצא)
    expect(findContactForm(html, PAGE, ID)!.fields.f2).toBe("");
  });

  it("טופס חיפוש, טופס GET, טופס בלי הודעה ורשימת תפוצה - לא טופס יצירת קשר", () => {
    expect(findContactForm(`<form role="search" method="post"><input name="s"/><textarea name="q"></textarea></form>`, PAGE, ID)).toBeNull();
    expect(findContactForm(`<form method="get"><input name="name"/><textarea name="m"></textarea></form>`, PAGE, ID)).toBeNull();
    expect(findContactForm(`<form method="post"><input name="name"/><input name="email"/></form>`, PAGE, ID)).toBeNull();
    expect(findContactForm(`<form method="post" id="newsletter"><input name="email"/><textarea name="m"></textarea></form>`, PAGE, ID)).toBeNull();
  });

  it("הטופס הראשון המתאים נבחר; צ'קבוקס נדרש מסומן, select מקבל את הערך הראשון", () => {
    const html = `
      <form role="search" method="post"><input name="s"/><textarea name="x"></textarea></form>
      <form method="post" action="https://business.example.co.il/api/lead">
        <input name="name"/><textarea name="message"></textarea>
        <select name="topic"><option value="">בחר</option><option value="price">מחיר</option></select>
        <input type="checkbox" name="agree" value="yes" required/>
        <input type="checkbox" name="newsletter" value="yes"/>
      </form>`;
    const form = findContactForm(html, PAGE, ID)!;
    expect(form.action).toBe("https://business.example.co.il/api/lead");
    expect(form.fields).toEqual({ name: "נועה", message: ID.message, topic: "price", agree: "yes" });
  });
});

describe("submitForm", () => {
  it("POST מקודד-טופס לכתובת ה-action, בלי לעקוב אחרי הפניות; 2xx/3xx = נשלח", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("", { status: 302, headers: { location: "/thanks" } });
    }) as typeof fetch;
    const result = await submitForm(
      { action: "https://business.example.co.il/send.php", fields: { name: "נועה", message: "שלום" }, hasMessageField: true },
      { fetchImpl, lookupImpl: publicLookup },
    );
    expect(result).toEqual({ ok: true, status: 302 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://business.example.co.il/send.php");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.redirect).toBe("manual");
    expect(String(calls[0].init.body)).toBe(new URLSearchParams({ name: "נועה", message: "שלום" }).toString());
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toContain("application/x-www-form-urlencoded");
    expect(headers.Referer).toBe("https://business.example.co.il/");
  });

  it("שגיאת שרת = לא נשלח", async () => {
    const fetchImpl = (async () => new Response("", { status: 500 })) as typeof fetch;
    const r = await submitForm({ action: "https://business.example.co.il/x", fields: {}, hasMessageField: true }, { fetchImpl, lookupImpl: publicLookup });
    expect(r.ok).toBe(false);
  });

  it("כתובת פנימית נחסמת לפני כל בקשה - אותה הגנת SSRF כמו הסורק", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response(""); }) as typeof fetch;
    await expect(submitForm({ action: "http://127.0.0.1/admin", fields: {}, hasMessageField: true }, { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow();
    const privateLookup: LookupLike = async () => [{ address: "10.0.0.5", family: 4 }];
    await expect(submitForm({ action: "https://business.example.co.il/x", fields: {}, hasMessageField: true }, { fetchImpl, lookupImpl: privateLookup })).rejects.toThrow();
    expect(called).toBe(false);
  });
});
