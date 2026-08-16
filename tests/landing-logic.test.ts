import { describe, expect, it } from "vitest";
import { PENDING_SEARCH_KEY, popPendingSearch, stashPendingSearch } from "../src/app/landing-logic";

// לוגיקת דף הנחיתה (landing-logic.ts): שמירת כוונת החיפוש לפני הכניסה ושליפתה החד-פעמית אחריה

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    map,
  };
}

describe("stashPendingSearch", () => {
  it("שומר ערך ממשי (עם קיצוץ רווחים) ומדווח שנשמר", () => {
    const storage = memoryStorage();
    expect(stashPendingSearch(storage, "  מסעדת השף חיפה  ")).toBe(true);
    expect(storage.map.get(PENDING_SEARCH_KEY)).toBe("מסעדת השף חיפה");
  });

  it("ערך ריק לא נשמר; storage שזורק לא מפיל את הזרימה", () => {
    const storage = memoryStorage();
    expect(stashPendingSearch(storage, "   ")).toBe(false);
    expect(storage.map.has(PENDING_SEARCH_KEY)).toBe(false);
    const throwing = { ...memoryStorage(), setItem: () => { throw new Error("blocked"); } };
    expect(stashPendingSearch(throwing, "עסק")).toBe(false);
  });
});

describe("popPendingSearch", () => {
  it("שליפה חד-פעמית: הערך חוזר פעם אחת ונמחק", () => {
    const storage = memoryStorage();
    stashPendingSearch(storage, "עסק לדוגמה");
    expect(popPendingSearch(storage)).toBe("עסק לדוגמה");
    expect(popPendingSearch(storage)).toBeNull();
  });

  it("בלי ערך שמור או עם storage שזורק - null שקט", () => {
    expect(popPendingSearch(memoryStorage())).toBeNull();
    const throwing = { ...memoryStorage(), getItem: () => { throw new Error("blocked"); } };
    expect(popPendingSearch(throwing)).toBeNull();
  });
});
