import { describe, expect, it } from "vitest";
import { filterCandidates } from "../src/app/candidate-filter";
import type { BusinessCandidate } from "../src/pipeline/types";

const candidates: BusinessCandidate[] = [
  { placeId: "p1", name: "ג'נטלמן דיזנגוף", address: "דיזנגוף 100, תל אביב", rating: 4.5, reviewCount: 120 },
  { placeId: "p2", name: "ג'נטלמן רמת אביב", address: "איינשטיין 5, תל אביב", rating: 4.2, reviewCount: 40 },
  { placeId: "p3", name: "Aroma Espresso Bar", address: "King George 12, Tel Aviv", rating: 4.0, reviewCount: 300 },
];

describe("filterCandidates", () => {
  it("שאילתה ריקה מחזירה את כל הרשימה כמות שהיא", () => {
    expect(filterCandidates(candidates, "")).toEqual(candidates);
    expect(filterCandidates(candidates, "   ")).toEqual(candidates);
  });

  it("מסנן לפי התאמת תת-מחרוזת בשם", () => {
    const result = filterCandidates(candidates, "רמת אביב");
    expect(result).toEqual([candidates[1]]);
  });

  it("מסנן לפי התאמת תת-מחרוזת בכתובת (רחוב)", () => {
    const result = filterCandidates(candidates, "איינשטיין");
    expect(result).toEqual([candidates[1]]);
  });

  it("אין התאמות מחזיר רשימה ריקה בלי לזרוק", () => {
    expect(filterCandidates(candidates, "חיפה")).toEqual([]);
  });

  it("טקסט לועזי לא תלוי רישיות", () => {
    expect(filterCandidates(candidates, "AROMA")).toEqual([candidates[2]]);
    expect(filterCandidates(candidates, "king george")).toEqual([candidates[2]]);
  });

  it("שם מעורב שפות (עברית + מותג לועזי) מותאם דרך שני השדות יחד", () => {
    const mixed: BusinessCandidate[] = [
      { placeId: "p4", name: "מספרת Barber Shop TLV", address: "דרך מנחם בגין 7", rating: 4.8, reviewCount: 10 },
    ];
    expect(filterCandidates(mixed, "barber")).toEqual(mixed);
    expect(filterCandidates(mixed, "מספרת")).toEqual(mixed);
    expect(filterCandidates(mixed, "בגין")).toEqual(mixed);
  });

  it("רשימה ריקה בכניסה נשארת ריקה גם עם שאילתה", () => {
    expect(filterCandidates([], "משהו")).toEqual([]);
  });
});
