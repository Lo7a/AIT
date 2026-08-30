import { describe, expect, it } from "vitest";
import {
  pickSendTime, israelParts, israelDate, openingPeriodsFromRaw, type OpeningPeriod,
} from "../src/pipeline/mystery/schedule";

// שעון ישראל בקיץ = UTC+3, בחורף = UTC+2. 30.8.2026 הוא יום ראשון

const fixed = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe("israelDate / israelParts", () => {
  it("קיץ: 10:00 בישראל = 07:00 UTC", () => {
    expect(israelDate(2026, 8, 30, 10, 0).toISOString()).toBe("2026-08-30T07:00:00.000Z");
    expect(israelParts(new Date("2026-08-30T07:00:00Z"))).toMatchObject({ year: 2026, month: 8, day: 30, hour: 10, minute: 0, weekday: 0 });
  });

  it("חורף: 10:00 בישראל = 08:00 UTC", () => {
    expect(israelDate(2026, 12, 15, 10, 0).toISOString()).toBe("2026-12-15T08:00:00.000Z");
  });
});

describe("pickSendTime - ברירת מחדל (בלי שעות פתיחה)", () => {
  it("ביום עבודה בבוקר: החלון הראשון מתחיל שעה מעכשיו, בתוך עשר עד ארבע", () => {
    // ראשון 09:00 בישראל
    const now = new Date("2026-08-30T06:00:00Z");
    const at = pickSendTime({ now, random: fixed([0, 0]) })!;
    // random 0 -> החלון הראשון (היום), נקודת ההתחלה = max(10:00, now+1h=10:00)
    expect(at.toISOString()).toBe("2026-08-30T07:00:00.000Z");
  });

  it("מרווח של שעה מהרגע: לחיצה ב-15:45 לא שולחת היום (נשאר פחות מחצי שעה בחלון)", () => {
    const now = new Date("2026-08-30T12:45:00Z"); // 15:45 בישראל
    const at = pickSendTime({ now, random: fixed([0, 0]) })!;
    expect(israelParts(at)).toMatchObject({ day: 31, hour: 10, minute: 0 });
  });

  it("שישי ושבת מדולגים: לחיצה בחמישי אחרי הפעילות - החלון הראשון ביום ראשון", () => {
    const now = new Date("2026-09-03T15:00:00Z"); // חמישי 18:00 בישראל
    const at = pickSendTime({ now, random: fixed([0, 0]) })!;
    expect(israelParts(at)).toMatchObject({ month: 9, day: 6, weekday: 0, hour: 10 });
  });

  it("random בוחר בין שלושה ימים שונים ונקודה בתוך החלון, בדקות שלמות", () => {
    const now = new Date("2026-08-30T06:00:00Z");
    const third = pickSendTime({ now, random: fixed([0.99, 0.5]) })!;
    const p = israelParts(third);
    expect(p).toMatchObject({ day: 1, month: 9, hour: 13, minute: 0 }); // שלישי, אמצע חלון 10-16
    expect(third.getTime() % 60_000).toBe(0);
  });
});

describe("pickSendTime - לפי שעות הפתיחה מגוגל", () => {
  const periods: OpeningPeriod[] = [
    { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 13, minute: 0 } },
    { open: { day: 5, hour: 8, minute: 30 }, close: { day: 5, hour: 12, minute: 0 } },
  ];

  it("פתוח רק ראשון ושישי - שולח בימים האלה ולא בברירת המחדל", () => {
    const now = new Date("2026-08-30T03:00:00Z"); // ראשון 06:00
    const first = pickSendTime({ now, random: fixed([0, 0]), periods })!;
    expect(israelParts(first)).toMatchObject({ day: 30, hour: 9, minute: 0 });
    // בלי שעות פתיחה אותו רגע נותן את ברירת המחדל - עשר בבוקר
    expect(israelParts(pickSendTime({ now, random: fixed([0, 0]) })!)).toMatchObject({ day: 30, hour: 10 });
    const second = pickSendTime({ now, random: fixed([0.4, 0]), periods })!;
    expect(israelParts(second)).toMatchObject({ day: 4, weekday: 5, hour: 8, minute: 30 });
  });

  it("סגור כל השבוע לפי גוגל - null, והקורא נופל לברירת המחדל", () => {
    const closed: OpeningPeriod[] = [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 6, hour: 22, minute: 10 } }];
    expect(pickSendTime({ now: new Date("2026-08-30T06:00:00Z"), random: fixed([0]), periods: closed })).toBeNull();
  });
});

describe("openingPeriodsFromRaw", () => {
  it("קורא periods מגוף Places גולמי, ומשליך פרקים שבורים", () => {
    const raw = {
      regularOpeningHours: {
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
          { open: { day: 9, hour: 9, minute: 0 } },
          { open: { day: 2, hour: 9, minute: 0 }, close: "לא אובייקט" },
          "זבל",
        ],
      },
    };
    expect(openingPeriodsFromRaw(raw)).toEqual([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 2, hour: 9, minute: 0 } },
    ]);
  });

  it("בלי שעות פתיחה או צורה זרה - null", () => {
    expect(openingPeriodsFromRaw(null)).toBeNull();
    expect(openingPeriodsFromRaw({})).toBeNull();
    expect(openingPeriodsFromRaw({ regularOpeningHours: { periods: [] } })).toBeNull();
    expect(openingPeriodsFromRaw("מחרוזת")).toBeNull();
  });
});
