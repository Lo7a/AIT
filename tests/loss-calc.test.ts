import { describe, expect, it } from "vitest";
import { personalLossLine } from "../src/pipeline/roadmap/loss-calc";
import { QUESTION_BANK } from "../src/pipeline/interview/questions";

// חישוב ההפסד האישי (מדרגה ב של "ההפסד מוביל") - מודול טהור, אופליין לגמרי. שלוש הכרעות
// המייסד (16.8) נעולות כאן: ניסוח ישיר שמוביל במספר, שורה מפרגנת לעונים מהר, ושורה רק כששתי
// התשובות קיימות ותואמות לאופציות הידועות.

describe("personalLossLine - שורת סיכון", () => {
  it("30-100 פניות עם תגובה של יום-יומיים: מוביל בטווח המחושב, מעגן בתשובות ובמקור", () => {
    const line = personalLossLine("30-100", "יום-יומיים ומעלה");
    expect(line).not.toBeNull();
    expect(line!.kind).toBe("risk");
    // 30*0.35=10.5 -> 10 (רצפה), 100*0.5=50 - העיגול תמיד כלפי מטה, לעולם לא מגזים
    expect(line!.lead).toBe("לפי מה שסיפרת: 10-50 מהפניות השבועיות שלך בסיכון ממשי.");
    expect(line!.anchor).toBe(
      "סיפרת על 30-100 פניות בשבוע ותגובה של יום-יומיים ומעלה. מחקר InsideSales מצא ש-35-50% מהעסקאות נסגרות אצל מי שמגיב ראשון.",
    );
  });

  it("עד 10 פניות: טווח פתוח מלמטה מנוסח 'עד X'", () => {
    const line = personalLossLine("עד 10", "באותו יום");
    expect(line!.kind).toBe("risk");
    expect(line!.lead).toContain("עד 5 מהפניות השבועיות");
    expect(line!.anchor).toContain("תגובה באותו יום");
  });

  it("מעל 100 פניות: טווח פתוח מלמעלה מנוסח 'מעל X' לפי הקצה השמרני", () => {
    const line = personalLossLine("מעל 100", "תוך שעה-שעתיים");
    expect(line!.kind).toBe("risk");
    // 100*0.35=35 - הקצה התחתון של המחקר על המינימום שסופר, בלי הבטחות מעבר
    expect(line!.lead).toContain("מעל 35 מהפניות השבועיות");
    expect(line!.anchor).toContain("תגובה תוך שעה-שעתיים");
  });

  it("10-30 פניות: שני הקצוות מעוגלים כלפי מטה (3-15, לא 4-15)", () => {
    const line = personalLossLine("10-30", "באותו יום");
    expect(line!.lead).toContain("3-15 מהפניות השבועיות");
  });
});

describe("personalLossLine - שורה מפרגנת", () => {
  it("עונים תוך דקות: פרגון עם אותו נתון מחקר, בלי שום טענת סיכון", () => {
    const line = personalLossLine("10-30", "תוך דקות");
    expect(line).not.toBeNull();
    expect(line!.kind).toBe("praise");
    expect(line!.lead).toContain("נכס אמיתי");
    expect(line!.anchor).toContain("35-50%");
    expect(`${line!.lead} ${line!.anchor}`).not.toContain("בסיכון");
  });

  it("תשובת שווי לקוח לא משנה את הפרגון - מי שעונה מהר לא מקבל תג מחיר על הפסד שאין", () => {
    const bare = personalLossLine("10-30", "תוך דקות")!;
    const withDeal = personalLossLine("10-30", "תוך דקות", "1,000-5,000 שקל")!;
    expect(withDeal).toEqual(bare);
    expect(`${withDeal.lead} ${withDeal.anchor}`).not.toContain("שקל");
  });
});

// ההכרעה הרביעית (18.8): שווי הלקוח מצטרף לשורה כציטוט ולא כמכפלה. הניסיון הראשון הכפיל
// "פניות בסיכון" בשווי לקוח שנסגר, וזה הניח בשקט שיעור סגירה של 100% - מספר שאיש לא נתן ואין
// לו מקור. הבדיקות כאן נועלות את הכלל: אין שום אריתמטיקה על כסף בשורה הזאת
describe("personalLossLine - שווי הלקוח מצטרף כציטוט, בלי מכפלה", () => {
  it("30-100 פניות, יום-יומיים, לקוח של 1,000-5,000: הספירה והשווי זה לצד זה, בלי סכום מחושב", () => {
    const line = personalLossLine("30-100", "יום-יומיים ומעלה", "1,000-5,000 שקל")!;
    expect(line.kind).toBe("risk");
    expect(line.lead).toBe(
      "לפי מה שסיפרת: 10-50 מהפניות השבועיות שלך בסיכון ממשי, וכל לקוח שנסגר שווה לך 1,000-5,000 שקל.",
    );
    // העיגון לא נגע: אותו משפט בדיוק כמו לפני שנוספה שאלת השווי
    expect(line.anchor).toBe(
      "סיפרת על 30-100 פניות בשבוע ותגובה של יום-יומיים ומעלה. מחקר InsideSales מצא ש-35-50% מהעסקאות נסגרות אצל מי שמגיב ראשון.",
    );
  });

  it("ההבחנה בין פנייה ללקוח שנסגר נשמרת גלויה בניסוח", () => {
    const line = personalLossLine("10-30", "באותו יום", "300-1,000 שקל")!;
    expect(line.lead).toContain("מהפניות השבועיות שלך בסיכון ממשי");
    expect(line.lead).toContain("וכל לקוח שנסגר שווה לך");
  });

  it("כל אחת מארבע התוויות מצוטטת אות-באות, בלי עיבוד", () => {
    for (const d of ["עד 300 שקל", "300-1,000 שקל", "1,000-5,000 שקל", "מעל 5,000 שקל"]) {
      expect(personalLossLine("10-30", "באותו יום", d)!.lead, d).toContain(`שווה לך ${d}.`);
    }
  });

  // הנעילה המרכזית: השורה לא מייצרת שום סכום שאינו התווית שהוא בחר. אם מישהו יחזיר מכפלה
  // (למשל "בכסף זה לפחות 10,000 שקל בשבוע"), הבדיקה הזאת תיפול
  it("אין בשורה שום סכום מעבר לתווית שהוא בחר - אפס אריתמטיקה על כסף", () => {
    for (const v of ["עד 10", "10-30", "30-100", "מעל 100"]) {
      for (const d of ["עד 300 שקל", "300-1,000 שקל", "1,000-5,000 שקל", "מעל 5,000 שקל"]) {
        const line = personalLossLine(v, "באותו יום", d)!;
        // מסירים את הציטוט; מה שנשאר לא אמור להזכיר כסף בכלל
        const withoutQuote = `${line.lead.replace(d, "")} ${line.anchor}`;
        expect(withoutQuote, `${v} + ${d}`).not.toContain("שקל");
        expect(withoutQuote, `${v} + ${d}`).not.toContain("בכסף");
      }
    }
  });

  it("העיגון זהה בין תשובת שווי לחוסר תשובת שווי - השווי לא נכנס לחישוב שום דבר", () => {
    for (const v of ["10-30", "30-100", "מעל 100", "עד 10"]) {
      const withDeal = personalLossLine(v, "באותו יום", "1,000-5,000 שקל")!;
      const without = personalLossLine(v, "באותו יום")!;
      expect(withDeal.anchor, v).toBe(without.anchor);
      expect(withDeal.anchor, v).toContain("מחקר InsideSales");
      expect(withDeal.anchor, v).toContain(v);
    }
  });
});

// תשובות שהן מפתחות על אב-הטיפוס של Object ("constructor", "__proto__" וכו') הגיעו בעבר
// לחיפוש הישיר במפות והחזירו ערך "מזוהה" אך לא מוגדר - ומשם NaN אל המסך
describe("personalLossLine - תשובות שהן מפתחות אב-טיפוס לא מזוהות כתוויות", () => {
  const protoKeys = ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"];

  it("כמות או זמן תגובה כאלה - null, בלי NaN", () => {
    for (const k of protoKeys) {
      expect(personalLossLine(k, "באותו יום"), k).toBeNull();
      expect(personalLossLine("10-30", k), k).toBeNull();
    }
  });

  it("שווי לקוח כזה - השורה הרגילה בלי ציטוט שווי, בלי NaN", () => {
    const base = personalLossLine("10-30", "באותו יום")!;
    for (const k of protoKeys) {
      const line = personalLossLine("10-30", "באותו יום", k)!;
      expect(line, k).toEqual(base);
      expect(`${line.lead} ${line.anchor}`, k).not.toContain("NaN");
    }
  });
});

describe("personalLossLine - מתי אין שורה בכלל (הכרעת מייסד: רק עם שני הנתונים)", () => {
  it("חסרה תשובת כמות - null", () => {
    expect(personalLossLine(null, "באותו יום")).toBeNull();
    expect(personalLossLine(undefined, "באותו יום")).toBeNull();
  });

  it("חסרה תשובת זמן תגובה - null", () => {
    expect(personalLossLine("10-30", null)).toBeNull();
  });

  it("תשובת טקסט חופשי (אחר) לא מפוענחת - null, בלי ניסיון לחלץ מספרים", () => {
    expect(personalLossLine("בערך חמישים בשבוע", "באותו יום")).toBeNull();
    expect(personalLossLine("10-30", "תלוי בעומס, לפעמים שבוע")).toBeNull();
  });

  it("רווחים מסביב לתשובה תקינה לא שוברים את הפענוח", () => {
    expect(personalLossLine(" 10-30 ", " באותו יום ")).not.toBeNull();
  });

  // תשובת השווי היא שדרוג ולא תנאי: היעדרה או ניסוח שלא מהתפריט לא מבטלים את השורה ולא
  // משנים אותה - ההתנהגות זהה אות-באות למה שהיה לפני שהשאלה השלישית נוספה
  it("תשובת שווי חסרה או לא מוכרת - בדיוק השורה הישנה, בלי שום סכום", () => {
    const base = personalLossLine("30-100", "יום-יומיים ומעלה")!;
    for (const deal of [null, undefined, "", "   ", "תלוי בלקוח", "אחר", "בערך אלפיים", "5,000 שקל"]) {
      expect(personalLossLine("30-100", "יום-יומיים ומעלה", deal), `deal ${String(deal)}`).toEqual(base);
    }
    expect(`${base.lead} ${base.anchor}`).not.toContain("שקל");
  });

  it("תשובת שווי בלי שתי התשובות הבסיסיות - עדיין null, השווי לבדו לא מייצר שורה", () => {
    expect(personalLossLine(null, "באותו יום", "1,000-5,000 שקל")).toBeNull();
    expect(personalLossLine("10-30", null, "1,000-5,000 שקל")).toBeNull();
  });

  it("רווחים מסביב לתשובת שווי תקינה לא שוברים את הפענוח", () => {
    expect(personalLossLine("10-30", "באותו יום", " 1,000-5,000 שקל ")!.lead)
      .toContain("שווה לך 1,000-5,000 שקל.");
  });
});

// נעילת ההצלבה מול בנק השאלות: כל אופציה של שתי שאלות הכמות חייבת להיות מפוענחת - אם ניסוח
// אופציה משתנה ב-questions.ts בלי לעדכן את loss-calc.ts, הבדיקה הזאת נופלת (אותו דפוס כמו
// ההצלבה של LEAD_DROP_RE בבדיקות הראיון)
describe("הצלבה מול בנק השאלות", () => {
  const optionsOf = (key: string): string[] => {
    const q = QUESTION_BANK.find((x) => x.key === key);
    expect(q, `question ${key} exists`).toBeTruthy();
    return (q!.options ?? []).map((o) => o.label);
  };

  it("כל צירוף של אופציות כמות וזמן תגובה מהבנק מחזיר שורה (אף אופציה לא נופלת בפענוח)", () => {
    const volumes = optionsOf("lead_flow_volume");
    const responses = optionsOf("lead_flow_response_time");
    expect(volumes.length).toBeGreaterThanOrEqual(4);
    expect(responses.length).toBeGreaterThanOrEqual(4);
    for (const v of volumes) {
      for (const r of responses) {
        const line = personalLossLine(v, r);
        expect(line, `combination "${v}" + "${r}"`).not.toBeNull();
      }
    }
  });

  it("בדיוק אופציית זמן אחת מפרגנת (תוך דקות) - השאר סיכון", () => {
    const responses = optionsOf("lead_flow_response_time");
    const kinds = responses.map((r) => personalLossLine("10-30", r)!.kind);
    expect(kinds.filter((k) => k === "praise")).toHaveLength(1);
    expect(kinds.filter((k) => k === "risk")).toHaveLength(responses.length - 1);
  });

  // אותה נעילה בדיוק לאופציות שווי הלקוח: כל תווית מהבנק חייבת להיות מוכרת ב-DEAL_VALUE_LABELS.
  // ההוכחה שהיא זוהתה היא הציטוט שלה בשורה עצמה - תווית שלא זוהתה פשוט לא מופיעה
  it("כל אופציית שווי מהבנק מזוהה ומצוטטת בשורה (אף תווית לא נופלת בשקט בפענוח)", () => {
    const deals = optionsOf("lead_flow_deal_value");
    expect(deals.length).toBeGreaterThanOrEqual(4);
    const base = personalLossLine("10-30", "באותו יום")!;
    for (const d of deals) {
      const line = personalLossLine("10-30", "באותו יום", d)!;
      expect(line.lead, `deal "${d}"`).not.toBe(base.lead);
      expect(line.lead, `deal "${d}"`).toContain(`שווה לך ${d}.`);
    }
  });

  it("כל צירוף של שלוש השאלות מהבנק מחזיר שורה עם ציטוט השווי, בלי אף סכום מחושב", () => {
    const volumes = optionsOf("lead_flow_volume");
    const deals = optionsOf("lead_flow_deal_value");
    for (const v of volumes) {
      for (const d of deals) {
        const line = personalLossLine(v, "באותו יום", d);
        expect(line, `combination "${v}" + "${d}"`).not.toBeNull();
        expect(line!.lead, `combination "${v}" + "${d}"`).toContain(`שווה לך ${d}.`);
        // מעבר לציטוט אין בשורה שום אזכור כסף - לא סכום ולא יחידת זמן של סכום
        expect(line!.lead.replace(d, ""), `combination "${v}" + "${d}"`).not.toContain("שקל");
      }
    }
  });
});
