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
});
