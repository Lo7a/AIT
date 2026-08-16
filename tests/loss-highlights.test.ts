import { describe, expect, it } from "vitest";
import { lossHighlights } from "../src/pipeline/roadmap/loss-highlights";
import type { CatalogRowLite, OpportunityMatch } from "../src/pipeline/roadmap/matching";

// "מה מונח על השולחן" (loss leads, score measures - שלב א): lossHighlights טהור לחלוטין - בלי
// I/O, בלי מיון פנימי. הקורא (report-highlights.ts / roadmap-logic.ts) כבר מעביר matches בסדר
// ה-score הרצוי; הפונקציה הזו רק שולפת savingRange כלשונו, מדדפת ומקצה תקרה.

function catalogItem(overrides: Partial<CatalogRowLite> = {}): CatalogRowLite {
  return {
    id: "c1",
    name: "פריט לדוגמה",
    problem: "בעיה לדוגמה",
    solution: "פתרון לדוגמה",
    conditions: { gapKeys: ["analytics"] },
    costRange: "₪100-1000",
    savingRange: "שעה בשבוע",
    complexity: "low",
    installTime: "שבוע",
    ...overrides,
  };
}

function match(overrides: Partial<OpportunityMatch> = {}): OpportunityMatch {
  return {
    catalog: catalogItem(),
    evidence: [],
    unknownKeys: [],
    painQuotes: [],
    ...overrides,
  };
}

describe("lossHighlights", () => {
  it("מערך matches ריק -> מערך ריק", () => {
    expect(lossHighlights([])).toEqual([]);
  });

  it("שולף itemName+text verbatim מהקטלוג, בסדר הקלט (לא ממיין מחדש)", () => {
    const first = match({ catalog: catalogItem({ id: "c1", name: "קביעת תורים אונליין", savingRange: "2-5 שעות תיאומים בשבוע" }) });
    const second = match({ catalog: catalogItem({ id: "c2", name: "בוט וואטסאפ", savingRange: "5-10 שעות מענה בשבוע" }) });

    const result = lossHighlights([first, second]);

    expect(result).toEqual([
      { itemName: "קביעת תורים אונליין", text: "2-5 שעות תיאומים בשבוע" },
      { itemName: "בוט וואטסאפ", text: "5-10 שעות מענה בשבוע" },
    ]);
  });

  it("הטקסט מועתק כלשונו - אין עיגול/סיכום/שינוי ניסוח", () => {
    const oddText = "2-5 שעות תיאומים בשבוע; הפחתת אי-הגעות ב-30-50%";
    const result = lossHighlights([match({ catalog: catalogItem({ savingRange: oddText }) })]);
    expect(result[0].text).toBe(oddText);
  });

  it("מדדף טקסטים זהים - הפריט הראשון עם הטקסט זוכה, השני מושמט", () => {
    const sameText = "שעה בשבוע";
    const first = match({ catalog: catalogItem({ id: "c1", name: "פריט א", savingRange: sameText }) });
    const duplicate = match({ catalog: catalogItem({ id: "c2", name: "פריט ב", savingRange: sameText }) });

    const result = lossHighlights([first, duplicate]);
    expect(result).toEqual([{ itemName: "פריט א", text: sameText }]);
  });

  it("דדופ ממשיך לסרוק קדימה כדי למלא את התקרה - כפילות לא 'גוזלת' מקום מפריט שלישי אמיתי", () => {
    const sameText = "שעה בשבוע";
    const first = match({ catalog: catalogItem({ id: "c1", name: "פריט א", savingRange: sameText }) });
    const duplicate = match({ catalog: catalogItem({ id: "c2", name: "פריט ב (כפילות טקסט)", savingRange: sameText }) });
    const third = match({ catalog: catalogItem({ id: "c3", name: "פריט ג", savingRange: "טקסט שונה לגמרי" }) });

    const result = lossHighlights([first, duplicate, third], 2);
    expect(result).toEqual([
      { itemName: "פריט א", text: sameText },
      { itemName: "פריט ג", text: "טקסט שונה לגמרי" },
    ]);
  });

  it("תקרת ברירת המחדל היא 3 - matches נוספים לא נכנסים", () => {
    const items = ["א", "ב", "ג", "ד"].map((letter, i) =>
      match({ catalog: catalogItem({ id: `c${i}`, name: `פריט ${letter}`, savingRange: `טקסט ${letter}` }) }),
    );
    const result = lossHighlights(items);
    expect(result).toHaveLength(3);
    expect(result.map((h) => h.itemName)).toEqual(["פריט א", "פריט ב", "פריט ג"]);
  });

  it("תקרה מותאמת (limit=1) מכבדת את הערך שהועבר", () => {
    const items = ["א", "ב"].map((letter, i) =>
      match({ catalog: catalogItem({ id: `c${i}`, name: `פריט ${letter}`, savingRange: `טקסט ${letter}` }) }),
    );
    expect(lossHighlights(items, 1)).toEqual([{ itemName: "פריט א", text: "טקסט א" }]);
  });

  it("limit גדול ממספר ה-matches בפועל - מחזיר את כולם, בלי לזרוק", () => {
    const items = [match({ catalog: catalogItem({ name: "יחיד" }) })];
    expect(lossHighlights(items, 10)).toHaveLength(1);
  });
});
