import { describe, expect, it } from "vitest";
import { parseUsageRange } from "../src/server/usage-range";

// הטווח מגיע מה-URL, כלומר מקלט שאיש לא שולט בו. כל הבדיקות עם "עכשיו" מוזרק

const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("parseUsageRange", () => {
  it("ברירת המחדל היא שבעה ימים - מה שהמסך הציג עד היום", () => {
    const r = parseUsageRange({}, NOW);
    expect(r.key).toBe("7d");
    expect(NOW.getTime() - r.from.getTime()).toBe(7 * DAY);
    expect(r.to).toEqual(NOW);
  });

  it.each(["today", "30d", "90d"] as const)("מזהה את הקדם-מוגדר %s", (key) => {
    expect(parseUsageRange({ range: key }, NOW).key).toBe(key);
  });

  it("ערך לא מוכר נופל לברירת המחדל ולא קורס", () => {
    expect(parseUsageRange({ range: "לפני שנתיים" }, NOW).key).toBe("7d");
  });

  it("הרזולוציה נגזרת מאורך הטווח ולא נבחרת ידנית", () => {
    expect(parseUsageRange({ range: "today" }, NOW).bucket).toBe("hour");
    expect(parseUsageRange({ range: "7d" }, NOW).bucket).toBe("day");
    expect(parseUsageRange({ range: "30d" }, NOW).bucket).toBe("day");
    expect(parseUsageRange({ range: "90d" }, NOW).bucket).toBe("week");
  });

  it("טווח מותאם תקין נקרא, ויום הסיום כלול", () => {
    const r = parseUsageRange({ range: "custom", from: "2026-08-01", to: "2026-08-10" }, NOW);
    expect(r.key).toBe("custom");
    expect(r.from.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    // "עד 10.8" פירושו כולל כל ה-10.8, ולכן הגבול הבלעדי הוא תחילת ה-11.8
    expect(r.to.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it.each([
    ["חסר תאריך סיום", { range: "custom", from: "2026-08-01" }],
    ["סדר הפוך", { range: "custom", from: "2026-08-10", to: "2026-08-01" }],
    ["פורמט לא תקין", { range: "custom", from: "01/08/2026", to: "2026-08-10" }],
    ["אותו יום פעמיים", { range: "custom", from: "2026-08-01", to: "2026-08-01" }],
  ])("טווח מותאם פסול (%s) נופל לברירת המחדל", (_label, params) => {
    // עדיף לחזור לשבעה ימים מאשר להציג טווח שאיש לא ביקש
    expect(parseUsageRange(params, NOW).key).toBe("7d");
  });

  it("טווח מותאם ארוך מדי נחתך - בלי חסם זו סריקה של כל הטבלה", () => {
    const r = parseUsageRange({ range: "custom", from: "2000-01-01", to: "2026-08-10" }, NOW);
    expect(r.key).toBe("custom");
    const days = (r.to.getTime() - r.from.getTime()) / DAY;
    expect(days).toBe(730);
  });

  it("הגבול העליון בלעדי, כדי ששורה לא תיספר בשני טווחים סמוכים", () => {
    const a = parseUsageRange({ range: "custom", from: "2026-08-01", to: "2026-08-05" }, NOW);
    const b = parseUsageRange({ range: "custom", from: "2026-08-06", to: "2026-08-10" }, NOW);
    expect(a.to.getTime()).toBe(b.from.getTime());
  });
});
