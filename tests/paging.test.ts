import { describe, expect, it } from "vitest";
import { pageWindow, paged, pageParam } from "../src/server/paging";

// עימוד משותף לחמישה מסכי ניהול. הערכים מגיעים מה-URL, כלומר מקלט שאיש לא שולט בו -
// ולכן החסמים כאן הם הגנה אמיתית ולא נוי

describe("pageWindow", () => {
  it("ברירות מחדל כשלא נשלח כלום", () => {
    expect(pageWindow({})).toMatchObject({ page: 1, perPage: 25, skip: 0, take: 25 });
  });

  it("מחשב דילוג לפי העמוד", () => {
    expect(pageWindow({ page: 3, perPage: 10 })).toMatchObject({ skip: 20, take: 10 });
  });

  it("עמוד אפס או שלילי הוא עמוד 1 - אחרת skip היה שלילי", () => {
    expect(pageWindow({ page: 0 }).page).toBe(1);
    expect(pageWindow({ page: -5 }).skip).toBe(0);
  });

  it("perPage חסום מלמעלה - בלי זה כל אחד יכול למשוך את כל הטבלה בבקשה אחת", () => {
    expect(pageWindow({ perPage: 100000 }).perPage).toBe(100);
    expect(pageWindow({ perPage: 100000 }, 25, 50).perPage).toBe(50);
  });

  it("perPage אפס או שלילי נופל לברירת המחדל ולא ל-take אפס", () => {
    expect(pageWindow({ perPage: 0 }).perPage).toBe(25);
    expect(pageWindow({ perPage: -3 }).perPage).toBe(1);
  });

  it("שברים נחתכים לשלמים", () => {
    expect(pageWindow({ page: 2.9, perPage: 10.7 })).toMatchObject({ page: 2, perPage: 10, skip: 10 });
  });
});

describe("paged", () => {
  it("מחשב מספר עמודים כלפי מעלה", () => {
    const w = pageWindow({ page: 1, perPage: 10 });
    expect(paged([], 21, w).pages).toBe(3);
  });

  it("טבלה ריקה היא עמוד אחד ולא אפס - כדי לא להציג עמוד 1 מתוך 0", () => {
    expect(paged([], 0, pageWindow({})).pages).toBe(1);
  });

  it("מחזיר את השורות והסך כפי שהם", () => {
    const out = paged(["a", "b"], 42, pageWindow({ page: 2, perPage: 2 }));
    expect(out).toMatchObject({ rows: ["a", "b"], total: 42, page: 2, perPage: 2, pages: 21 });
  });
});

describe("pageParam", () => {
  it("קורא מספר תקין", () => {
    expect(pageParam("4")).toBe(4);
  });

  it.each([undefined, "", "abc", "0", "-2", "NaN"])("קלט לא תקין (%s) הוא עמוד 1", (v) => {
    expect(pageParam(v)).toBe(1);
  });
});
