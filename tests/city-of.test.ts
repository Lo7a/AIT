import { describe, it, expect } from "vitest";
import { cityOf } from "../src/pipeline/city-of";

describe("cityOf", () => {
  it("שולף את העיר מכתובת עם רחוב, עיר ומדינה", () => {
    expect(cityOf("שדרות רגר 12, באר שבע, ישראל")).toBe("באר שבע");
  });

  it("שומר מקפים בשם עיר מורכב", () => {
    expect(cityOf("רחוב הרצל 5, תל אביב-יפו, ישראל")).toBe("תל אביב-יפו");
  });

  it("מדלג על מקטע מיקוד (כתובת עם מיקוד לפני המדינה)", () => {
    expect(cityOf("רחוב הרצל 5, באר שבע, 8410501, ישראל")).toBe("באר שבע");
  });

  it("מדלג על מיקוד גם כשהוא כתוב עם מקף", () => {
    expect(cityOf("שדרות רגר 12, באר שבע, 84105-01, ישראל")).toBe("באר שבע");
  });

  it("עובד גם בלי סיומת 'ישראל' (רחוב+עיר בלבד)", () => {
    expect(cityOf("רגר 12, באר שבע")).toBe("באר שבע");
  });

  it("שם עיר באנגלית עם סיומת Israel", () => {
    expect(cityOf("Rager 12, Beer Sheva, Israel")).toBe("Beer Sheva");
  });

  it("כתובת בלי פסיקים (מקטע יחיד) - null", () => {
    expect(cityOf("תל אביב")).toBeNull();
  });

  it("מחרוזת ריקה - null", () => {
    expect(cityOf("")).toBeNull();
  });

  it("אחרי סינון הרעש נשאר מקטע יחיד (עיר+מדינה בלבד, בלי רחוב) - null (אין מספיק הקשר)", () => {
    expect(cityOf("באר שבע, ישראל")).toBeNull();
  });

  it("לעולם לא זורק - קלט משונה מוחזר כ-null", () => {
    expect(() => cityOf(null as unknown as string)).not.toThrow();
    expect(cityOf(null as unknown as string)).toBeNull();
    expect(() => cityOf(undefined as unknown as string)).not.toThrow();
    expect(cityOf(undefined as unknown as string)).toBeNull();
  });
});
