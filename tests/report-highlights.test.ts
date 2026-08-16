import { describe, expect, it } from "vitest";
import { reportLossHighlights } from "../src/pipeline/roadmap/report-highlights";
import type { CatalogRowLite } from "../src/pipeline/roadmap/matching";
import type { DimensionScore, RuleResult, ScoreReport } from "../src/pipeline/score/types";
import type { BusinessModel } from "../src/pipeline/model/business-model";

// "מה מונח על השולחן" למסך הדוח (loss leads, score measures - שלב א'): reportLossHighlights הוא
// ה-helper הטהור שה-RSC (report/[id]/page.tsx) קורא לו - (scores, model, catalog) -> highlights,
// בזיכרון בלבד, בלי לחשב ציונים טריים (לא scoreWithModel - זה תפקידו של buildRoadmap/
// finishInterview בלבד). הבדיקות כאן משתמשות בצורת קטלוג אמיתית מהזרע (prisma/seed.ts) כדי
// שהמבחן ישקף savingRange verbatim אמיתי, לא טקסט סינתטי.

function rule(key: string, points: number, known: boolean, earned: boolean, text: string): RuleResult {
  return { key, points, known, earned, text: known ? text : "" };
}

function dim(key: DimensionScore["key"], weight: number, rules: RuleResult[]): DimensionScore {
  return { key, label: key, weight, score: null, dataStatus: "full", rules };
}

const EMPTY_SECTIONS = [
  "profile", "channels", "lead_flow", "scheduling", "service", "billing", "retention", "tools", "manual_tasks",
] as const;

function modelWithPains(painsData: Record<string, unknown>): BusinessModel {
  const data = Object.fromEntries(EMPTY_SECTIONS.map((s) => [s, {}])) as BusinessModel["data"];
  const credits = Object.fromEntries(
    [...EMPTY_SECTIONS, "pains"].map((s) => [s, s === "pains" ? 1 : 0]),
  ) as BusinessModel["credits"];
  return { data: { ...data, pains: painsData }, fieldSources: {}, credits, completenessPct: 10 };
}

// שורות קטלוג אמיתיות מ-prisma/seed.ts (מבנה CATALOG) - שמות ו-savingRange כלשונם, כדי שהבדיקה
// תשקף בדיוק מה שהמסך יציג בפועל, לא ניסוח סינתטי
const BOOKING_CATALOG: CatalogRowLite = {
  id: "cat-booking",
  name: "קביעת תורים אונליין",
  problem: "כל תיאום תור דורש שיחת טלפון בשעות הפעילות - חיכוך ללקוח ועומס לצוות",
  solution: "יומן תורים אונליין (תשתית ייעודית) מוטמע באתר ובפרופיל גוגל",
  conditions: { gapKeys: ["online_booking"] },
  costRange: "₪100-500 לחודש",
  savingRange: "2-5 שעות תיאומים בשבוע; הפחתת אי-הגעות ב-30-50%",
  complexity: "low",
  installTime: "עד שבוע",
};

const ANALYTICS_CATALOG: CatalogRowLite = {
  id: "cat-analytics",
  name: "התקנת מדידה (Analytics + פיקסל)",
  problem: "אין נתונים על מי מבקר באתר ומאיפה - החלטות שיווק מתקבלות באפלה",
  solution: "התקנת GA4 ופיקסל Meta + הגדרת אירועי המרה בסיסיים",
  conditions: { gapKeys: ["analytics", "fb_pixel"] },
  costRange: "₪800-3,500 חד-פעמי",
  savingRange: "מדידת החזר על פרסום ורימרקטינג; הערכה ענפית: מניעת בזבוז 10-30% מהתקציב",
  complexity: "low",
  installTime: "ימים בודדים",
};

const GBP_CATALOG: CatalogRowLite = {
  id: "cat-gbp",
  name: "הקמת פרופיל Google Business",
  problem: "העסק לא מופיע במפות גוגל - לקוחות שמחפשים בסביבה לא מוצאים אותו",
  solution: "הקמה ומילוי מלא של פרופיל העסק: פרטים, תמונות, שעות, קטגוריות ופוסטים",
  conditions: { gapKeys: ["gbp_exists"] },
  costRange: "₪400-2,000 חד-פעמי",
  savingRange: "4-8 שעות הקמה ואימות שנחסכות + חשיפה מקומית שאובדת היום לגמרי",
  complexity: "low",
  installTime: "1-4 שבועות (כולל אימות גוגל)",
};

const CRM_CATALOG: CatalogRowLite = {
  id: "cat-crm",
  name: "חיבור לידים ל-CRM והתראות",
  problem: "פניות מהאתר מגיעות למייל ונקברות שם - אין מעקב מי טופל ומי נפל",
  solution: "כל פנייה נרשמת אוטומטית ב-CRM עם התראה מיידית לוואטסאפ של המטפל",
  conditions: { gapKeys: ["contact_form", "lead_handling", "email_link"] },
  costRange: "הקמה ₪1,500-8,000 + ₪100-500 לחודש פלטפורמות",
  savingRange: "3-8 שעות הזנה ומעקב בשבוע; אפס לידים שנופלים בין הכיסאות",
  complexity: "medium",
  installTime: "1-2 שבועות",
};

// דוח סינתטי: פערים אמיתיים ב-analytics/fb_pixel/online_booking, gbp_exists תקין (earned)
const REPORT: ScoreReport = {
  overall: 55,
  dimensions: [
    dim("infrastructure", 0.15, [
      rule("analytics", 35, true, false, "אין Google Analytics, העסק עיוור לתנועה באתר שלו"),
      rule("fb_pixel", 30, true, false, "אין פיקסל פייסבוק, אי אפשר לעשות רימרקטינג למבקרים"),
    ]),
    dim("accessibility", 0.25, [
      rule("online_booking", 30, true, false, "אין קביעת תור אונליין"),
      rule("gbp_exists", 20, true, true, "העסק מופיע בגוגל מפות"),
    ]),
  ],
  topGaps: [],
  topStrengths: [],
};

describe("reportLossHighlights", () => {
  it("scores=null (אין עדיין ציונים לאבחון) -> מערך ריק", () => {
    expect(reportLossHighlights(null, null, [BOOKING_CATALOG, ANALYTICS_CATALOG])).toEqual([]);
  });

  it("עסק חזק - אין פערים ואין כאבים (gbp_exists תקין, שום gapKey אחר בקטלוג) -> מערך ריק", () => {
    const result = reportLossHighlights(REPORT, null, [GBP_CATALOG]);
    expect(result).toEqual([]);
  });

  it("קטלוג ריק -> מערך ריק, לא זריקה", () => {
    expect(reportLossHighlights(REPORT, null, [])).toEqual([]);
  });

  it("מדרג לפי הציון המחושב (matchOpportunities -> scoreOpportunity), טקסט/שם verbatim מהקטלוג", () => {
    const result = reportLossHighlights(REPORT, null, [BOOKING_CATALOG, ANALYTICS_CATALOG]);

    // analytics+fb_pixel יחד סוגרים יותר נקודות משקל אבודות מ-online_booking לבדו (9.75 מול 7.5) -
    // הבסיס המנורמל של ANALYTICS מגיע ל-60 המלא, BOOKING פחות מזה - ANALYTICS מדורג ראשון
    expect(result).toEqual([
      { itemName: "התקנת מדידה (Analytics + פיקסל)", text: "מדידת החזר על פרסום ורימרקטינג; הערכה ענפית: מניעת בזבוז 10-30% מהתקציב" },
      { itemName: "קביעת תורים אונליין", text: "2-5 שעות תיאומים בשבוע; הפחתת אי-הגעות ב-30-50%" },
    ]);
  });

  it("פריט כאב-בלבד (routing מ-owner pain, אין ראיה כמותית) נכנס ומדורג לפי ציונו - נמוך משני פריטי הראיה", () => {
    const model = modelWithPains({ ownerNotes: "אני מקליד הכול ידנית לאקסל" }); // מצביע על lead_handling (CRM_CATALOG)
    const result = reportLossHighlights(REPORT, model, [BOOKING_CATALOG, ANALYTICS_CATALOG, CRM_CATALOG]);

    expect(result.map((h) => h.itemName)).toEqual([
      "התקנת מדידה (Analytics + פיקסל)",
      "קביעת תורים אונליין",
      "חיבור לידים ל-CRM והתראות",
    ]);
    expect(result[2].text).toBe("3-8 שעות הזנה ומעקב בשבוע; אפס לידים שנופלים בין הכיסאות");
  });

  it("מכבד limit מותאם", () => {
    const result = reportLossHighlights(REPORT, null, [BOOKING_CATALOG, ANALYTICS_CATALOG], 1);
    expect(result).toEqual([
      { itemName: "התקנת מדידה (Analytics + פיקסל)", text: "מדידת החזר על פרסום ורימרקטינג; הערכה ענפית: מניעת בזבוז 10-30% מהתקציב" },
    ]);
  });

  it("דדופ עובר דרך ה-composition: שני פריטים עם savingRange זהה - רק הראשון (לפי ציון) מופיע", () => {
    const duplicateText = "טקסט חיסכון זהה בכוונה";
    const catalogA: CatalogRowLite = { ...BOOKING_CATALOG, id: "dup-a", name: "פריט כפול א", savingRange: duplicateText };
    const catalogB: CatalogRowLite = { ...ANALYTICS_CATALOG, id: "dup-b", name: "פריט כפול ב", savingRange: duplicateText };

    const result = reportLossHighlights(REPORT, null, [catalogA, catalogB]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(duplicateText);
    // catalogB (analytics+fb_pixel) מדורג ראשון לפי ציון - הוא זה ש"זוכה" בטקסט הכפול
    expect(result[0].itemName).toBe("פריט כפול ב");
  });

  it("דטרמיניסטי: אותו קלט מחזיר אותו פלט בדיוק בכל קריאה", () => {
    const first = reportLossHighlights(REPORT, null, [BOOKING_CATALOG, ANALYTICS_CATALOG, GBP_CATALOG]);
    const second = reportLossHighlights(REPORT, null, [BOOKING_CATALOG, ANALYTICS_CATALOG, GBP_CATALOG]);
    expect(second).toEqual(first);
  });

  // החלטת מייסד 16.8 ("AI נמכר הכי טוב"): גם בלוק ההפסד בדוח מרים פריטי ai לראש הרשימה - אותו
  // עסק לא אמור לראות סדר אחד בדוח וסדר אחר ב-Roadmap. הבוט נכנס כאן על פער chat_widget יחיד
  // (נקודות אבודות נמוכות משל analytics+fb_pixel) ובכל זאת מוביל את הבלוק
  it("AI קודם: פריט ai מוביל את הבלוק גם כשפריט לא-ai סוגר יותר נקודות אבודות", () => {
    const botCatalog: CatalogRowLite = {
      id: "cat-bot",
      name: "בוט וואטסאפ לשירות לקוחות",
      problem: "שאלות חוזרות מעמיסות על הטלפון, ופניות מחוץ לשעות הפעילות אובדות",
      solution: "בוט וואטסאפ שעונה על השאלות הנפוצות ומעביר שיחות מורכבות לצוות",
      conditions: { gapKeys: ["chat_widget"] },
      costRange: "הקמה ₪2,500-12,000 + ₪100-900 לחודש",
      savingRange: "5-10 שעות מענה בשבוע",
      complexity: "medium",
      installTime: "1-6 שבועות לפי מורכבות",
    };
    const reportWithChatGap: ScoreReport = {
      ...REPORT,
      dimensions: [
        ...REPORT.dimensions,
        dim("process", 0.2, [rule("chat_widget", 20, true, false, "אין צאט באתר")]),
      ],
    };

    const result = reportLossHighlights(reportWithChatGap, null, [BOOKING_CATALOG, ANALYTICS_CATALOG, botCatalog]);
    expect(result.map((h) => h.itemName)).toEqual([
      "בוט וואטסאפ לשירות לקוחות",
      "התקנת מדידה (Analytics + פיקסל)",
      "קביעת תורים אונליין",
    ]);
  });
});
