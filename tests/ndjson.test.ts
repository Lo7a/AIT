import { describe, expect, it } from "vitest";
import { NdjsonParser } from "../src/app/ndjson";

describe("NdjsonParser", () => {
  it("מפרק צ'אנקים שלמים לשורות JSON", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("שומר שורה חתוכה בין צ'אנקים", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('{"a"')).toEqual([]);
    expect(p.push(':1}\n')).toEqual([{ a: 1 }]);
  });

  it("flush מחזיר שארית אחרונה בלי newline סוגר", () => {
    const p = new NdjsonParser<{ a: number }>();
    p.push('{"a":3}');
    expect(p.flush()).toEqual([{ a: 3 }]);
  });

  it("שורה פגומה נזרקת בשקט ולא מפילה את הזרם", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('לא json\n{"a":4}\n')).toEqual([{ a: 4 }]);
  });
});
