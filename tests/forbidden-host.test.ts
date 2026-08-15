import { describe, it, expect } from "vitest";
import { isForbiddenHost, forbiddenHostOf, assertFetchableUrl } from "../src/pipeline/forbidden-host";

// המודול הזה הוצא מ-src/server/api/diagnose-stream.ts כדי שגם שכבת ה-fetch של הפייפליין
// תוכל להשתמש בו (קוד פייפליין לא מייבא מ-src/server). הבדיקות כאן משקפות אחת לאחת את
// הציפיות שהיו במבחני diagnose-stream, בתוספת בדיקות לעטיפות החדשות
describe("isForbiddenHost", () => {
  it("חוסם לופבק, רשתות פרטיות, link-local ושמות פנימיים", () => {
    for (const bad of [
      "localhost", "LOCALHOST", "printer.local", "db.internal",
      "127.0.0.1", "127.1.2.3", "10.0.0.5", "0.0.0.0",
      "169.254.169.254", "192.168.1.1", "172.16.0.1", "172.31.255.255",
    ]) {
      expect(isForbiddenHost(bad), bad).toBe(true);
    }
  });

  it("חוסם ליטרל IPv6 פנימי (::1, fc00::/7, fe80::/10) גם עם סוגריים מרובעים", () => {
    for (const bad of ["[::1]", "[fd00::1]", "[fc00::1]", "[fe80::1]", "::1", "fd00::1"]) {
      expect(isForbiddenHost(bad), bad).toBe(true);
    }
  });

  it("לא חוסם דומיינים ציבוריים שמתחילים ב-fc/fd/fe80 (הבאג של fcbarcelona)", () => {
    for (const good of [
      "fcbarcelona.com", "fdny.org", "fe80shop.co.il", "x.co.il", "example.com",
      "172.32.0.1", "11.0.0.1", "localhost.attacker.com",
    ]) {
      expect(isForbiddenHost(good), good).toBe(false);
    }
  });
});

describe("forbiddenHostOf", () => {
  it("מחזיר את שם המארח החסום, ו-null לכתובת ציבורית או לא-תקינה", () => {
    expect(forbiddenHostOf("http://127.0.0.1:6379/keys")).toBe("127.0.0.1");
    expect(forbiddenHostOf("http://[fd00::1]/x")).toBe("[fd00::1]");
    expect(forbiddenHostOf("https://fcbarcelona.com")).toBeNull();
    expect(forbiddenHostOf("לא כתובת בכלל")).toBeNull();
  });
});

describe("assertFetchableUrl", () => {
  it("מחזיר URL מפורש לכתובת ציבורית", () => {
    expect(assertFetchableUrl("https://example.co.il/x").href).toBe("https://example.co.il/x");
  });

  it("זורק על מארח פנימי, וההודעה מכילה את שם המארח בלבד (בלי נתיב ובלי פורט)", () => {
    const err = (() => {
      try { assertFetchableUrl("http://127.0.0.1:6379/admin/secret-key"); return null; }
      catch (e) { return e as Error; }
    })();
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("127.0.0.1");
    expect(err!.message).not.toContain("secret-key");
    expect(err!.message).not.toContain("6379");
  });

  it("זורק על סכמה שאינה http/https בלי לחשוף את שאר הכתובת", () => {
    const err = (() => {
      try { assertFetchableUrl("file:///etc/passwd"); return null; }
      catch (e) { return e as Error; }
    })();
    expect(err!.message).toContain("http");
    expect(err!.message).not.toContain("passwd");
  });

  it("פותר כתובת יחסית מול בסיס, ובודק את התוצאה", () => {
    const base = new URL("https://example.co.il/a/b");
    expect(assertFetchableUrl("/c", base).href).toBe("https://example.co.il/c");
    expect(() => assertFetchableUrl("http://[::1]/", base)).toThrow(/::1/);
  });

  it("זורק בעברית על כתובת לא תקינה", () => {
    expect(() => assertFetchableUrl("http://")).toThrow(/[א-ת]/);
  });
});
