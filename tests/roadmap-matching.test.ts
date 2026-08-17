import { describe, it, expect } from "vitest";
import { matchOpportunities, type CatalogRowLite } from "../src/pipeline/roadmap/matching";
import type { DimensionScore, RuleResult, ScoreReport } from "../src/pipeline/score/types";
import type { BusinessModel } from "../src/pipeline/model/business-model";

// עוזרים לבניית ScoreReport סינתטי - matching.ts לא קורא score/dataStatus, אז ערכים קבועים מספיקים
function rule(key: string, points: number, known: boolean, earned: boolean, text: string): RuleResult {
  return { key, points, known, earned, text: known ? text : "" };
}

function dim(key: DimensionScore["key"], weight: number, rules: RuleResult[]): DimensionScore {
  return { key, label: key, weight, score: null, dataStatus: "full", rules };
}

function catalogItem(id: string, name: string, gapKeys: string[]): CatalogRowLite {
  return {
    id,
    name,
    problem: `בעיה עבור ${name}`,
    solution: `פתרון עבור ${name}`,
    conditions: { gapKeys },
    costRange: "₪100-1000",
    savingRange: "שעה בשבוע",
    complexity: "low",
    installTime: "שבוע",
  };
}

const EMPTY_SECTIONS = [
  "profile", "channels", "lead_flow", "scheduling", "service", "billing", "retention", "tools", "manual_tasks",
] as const;

// מודל עסק עם רק סקציית pains ממולאת - שאר הסקציות ריקות (לא רלוונטיות למבחני התאמה)
function modelWithPains(painsData: Record<string, unknown>): BusinessModel {
  const data = Object.fromEntries(EMPTY_SECTIONS.map((s) => [s, {}])) as BusinessModel["data"];
  const credits = Object.fromEntries(
    [...EMPTY_SECTIONS, "pains"].map((s) => [s, s === "pains" ? 1 : 0]),
  ) as BusinessModel["credits"];
  return { data: { ...data, pains: painsData }, fieldSources: {}, credits, completenessPct: 10 };
}

// דוח סינתטי בסגנון קמפאי (אבן דרך 4): פערים ב-analytics/fb_pixel/online_booking, שאר החוקים תקינים
const REPORT_KAMPAI: ScoreReport = {
  overall: 50,
  dimensions: [
    dim("infrastructure", 0.15, [
      rule("analytics", 35, true, false, "אין Google Analytics, העסק עיוור לתנועה באתר שלו"),
      rule("fb_pixel", 30, true, false, "אין פיקסל פייסבוק, אי אפשר לעשות רימרקטינג למבקרים"),
      rule("chat_widget", 20, true, true, "יש צאט באתר"),
    ]),
    dim("accessibility", 0.25, [
      rule("online_booking", 30, true, false, "אין קביעת תור אונליין"),
      rule("whatsapp", 25, true, true, "וואטסאפ זמין באתר"),
      rule("email_link", 15, false, false, ""), // ידוע=false בכוונה - לבדיקת unknownKeys
    ]),
    dim("reputation", 0.2, [
      rule("has_reviews", 20, true, true, "80 ביקורות בגוגל"),
      rule("review_volume", 15, true, true, "מאגר ביקורות מכובד"),
    ]),
  ],
  topGaps: [],
  topStrengths: [],
};

const ANALYTICS_ITEM = catalogItem("c1", "התקנת מדידה", ["analytics", "fb_pixel"]);
const BOOKING_ITEM = catalogItem("c2", "קביעת תורים אונליין", ["online_booking"]);
const WHATSAPP_ITEM = catalogItem("c3", "בוט וואטסאפ", ["whatsapp", "chat_widget"]); // שני המפתחות earned - אין פער
const REVIEWS_ITEM = catalogItem("c4", "איסוף ביקורות אוטומטי", ["has_reviews", "review_volume"]); // שני המפתחות earned - אין פער
const UNKNOWN_ITEM = catalogItem("c5", "פריט עם מפתחות לא-ידועים", ["online_booking", "email_link", "seo"]);
// שני פריטי קטלוג אמיתיים שכל מפתחותיהם חסרים מהדוח הסינתטי - נכנסים רק דרך כאב בעלים
const CRM_ITEM = catalogItem("c6", "חיבור לידים ל-CRM והתראות", ["contact_form", "lead_handling", "email_link"]);
const REPLY_ITEM = catalogItem("c7", "ניהול ומענה לביקורות", ["no_problem_themes"]);

describe("matchOpportunities", () => {
  it("matches the right catalog items to a Kampai-style gap set with correct evidence and lostWeightedPoints", () => {
    const result = matchOpportunities(REPORT_KAMPAI, null, [ANALYTICS_ITEM, BOOKING_ITEM, WHATSAPP_ITEM, REVIEWS_ITEM]);

    expect(result.map((m) => m.catalog.id)).toEqual(["c1", "c2"]);

    const analytics = result.find((m) => m.catalog.id === "c1")!;
    expect(analytics.evidence).toEqual([
      { ruleKey: "analytics", dimension: "infrastructure", text: "אין Google Analytics, העסק עיוור לתנועה באתר שלו", lostWeightedPoints: 35 * 0.15 },
      { ruleKey: "fb_pixel", dimension: "infrastructure", text: "אין פיקסל פייסבוק, אי אפשר לעשות רימרקטינג למבקרים", lostWeightedPoints: 30 * 0.15 },
    ]);
    expect(analytics.unknownKeys).toEqual([]);
    expect(analytics.painQuotes).toEqual([]);

    const booking = result.find((m) => m.catalog.id === "c2")!;
    expect(booking.evidence).toEqual([
      { ruleKey: "online_booking", dimension: "accessibility", text: "אין קביעת תור אונליין", lostWeightedPoints: 30 * 0.25 },
    ]);
  });

  it("does not include an item with no evidence and no pain quotes", () => {
    const result = matchOpportunities(REPORT_KAMPAI, null, [WHATSAPP_ITEM]);
    expect(result).toEqual([]);
  });

  it("includes a pains-only item (all gapKeys earned) with empty evidence and the matching quote attached", () => {
    const quote = "הרבה לקוחות לא חוזרים אחרי הפעם הראשונה";
    const model = modelWithPains({ ownerNotes: quote });
    const result = matchOpportunities(REPORT_KAMPAI, model, [REVIEWS_ITEM]);

    expect(result).toHaveLength(1);
    expect(result[0].catalog.id).toBe("c4");
    expect(result[0].evidence).toEqual([]);
    expect(result[0].painQuotes).toEqual([quote]);
  });

  it("keeps a stable order (ties break by name) and recomputing gives deep-equal output", () => {
    const alpha = catalogItem("c-alpha", "אלפא", ["online_booking"]);
    const beta = catalogItem("c-beta", "בטא", ["online_booking"]);

    const first = matchOpportunities(REPORT_KAMPAI, null, [beta, alpha]);
    expect(first.map((m) => m.catalog.id)).toEqual(["c-alpha", "c-beta"]);

    const second = matchOpportunities(REPORT_KAMPAI, null, [beta, alpha]);
    expect(second).toEqual(first);
  });

  it("model=null yields no pain quotes anywhere, matching still works from report gaps alone", () => {
    const result = matchOpportunities(REPORT_KAMPAI, null, [ANALYTICS_ITEM, BOOKING_ITEM]);
    expect(result.every((m) => m.painQuotes.length === 0)).toBe(true);
  });

  it("ignores non-string pains values (e.g. scan-derived arrays) - no invented quotes", () => {
    const model = modelWithPains({ fromReviews: ["מחירים גבוהים", "לא חוזרים"] });
    const result = matchOpportunities(REPORT_KAMPAI, model, [REVIEWS_ITEM]);
    expect(result).toEqual([]); // אין evidence (earned) ואין ציטוט (הערך הוא מערך, לא string)
  });

  it("populates unknownKeys for known=false rules and for gap keys absent from the report", () => {
    const result = matchOpportunities(REPORT_KAMPAI, null, [UNKNOWN_ITEM]);
    expect(result).toHaveLength(1);
    expect(result[0].unknownKeys).toEqual(["email_link", "seo"]);
    expect(result[0].evidence.map((e) => e.ruleKey)).toEqual(["online_booking"]);
  });

  it("returns an empty list for an empty catalog", () => {
    const model = modelWithPains({ ownerNotes: "כל התורים מנוהלים ביומן נייר" });
    expect(matchOpportunities(REPORT_KAMPAI, model, [])).toEqual([]);
  });

  // אותיות סופיות: "תיאומים"/"טלפונים" לא מכילים כתת-מחרוזת את "תיאום"/"טלפון" - בלי נרמול
  // הצורות האלה (הנפוצות בדיבור של בעל עסק) לא היו מתאימות לשום פריט
  it("matches inflected Hebrew forms (final letters, plurals, attached prefixes)", () => {
    const cases: [string, string][] = [
      ["רוב התיאומים מגיעים אליי בטלפון", "c2"],
      ["והתורים מנוהלים ביומן נייר", "c2"],
      ["כל תיאום דורש שיחה", "c2"],
    ];
    for (const [quote, expectedId] of cases) {
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [BOOKING_ITEM]);
      expect(result[0].catalog.id).toBe(expectedId);
      expect(result[0].painQuotes).toEqual([quote]);
    }

    const phone = matchOpportunities(
      REPORT_KAMPAI, modelWithPains({ ownerNotes: "יש יותר מדי טלפונים במהלך היום" }), [WHATSAPP_ITEM],
    );
    expect(phone).toHaveLength(1); // נכנס על הכאב בלבד (שני המפתחות earned)
    expect(phone[0].painQuotes).toEqual(["יש יותר מדי טלפונים במהלך היום"]);
  });

  // גבול מילה עברי: "בתור בעל עסק" הוא "בתפקיד", ו"תורנות" היא מילה אחרת לגמרי
  it("does not attach a quote where the keyword is only a lookalike substring", () => {
    for (const quote of ["בתור בעל עסק קטן אין לי זמן לשיווק", "אני עובד לבד בלי תורנות"]) {
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [BOOKING_ITEM]);
      expect(result[0].painQuotes).toEqual([]); // נכנס על הפער בלבד
    }
  });

  it("does not attach a quote whose keyword maps to rule keys the item does not ask for", () => {
    const model = modelWithPains({ ownerNotes: "לתאם תור לוקח נצח" }); // מצביע על online_booking בלבד
    expect(matchOpportunities(REPORT_KAMPAI, model, [WHATSAPP_ITEM])).toEqual([]);
  });

  it("reports the same quote once even when it was stored in two pains fields", () => {
    const quote = "יש עומס בטלפון כל היום";
    const model = modelWithPains({ ownerNotes: quote, freeText: quote });
    const result = matchOpportunities(REPORT_KAMPAI, model, [WHATSAPP_ITEM]);
    expect(result[0].painQuotes).toEqual([quote]);
  });

  // מפתח חוק שאף פריט קטלוג לא מבקש לא יכול לצרף ציטוט לכלום - כאב על עבודה ידנית חייב לנחות
  // על פריט אמיתי (חיבור הלידים ל-CRM), וכאב על ביקורות שליליות על פריט המענה לביקורות
  it("routes owner pains to catalog items that actually ask for the mapped rule keys", () => {
    const manual = matchOpportunities(
      REPORT_KAMPAI, modelWithPains({ ownerNotes: "אני מקליד הכול ידנית לאקסל" }), [CRM_ITEM],
    );
    expect(manual).toHaveLength(1);
    expect(manual[0].painQuotes).toEqual(["אני מקליד הכול ידנית לאקסל"]);
    expect(manual[0].evidence).toEqual([]);
    expect(manual[0].unknownKeys).toEqual(["contact_form", "lead_handling", "email_link"]);

    const negative = matchOpportunities(
      REPORT_KAMPAI, modelWithPains({ ownerNotes: "יש ביקורות שליליות שאף אחד לא עונה עליהן" }),
      [REPLY_ITEM, REVIEWS_ITEM],
    );
    expect(negative.map((m) => m.catalog.id).sort()).toEqual(["c4", "c7"]);
  });

  // ניתובי סבב ה-AI (16.8): manual_tasks נהיה מפתח מבוקש (סוכן התוכן וסוכן הצעות המחיר),
  // וכאב טלפוני מנותב גם ל-lead_handling (הסוכן הקולי)
  describe("ניתובי כאב לפריטי ה-AI החדשים", () => {
    const VOICE_ITEM = catalogItem("c8", "סוכן AI קולי למענה טלפוני", ["lead_handling"]);
    const CONTENT_ITEM = catalogItem("c9", "סוכן AI לתוכן ורשתות חברתיות", ["manual_tasks"]);
    const PROPOSAL_ITEM = catalogItem("c10", "סוכן AI להצעות מחיר", ["manual_tasks"]);

    it("כאב טלפוני מצרף את הציטוט גם לסוכן הקולי (lead_handling), לא רק לבוט", () => {
      const quote = "הטלפון לא מפסיק לצלצל ואנחנו מפספסים שיחות";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [VOICE_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
      expect(result[0].evidence).toEqual([]); // כניסה על כאב בלבד - lead_handling לא בדוח הסינתטי
    });

    it("כאב על רשתות חברתיות מנותב ל-manual_tasks - סוכן התוכן נכנס על הציטוט", () => {
      const quote = "אין לי זמן להעלות פוסטים לאינסטגרם";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [CONTENT_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
    });

    it("כאב על הצעות מחיר (ביטוי דו-מילי) מנותב ל-manual_tasks - פריט ההצעות נכנס", () => {
      const quote = "לוקח לי ימים להוציא הצעת מחיר ללקוח";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [PROPOSAL_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
    });

    it("כאב עבודה ידנית באקסל מגיע עכשיו גם לפריטי manual_tasks, לא רק ל-CRM", () => {
      const quote = "אני מקליד הכול ידנית לאקסל";
      const result = matchOpportunities(
        REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [CRM_ITEM, PROPOSAL_ITEM],
      );
      expect(result.map((m) => m.catalog.id).sort()).toEqual(["c10", "c6"]);
      expect(result.every((m) => m.painQuotes.includes(quote))).toBe(true);
    });

    it("כאב שלא נוגע לסושיאל/הצעות לא מצרף את הפריטים החדשים", () => {
      const result = matchOpportunities(
        REPORT_KAMPAI, modelWithPains({ ownerNotes: "קשה לתאם תור" }), [CONTENT_ITEM, PROPOSAL_ITEM],
      );
      expect(result).toEqual([]);
    });
  });

  // ניתובי סבב האתרים והמערכות (17.8): internal_tools נהיה מפתח מבוקש (פריט ה-CRM),
  // וכאב על אתר מנותב לפריט הקמת האתר
  describe("ניתובי כאב לפריטי האתרים והמערכות", () => {
    const SITE_ITEM = catalogItem("c11", "הקמת אתר ראשון לעסק", ["has_website", "own_website"]);
    const CRM_TOOLS_ITEM = catalogItem("c12", "מערכת CRM לניהול לקוחות", ["internal_tools"]);

    it("כאב על היעדר אתר מצרף את הציטוט לפריט הקמת האתר", () => {
      const quote = "אין לנו בכלל אתר, הכול דרך פייסבוק";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [SITE_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
    });

    it("כאב על היעדר מערכת מסודרת מנותב ל-internal_tools - פריט ה-CRM נכנס", () => {
      const quote = "אין לנו מערכת מסודרת ללקוחות, הכול בראש";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [CRM_TOOLS_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
    });

    it("כאב אקסל מגיע גם לפריט ה-CRM החדש (internal_tools) דרך כלל הידני", () => {
      const quote = "אני מקליד הכול ידנית לאקסל";
      const result = matchOpportunities(REPORT_KAMPAI, modelWithPains({ ownerNotes: quote }), [CRM_TOOLS_ITEM]);
      expect(result).toHaveLength(1);
      expect(result[0].painQuotes).toEqual([quote]);
    });
  });

  it("survives a stored model row that has no pains section at all", () => {
    const legacy = { data: { profile: {} }, fieldSources: {}, credits: {}, completenessPct: 0 } as unknown as BusinessModel;
    const result = matchOpportunities(REPORT_KAMPAI, legacy, [ANALYTICS_ITEM, REVIEWS_ITEM]);
    expect(result.map((m) => m.catalog.id)).toEqual(["c1"]); // הפער נשאר, פשוט אין ציטוטים
  });
});
