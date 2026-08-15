import { describe, expect, it } from "vitest";
import { deriveBusinessMap, STAGE_LABEL, STAGE_STATUS_LABEL, type StageKey } from "../src/pipeline/roadmap/business-map";
import type { DimensionKey, DimensionScore, RuleResult, ScoreReport } from "../src/pipeline/score/types";
import type { BusinessModel, ModelSection } from "../src/pipeline/model/business-model";

// כל המבחנים כאן אופליין לגמרי (אין DB, אין React, אין LLM) - business-map.ts טהור בכוונה, ראו
// הערת המודול. בונים ScoreReport/BusinessModel סינתטיים במקום להריץ את מנוע הציונים האמיתי, כדי
// לשלוט בדיוק על known/earned/points לכל חוק ולבודד את לוגיקת הגזירה עצמה.

function rule(key: string, points: number, known: boolean, earned: boolean): RuleResult {
  return { key, points, known, earned: known && earned, text: known ? (earned ? "ok" : "gap") : "" };
}

function dim(key: DimensionKey, rules: RuleResult[]): DimensionScore {
  const totalPts = rules.reduce((s, r) => s + r.points, 0);
  const knownPts = rules.filter((r) => r.known).reduce((s, r) => s + r.points, 0);
  const earnedPts = rules.filter((r) => r.earned).reduce((s, r) => s + r.points, 0);
  return {
    key,
    label: key,
    weight: 0.2,
    score: knownPts === 0 ? null : Math.round((earnedPts / knownPts) * 100),
    dataStatus: knownPts === 0 ? "none" : knownPts >= totalPts ? "full" : "partial",
    rules,
  };
}

function report(dims: DimensionScore[]): ScoreReport {
  return { overall: null, dimensions: dims, topGaps: [], topStrengths: [] };
}

function credits(overrides: Partial<Record<ModelSection, number>> = {}): Record<ModelSection, number> {
  const base: Record<ModelSection, number> = {
    profile: 0, channels: 0, lead_flow: 0, scheduling: 0, service: 0,
    billing: 0, retention: 0, tools: 0, pains: 0, manual_tasks: 0,
  };
  return { ...base, ...overrides };
}

function model(overrides: Partial<BusinessModel> = {}): BusinessModel {
  return {
    data: {
      profile: {}, channels: {}, lead_flow: {}, scheduling: {}, service: {},
      billing: {}, retention: {}, tools: {}, pains: {}, manual_tasks: {},
    },
    fieldSources: {},
    credits: credits(),
    completenessPct: 0,
    ...overrides,
  };
}

// דוח "עשיר ובריא" - כל חוק בכל ממד ידוע והושג. שימוש חוזר בכמה בדיקות כבסיס
function healthyReport(): ScoreReport {
  return report([
    dim("visibility", [
      rule("gbp_exists", 20, true, true),
      rule("has_website", 5, true, true),
      rule("own_website", 15, true, true),
      rule("perf", 20, true, true),
      rule("lcp", 15, true, true),
      rule("seo", 10, true, true),
      rule("gbp_phone", 5, true, true),
      rule("gbp_rating", 10, true, true),
    ]),
    dim("reputation", [
      rule("has_reviews", 20, true, true),
      rule("review_volume", 15, true, true),
      rule("rating_good", 25, true, true),
      rule("no_problem_themes", 25, true, true),
      rule("positive_themes", 15, true, true),
    ]),
    dim("accessibility", [
      rule("phone_available", 15, true, true),
      rule("whatsapp", 25, true, true),
      rule("contact_form", 15, true, true),
      rule("online_booking", 30, true, true),
      rule("email_link", 15, true, true),
    ]),
    dim("infrastructure", [
      rule("analytics", 35, true, true),
      rule("fb_pixel", 30, true, true),
      rule("chat_widget", 20, true, true),
      rule("multi_page", 15, true, true),
    ]),
    dim("process", [
      rule("lead_handling", 40, true, true),
      rule("manual_tasks", 30, true, true),
      rule("internal_tools", 30, true, true),
    ]),
  ]);
}

function healthyModel(): BusinessModel {
  return model({
    credits: credits({
      lead_flow: 1, scheduling: 1, service: 1, billing: 1, retention: 1, tools: 1,
    }),
    data: {
      profile: {}, channels: {}, lead_flow: {}, scheduling: {}, service: {},
      billing: {}, retention: {}, tools: {}, pains: { note: "הכל עובד מצוין" }, manual_tasks: {},
    },
  });
}

const ALL_STAGE_KEYS: StageKey[] = ["marketing", "lead", "sale", "service", "billing", "retention"];

describe("STAGE_LABEL / STAGE_STATUS_LABEL - טקסטים עבריים לתצוגה", () => {
  it("שש התוויות מהאפיון בדיוק", () => {
    expect(STAGE_LABEL).toEqual({
      marketing: "שיווק",
      lead: "ליד",
      sale: "מכירה",
      service: "שירות",
      billing: "גבייה",
      retention: "שימור",
    });
  });

  it("ארבעת תוויות הסטטוס מהאפיון בדיוק", () => {
    expect(STAGE_STATUS_LABEL).toEqual({
      healthy: "תקין",
      weak: "חלש",
      missing: "חסר",
      unknown: "אין מידע",
    });
  });
});

describe("deriveBusinessMap - מקרה מלא (עסק בריא, מודל מלא)", () => {
  it("כל ששת השלבים תקינים, בסדר שרשרת הערך", () => {
    const stages = deriveBusinessMap(healthyReport(), healthyModel());
    expect(stages.map((s) => s.key)).toEqual(ALL_STAGE_KEYS);
    for (const s of stages) {
      expect(s.status, `${s.key} should be healthy`).toBe("healthy");
      expect(s.statusLabel).toBe("תקין");
      expect(s.label).toBe(STAGE_LABEL[s.key]);
    }
  });
});

describe("deriveBusinessMap - בלי מודל בכלל (model=null)", () => {
  it("שלבים תלויי-מודל טהורים (מכירה, גבייה) יוצאים אין מידע, שאר השלבים עדיין נגזרים מהסריקה", () => {
    // process עם model=null מדמה בדיוק את ה-stub האמיתי (processRules(null)) - known=false לכולם
    const scores = report([
      dim("visibility", [rule("gbp_exists", 20, true, true), rule("has_website", 5, true, true)]),
      dim("reputation", [rule("has_reviews", 20, true, true), rule("rating_good", 25, true, true)]),
      dim("accessibility", [rule("whatsapp", 25, true, true), rule("contact_form", 15, true, true)]),
      dim("infrastructure", [
        rule("analytics", 35, true, true),
        rule("fb_pixel", 30, true, true),
        rule("chat_widget", 20, true, true),
      ]),
      dim("process", [
        rule("lead_handling", 40, false, false),
        rule("manual_tasks", 30, false, false),
        rule("internal_tools", 30, false, false),
      ]),
    ]);

    const stages = deriveBusinessMap(scores, null);
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));

    // מכירה: internal_tools לא ידוע (תלוי tools>=1) + scheduling credit לא ידוע (אין מודל) => אין מידע
    expect(byKey.sale.status).toBe("unknown");
    // גבייה: קרדיט-מודל טהור, בלי מודל בכלל => אין מידע תמיד
    expect(byKey.billing.status).toBe("unknown");

    // שיווק/ליד/שימור עדיין נגזרים מהסריקה בלבד ולא תלויים במודל - נשארים תקינים
    expect(byKey.marketing.status).toBe("healthy");
    expect(byKey.lead.status).toBe("healthy");
    expect(byKey.retention.status).toBe("healthy");
    // שירות: chat_widget ידוע ותקין מהסריקה, גם בלי קרדיט service מהמודל - עדיין תקין
    expect(byKey.service.status).toBe("healthy");
  });
});

describe("deriveBusinessMap - ציונים נמוכים: גבולות חלש/חסר", () => {
  function marketingOnlyReport(earnedCount: number, totalCount: number): ScoreReport {
    const rules: RuleResult[] = [];
    for (let i = 0; i < totalCount; i++) rules.push(rule(`r${i}`, 25, true, i < earnedCount));
    return report([dim("visibility", rules)]);
  }

  it("75% ומעלה -> תקין (גבול תחתון של תקין)", () => {
    const stages = deriveBusinessMap(marketingOnlyReport(3, 4), null); // 75%
    expect(stages.find((s) => s.key === "marketing")?.status).toBe("healthy");
  });

  it("50% בדיוק -> חלש", () => {
    const stages = deriveBusinessMap(marketingOnlyReport(2, 4), null); // 50%
    expect(stages.find((s) => s.key === "marketing")?.status).toBe("weak");
  });

  it("מתחת ל-50% אבל לא אפס -> חסר", () => {
    const stages = deriveBusinessMap(marketingOnlyReport(1, 4), null); // 25%
    expect(stages.find((s) => s.key === "marketing")?.status).toBe("missing");
  });

  it("0% כשיש בכלל מידע ידוע -> חסר (לא אין מידע - יש חוקים ידועים, כולם לא הושגו)", () => {
    const stages = deriveBusinessMap(marketingOnlyReport(0, 4), null);
    expect(stages.find((s) => s.key === "marketing")?.status).toBe("missing");
  });
});

describe("deriveBusinessMap - אין מידע כלל (דוח ריק, בלי מודל)", () => {
  it("כל ששת השלבים אין מידע - אין נפילה על ממד חסר או מפתח חוק לא קיים", () => {
    const stages = deriveBusinessMap(report([]), null);
    expect(stages).toHaveLength(6);
    for (const s of stages) {
      expect(s.status, `${s.key} should be unknown`).toBe("unknown");
      expect(s.statusLabel).toBe("אין מידע");
    }
  });

  it("ממד קיים אבל בלי אחד מהחוקים שהמיפוי מחפש - אין זריקה, פשוט לא תורם אות", () => {
    // ממד process קיים אבל בלי lead_handling/internal_tools בכלל (מקרה קצה תיאורטי)
    const scores = report([dim("process", [rule("manual_tasks", 30, true, true)])]);
    const stages = deriveBusinessMap(scores, null);
    expect(stages.find((s) => s.key === "lead")?.status).toBe("unknown");
    expect(stages.find((s) => s.key === "sale")?.status).toBe("unknown");
  });
});

describe("deriveBusinessMap - קרדיט מודל (0/0.5/1) לשלבים תלויי-מודל", () => {
  // גבייה תלויה באות יחיד (קרדיט billing בלבד, אין חוק סריקה מקביל) - ולכן קרדיט 0.5 (שממילא
  // אף פעם לא קורה בפועל ל-billing: deriveBusinessModel תמיד נותן לו 0, רק ראיון מזכה ב-1) היה
  // יוצא "חסר" מתמטית (0 מתוך הנקודות הידועות היחידות). הבדיקה הבאה בודקת תרחיש ריאלי יותר -
  // שלב "מכירה" משלב שני אותות (חוק internal_tools אמיתי + קרדיט scheduling) - שם קרדיט חלקי
  // 0.5 (שכן קורה בפועל: hasOnlineBooking שזוהה בסריקה בלי אישור בראיון) מתערבב עם אות שני
  // ומניב "חלש" אמיתי, לא "חסר" - כי הוא לא לבד בממוצע
  it("מכירה: קרדיט scheduling=0.5 (מסריקה, לא אושר) לצד internal_tools תקין -> חלש, לא תקין", () => {
    const scores = report([dim("process", [rule("internal_tools", 30, true, true)])]);
    const m = model({ credits: credits({ tools: 1, scheduling: 0.5 }) });
    const stages = deriveBusinessMap(scores, m);
    expect(stages.find((s) => s.key === "sale")?.status).toBe("weak");
  });

  it("קרדיט billing=1 (אושר בראיון) -> תקין", () => {
    const m = model({ credits: credits({ billing: 1 }) });
    const stages = deriveBusinessMap(report([]), m);
    expect(stages.find((s) => s.key === "billing")?.status).toBe("healthy");
  });

  it("קרדיט billing=0 -> אין מידע, לא חסר (לא ממציאים בעיה שלא דווחה)", () => {
    const m = model({ credits: credits({ billing: 0 }) });
    const stages = deriveBusinessMap(report([]), m);
    expect(stages.find((s) => s.key === "billing")?.status).toBe("unknown");
  });
});

describe("deriveBusinessMap - שימור: ציטוט כאב על אובדן לקוחות", () => {
  it("ציטוט 'לקוחות לא חוזרים' הופך שימור מתקין לחלש/חסר, גם כשממד המוניטין נראה תקין", () => {
    const healthyReputation = report([
      dim("reputation", [
        rule("has_reviews", 20, true, true),
        rule("rating_good", 25, true, true),
      ]),
    ]);
    const withPain = model({ data: { ...model().data, pains: { note: "לקוחות לא חוזרים אלינו אחרי פעם ראשונה" } } });

    const withoutPainStages = deriveBusinessMap(healthyReputation, model());
    const withPainStages = deriveBusinessMap(healthyReputation, withPain);

    expect(withoutPainStages.find((s) => s.key === "retention")?.status).toBe("healthy");
    expect(withPainStages.find((s) => s.key === "retention")?.status).not.toBe("healthy");
  });

  it("כאב חיובי (לא קשור לאובדן לקוחות) לא פוגע בשימור", () => {
    const healthyReputation = report([
      dim("reputation", [rule("has_reviews", 20, true, true)]),
    ]);
    const withUnrelatedPain = model({ data: { ...model().data, pains: { note: "אין לנו מספיק שעות ביום" } } });
    const stages = deriveBusinessMap(healthyReputation, withUnrelatedPain);
    expect(stages.find((s) => s.key === "retention")?.status).toBe("healthy");
  });

  it("בלי שום ציטוט pains (מודל קיים, סקציה ריקה) - אין תרומה חיובית או שלילית מהאות הזה", () => {
    const healthyReputation = report([dim("reputation", [rule("has_reviews", 20, true, true)])]);
    const stages = deriveBusinessMap(healthyReputation, model());
    expect(stages.find((s) => s.key === "retention")?.status).toBe("healthy");
  });
});
