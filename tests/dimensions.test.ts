import { describe, it, expect } from "vitest";
import { DIMENSIONS, processRules, buildDimensions } from "../src/pipeline/score/dimensions";
import { scoreFindings, scoreWithModel } from "../src/pipeline/score/engine";
import { MODEL_SECTIONS, type BusinessModel, type ModelSection } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

// עסק עשיר עם אתר מלא — בסגנון אופטיקה בק
const RICH: ScanFindings = {
  business: { placeId: "p1", name: "אופטיקה", phone: "04-000", website: "https://x.co.il", rating: 4.9, reviewCount: 80 },
  websiteSignals: {
    pagesCrawled: 8, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
    hasPhoneLink: true, hasEmailLink: true, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress", jsRendered: false,
  },
  pageSpeed: { performanceScore: 46, seoScore: 92, lcpMs: 12700 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [{ theme: "שירות מקצועי", count: 4 }], problemThemes: [] },
  partial: [],
  meta: META,
};

// עסק דל בלי אתר — בסגנון ברכת רחל
const THIN: ScanFindings = {
  business: { placeId: "p2", name: "מאפיה", phone: "08-000", rating: 4.4, reviewCount: 8 },
  reviewInsights: { totalAnalyzed: 5, positiveThemes: [], problemThemes: [{ theme: "מחירים גבוהים", count: 2 }] },
  partial: ["no_website"],
  meta: META,
};

// אתר-בלבד בלי פרופיל גוגל — בסגנון לבן גרופ
const NO_GBP: ScanFindings = {
  business: { placeId: "", name: "lavangroup.co.il", website: "https://lavangroup.co.il/" },
  websiteSignals: {
    pagesCrawled: 1, crawledUrls: [], hasContactForm: false, hasWhatsappLink: false,
    hasPhoneLink: false, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, jsRendered: true,
  },
  pageSpeed: { performanceScore: 40, seoScore: 100, lcpMs: 8000 },
  partial: ["no_gbp", "js_rendered"],
  meta: META,
};

describe("real dimensions", () => {
  it("weights sum to 1 and every dimension's points sum to its expected total", () => {
    expect(DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1);
    // accessibility גדל מ-100 ל-130 עם הוספת a11y_statement (15) + site_a11y (15) - עמידה בדין
    // הישראלי (הצהרת נגישות + בדיקת נגישות אוטומטית). המכנה החדש מכוון (ראו הערת PR/משימה) -
    // הציון עצמו תמיד earnedPts/knownPts (engine.ts) ולא ביחס ל-100 הקבוע, כך שהשינוי לא מזיז
    // ציונים קיימים - רק מוסיף עוד עדות אפשרית לממד
    const expectedTotal: Record<string, number> = {
      visibility: 100, reputation: 100, accessibility: 130, infrastructure: 100, process: 100,
    };
    for (const d of DIMENSIONS) {
      expect(d.rules.reduce((s, r) => s + r.points, 0), d.key).toBe(expectedTotal[d.key]);
    }
  });

  it("process dimension has no data until the interview (milestone 3)", () => {
    for (const findings of [RICH, THIN, NO_GBP]) {
      const process = scoreFindings(DIMENSIONS, findings).dimensions.find((d) => d.key === "process")!;
      expect(process.score).toBeNull();
      expect(process.dataStatus).toBe("none");
    }
  });

  it("rich business: overall is a number, slow site and no booking surface as gaps", () => {
    const report = scoreFindings(DIMENSIONS, RICH);
    expect(report.overall).not.toBeNull();
    const gapKeys = report.dimensions.flatMap((d) => d.rules.filter((r) => r.known && !r.earned).map((r) => r.key));
    expect(gapKeys).toContain("online_booking");
    expect(gapKeys).toContain("perf");
    expect(gapKeys).toContain("lcp");
  });

  it("thin business: accessibility is partial (only phone known), not zero", () => {
    const report = scoreFindings(DIMENSIONS, THIN);
    const access = report.dimensions.find((d) => d.key === "accessibility")!;
    expect(access.dataStatus).toBe("partial");
    expect(access.score).toBe(100); // הטלפון קיים — החוק היחיד הידוע הושג
  });

  it("no-GBP business: gbp_exists is the loudest gap, reputation has no data", () => {
    const report = scoreFindings(DIMENSIONS, NO_GBP);
    expect(report.topGaps.map((g) => g.ruleKey)).toContain("gbp_exists");
    const reputation = report.dimensions.find((d) => d.key === "reputation")!;
    expect(reputation.dataStatus).toBe("none");
  });

  it("js_rendered site: website-signal rules are unknown, not failed", () => {
    const report = scoreFindings(DIMENSIONS, NO_GBP);
    const access = report.dimensions.find((d) => d.key === "accessibility")!;
    const whatsapp = access.rules.find((r) => r.key === "whatsapp")!;
    expect(whatsapp.known).toBe(false); // לא "אין וואטסאפ" — פשוט לא יודעים
  });

  it("no-GBP with failed crawl: phone_available is unknown, not a false gap", () => {
    const findings: ScanFindings = {
      business: { placeId: "", name: "x.co.il", website: "https://x.co.il/" },
      partial: ["no_gbp", "crawl_failed"],
      meta: META,
    };
    const access = scoreFindings(DIMENSIONS, findings).dimensions.find((d) => d.key === "accessibility")!;
    const phone = access.rules.find((r) => r.key === "phone_available")!;
    expect(phone.known).toBe(false);
  });

  it("no known rule ever renders empty/undefined text on realistic fixtures", () => {
    const gbpCrawlFailed: ScanFindings = {
      business: { placeId: "p9", name: "עסק", website: "https://dead.co.il", rating: 4.5, reviewCount: 30 },
      partial: ["crawl_failed", "pagespeed_failed"],
      meta: META,
    };
    for (const fixture of [RICH, THIN, NO_GBP, gbpCrawlFailed]) {
      for (const d of scoreFindings(DIMENSIONS, fixture).dimensions) {
        for (const r of d.rules.filter((r) => r.known)) {
          expect(r.text.length, `${d.key}/${r.key}`).toBeGreaterThan(0);
          expect(r.text, `${d.key}/${r.key}`).not.toMatch(/undefined|NaN|null/);
        }
      }
    }
  });

  it("product thresholds sit exactly on the inclusive boundary", () => {
    const at = (over: Partial<ScanFindings["business"]>, ps?: ScanFindings["pageSpeed"]): ScanFindings => ({
      business: { placeId: "p1", name: "עסק", website: "https://x.co.il", ...over },
      websiteSignals: RICH.websiteSignals, pageSpeed: ps ?? RICH.pageSpeed,
      reviewInsights: RICH.reviewInsights, partial: [], meta: META,
    });
    const ruleOf = (f: ScanFindings, dim: string, key: string) =>
      scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === dim)!.rules.find((r) => r.key === key)!;
    expect(ruleOf(at({ rating: 4.2 }), "reputation", "rating_good").earned).toBe(true);
    expect(ruleOf(at({ rating: 4.1 }), "reputation", "rating_good").earned).toBe(false);
    expect(ruleOf(at({ reviewCount: 5 }), "reputation", "has_reviews").earned).toBe(true);
    expect(ruleOf(at({ reviewCount: 25 }), "reputation", "review_volume").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 70, seoScore: 90, lcpMs: 4000 }), "visibility", "perf").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 69, seoScore: 89, lcpMs: 4001 }), "visibility", "perf").earned).toBe(false);
    expect(ruleOf(at({}, { performanceScore: 70, seoScore: 90, lcpMs: 4000 }), "visibility", "lcp").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 69, seoScore: 89, lcpMs: 4001 }), "visibility", "lcp").earned).toBe(false);
    expect(ruleOf(at({}, { performanceScore: 70, seoScore: 90, lcpMs: 4000 }), "visibility", "seo").earned).toBe(true);
    expect(ruleOf(at({}, { performanceScore: 69, seoScore: 89, lcpMs: 4001 }), "visibility", "seo").earned).toBe(false);
    expect(ruleOf(at({ reviewCount: 4 }), "reputation", "has_reviews").earned).toBe(false);
    expect(ruleOf(at({ reviewCount: 24 }), "reputation", "review_volume").earned).toBe(false);
  });

  it("phone_available is unknown on the GBP path when crawl failed and GBP has no phone", () => {
    const f: ScanFindings = {
      business: { placeId: "p8", name: "עסק", website: "https://x.co.il" },
      partial: ["crawl_failed"], meta: META,
    };
    const access = scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === "accessibility")!;
    expect(access.rules.find((r) => r.key === "phone_available")!.known).toBe(false);
  });

  it("dead domain: has_website is a gap, not praise", () => {
    const f: ScanFindings = {
      business: { placeId: "p7", name: "עסק", website: "https://dead.co.il", rating: 4.5, reviewCount: 30 },
      partial: ["crawl_failed", "pagespeed_failed"], meta: META,
    };
    const vis = scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === "visibility")!;
    const rule = vis.rules.find((r) => r.key === "has_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toContain("לא הצלחנו לטעון");
  });
});

// עסק שה"אתר" שלו הוא בעצם עמוד פייסבוק (ממצא מייסד, אבן דרך 4 משימה 0) - בסגנון בית קפה שכונתי
const SOCIAL: ScanFindings = {
  business: {
    placeId: "p10", name: "בית קפה", phone: "03-0000000",
    website: "https://www.facebook.com/business-social", rating: 4.6, reviewCount: 40,
  },
  socialOnly: { platform: "facebook", url: "https://www.facebook.com/business-social" },
  partial: ["social_only"],
  meta: META,
};

describe("social presence as website (אבן דרך 4, משימה 0)", () => {
  it("socialOnly: כל חוקי האתר שתלויים ב-crawl/PageSpeed נשארים לא ידועים - אין ניחוש מהיעדר מידע", () => {
    const websiteDerivedKeys = [
      "perf", "lcp", "seo", "whatsapp", "contact_form", "online_booking", "email_link",
      "analytics", "fb_pixel", "chat_widget", "multi_page", "a11y_statement", "site_a11y",
    ];
    const report = scoreFindings(DIMENSIONS, SOCIAL);
    for (const dim of report.dimensions) {
      for (const rule of dim.rules.filter((r) => websiteDerivedKeys.includes(r.key))) {
        expect(rule.known, `${dim.key}/${rule.key}`).toBe(false);
      }
    }
  });

  it("has_website לא הושג על עמוד חברתי - עמוד פייסבוק הוא לא 'יש אתר' (תיקון סקירת קוד M3)", () => {
    const rule = scoreFindings(DIMENSIONS, SOCIAL).dimensions
      .find((d) => d.key === "visibility")!.rules.find((r) => r.key === "has_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.points).toBe(5);
    expect(rule.text).toContain("עמוד ברשת חברתית");
  });

  it("own_website: אתר עצמאי רגיל - ידוע והושג", () => {
    const rule = scoreFindings(DIMENSIONS, RICH).dimensions
      .find((d) => d.key === "visibility")!.rules.find((r) => r.key === "own_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(true);
    expect(rule.text).toContain("אתר עצמאי");
  });

  it("own_website: socialOnly - ידוע אבל לא הושג, gapText מזכיר את הפלטפורמה בעברית", () => {
    const rule = scoreFindings(DIMENSIONS, SOCIAL).dimensions
      .find((d) => d.key === "visibility")!.rules.find((r) => r.key === "own_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toContain("פייסבוק");
  });

  it("own_website: אין שום נוכחות דיגיטלית (לא website ולא socialOnly) - ידוע תמיד (תיקון סקירת קוד C1), פער עם טקסט כללי", () => {
    const rule = scoreFindings(DIMENSIONS, THIN).dimensions
      .find((d) => d.key === "visibility")!.rules.find((r) => r.key === "own_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toBe("לעסק אין אתר עצמאי משלו");
  });

  it("chat_widget: כשיש כפתור וואטסאפ הפער מכיר בו במקום להישמע טועה (ממצא מייסד - סבא אדוארד)", () => {
    const f = structuredClone(RICH);
    f.websiteSignals!.hasChatWidget = false;
    f.websiteSignals!.hasWhatsappLink = true;
    const rule = scoreFindings(DIMENSIONS, f).dimensions
      .find((d) => d.key === "infrastructure")!.rules.find((r) => r.key === "chat_widget")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toContain("וואטסאפ");
  });

  it("chat_widget: בלי וואטסאפ בכלל - הנוסח המקורי", () => {
    const f = structuredClone(RICH);
    f.websiteSignals!.hasChatWidget = false;
    f.websiteSignals!.hasWhatsappLink = false;
    const rule = scoreFindings(DIMENSIONS, f).dimensions
      .find((d) => d.key === "infrastructure")!.rules.find((r) => r.key === "chat_widget")!;
    expect(rule.text).toBe("אין צ'אט באתר, פניות מחוץ לשעות הפעילות אובדות");
  });

  it("own_website: אתר מת (crawl+PSI נכשלו) לא זוכה רק כי הוא לא חברתי (תיקון סקירת קוד C2)", () => {
    const f: ScanFindings = {
      business: { placeId: "p12", name: "עסק", website: "https://dead.co.il", rating: 4.5, reviewCount: 30 },
      partial: ["crawl_failed", "pagespeed_failed"], meta: META,
    };
    const rule = scoreFindings(DIMENSIONS, f).dimensions
      .find((d) => d.key === "visibility")!.rules.find((r) => r.key === "own_website")!;
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toBe("לעסק אין אתר עצמאי משלו");
  });
});

describe("score invariants after the own_website review fixes (סקירת קוד - אבן דרך 4 משימה 0)", () => {
  it("RICH: has_website (5) + own_website (15) יחד = בדיוק כמו החוק המקורי בן 20 הנקודות - אין הזזת ציון", () => {
    const vis = scoreFindings(DIMENSIONS, RICH).dimensions.find((d) => d.key === "visibility")!;
    const hasWebsite = vis.rules.find((r) => r.key === "has_website")!;
    const ownWebsite = vis.rules.find((r) => r.key === "own_website")!;
    expect(hasWebsite.earned).toBe(true);
    expect(ownWebsite.earned).toBe(true);
    expect(hasWebsite.points + ownWebsite.points).toBe(20);
  });

  it("עסק בלי אתר (מאפיה): overall=84, visibility=64 - ערכי ה-parent, לא הבאג (own_website ידוע תמיד, לא יוצא מהמכנה)", () => {
    const bakery: ScanFindings = {
      business: { placeId: "p2b", name: "מאפיית בדיקה", phone: "08-000", rating: 4.4, reviewCount: 30 },
      reviewInsights: { totalAnalyzed: 5, positiveThemes: [], problemThemes: [] },
      partial: ["no_website"],
      meta: META,
    };
    const report = scoreFindings(DIMENSIONS, bakery);
    const vis = report.dimensions.find((d) => d.key === "visibility")!;
    expect(vis.score).toBe(64);
    expect(report.overall).toBe(84);
  });

  it("אתר רשום אך crawl+PSI נכשלו (לא חברתי): overall=77, visibility=64 - own_website לא זוכה בטעות (C2)", () => {
    const deadSite: ScanFindings = {
      business: {
        placeId: "p7b", name: "עסק מת", phone: "03-000", website: "https://dead.co.il",
        rating: 3.5, reviewCount: 10,
      },
      reviewInsights: { totalAnalyzed: 5, positiveThemes: [{ theme: "שירות", count: 3 }], problemThemes: [] },
      partial: ["crawl_failed", "pagespeed_failed"],
      meta: META,
    };
    const report = scoreFindings(DIMENSIONS, deadSite);
    const vis = report.dimensions.find((d) => d.key === "visibility")!;
    expect(vis.score).toBe(64);
    expect(report.overall).toBe(77);
  });

  it("מסלול URL, אתר שבור לגמרי: overall=0, topStrengths ריק - אין מה לפרגן עליו", () => {
    const siteDown: ScanFindings = {
      business: { placeId: "", name: "x.co.il", website: "https://x.co.il/" },
      partial: ["no_gbp", "crawl_failed", "pagespeed_failed"],
      meta: META,
    };
    const report = scoreFindings(DIMENSIONS, siteDown);
    expect(report.overall).toBe(0);
    expect(report.topStrengths).toEqual([]);
  });

  it("מסעדה עם עמוד פייסבוק בלבד: has_website לא זוכה, ופער own_website מגיע ל-topGaps (לא נדחק החוצה ב-5 נק')", () => {
    const restaurant: ScanFindings = {
      business: {
        placeId: "p11", name: "מסעדה", phone: "03-111",
        website: "https://www.facebook.com/restaurant-fb", rating: 4.1, reviewCount: 12,
      },
      socialOnly: { platform: "facebook", url: "https://www.facebook.com/restaurant-fb" },
      reviewInsights: {
        totalAnalyzed: 5,
        positiveThemes: [{ theme: "אווירה נעימה", count: 3 }],
        problemThemes: [{ theme: "המתנה ארוכה", count: 2 }],
      },
      partial: ["social_only"],
      meta: META,
    };
    const report = scoreFindings(DIMENSIONS, restaurant);
    const vis = report.dimensions.find((d) => d.key === "visibility")!;
    expect(vis.rules.find((r) => r.key === "has_website")!.earned).toBe(false);
    expect(report.topGaps.map((g) => g.ruleKey)).toContain("own_website");
  });
});

// עמידה בדין הישראלי - הצהרת נגישות + בדיקת נגישות אוטומטית (תקנות נגישות השירות, ממצא מייסד:
// עסקים בישראל נתבעים על אתרים לא נגישים והיעדר הצהרה)
describe("accessibility: a11y_statement + site_a11y (הצהרת נגישות ותקנות נגישות השירות)", () => {
  const ruleOf = (f: ScanFindings, key: string) =>
    scoreFindings(DIMENSIONS, f).dimensions.find((d) => d.key === "accessibility")!.rules.find((r) => r.key === key)!;

  it("a11y_statement: known וגם earned כשיש הצהרת נגישות", () => {
    const f = structuredClone(RICH);
    f.websiteSignals!.hasAccessibilityStatement = true;
    const rule = ruleOf(f, "a11y_statement");
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(true);
    expect(rule.text).toBe("יש הצהרת נגישות באתר");
  });

  it("a11y_statement: known אבל לא earned כשאין הצהרת נגישות", () => {
    const rule = ruleOf(RICH, "a11y_statement"); // RICH לא מגדיר hasAccessibilityStatement
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toBe("אין הצהרת נגישות באתר - דרישה חוקית בישראל שעסקים נתבעים עליה, וקל לסגור אותה");
  });

  it("a11y_statement: לא ידוע כש-crawl לא שמיש (בלי אתר בכלל)", () => {
    const rule = ruleOf(THIN, "a11y_statement");
    expect(rule.known).toBe(false);
  });

  it("site_a11y: ציון PSI גבוה - earned", () => {
    const f = structuredClone(RICH);
    f.pageSpeed = { ...RICH.pageSpeed, accessibilityScore: 92 };
    const rule = ruleOf(f, "site_a11y");
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(true);
    expect(rule.text).toBe("האתר עובר בדיקת נגישות אוטומטית");
  });

  it("site_a11y: ציון PSI נמוך - gap, גם כשמותקן רכיב נגישות (רכיב לא מכסה על ציון מדוד גרוע)", () => {
    const f = structuredClone(RICH);
    f.pageSpeed = { ...RICH.pageSpeed, accessibilityScore: 40 };
    f.websiteSignals!.hasAccessibilityWidget = true;
    const rule = ruleOf(f, "site_a11y");
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(false);
    expect(rule.text).toBe("בדיקת הנגישות האוטומטית מצאה ליקויים - חשיפה משפטית וחוויה קשה לגולשים עם מוגבלות");
  });

  it("site_a11y: בלי ציון PSI אבל עם רכיב נגישות מותקן - earned (העדות הכי טובה שיש)", () => {
    const f = structuredClone(RICH);
    f.websiteSignals!.hasAccessibilityWidget = true;
    const rule = ruleOf(f, "site_a11y");
    expect(rule.known).toBe(true);
    expect(rule.earned).toBe(true);
    expect(rule.text).toBe("מותקן רכיב נגישות");
  });

  it("site_a11y: לא ידוע כשאין לא ציון ולא רכיב", () => {
    const rule = ruleOf(RICH, "site_a11y"); // RICH לא מגדיר accessibilityScore ולא hasAccessibilityWidget
    expect(rule.known).toBe(false);
  });

  it("שתי החוקים החדשים לעולם לא מציגים ספרה בטקסט (אלרגן שומר המספרים בנרטיב אוסר ציטוט לא-מאושר)", () => {
    const NO_DIGIT_RE = /\d/;
    const withScore = structuredClone(RICH);
    withScore.pageSpeed = { ...RICH.pageSpeed, accessibilityScore: 92 };
    withScore.websiteSignals!.hasAccessibilityStatement = true;
    const withWidgetOnly = structuredClone(RICH);
    withWidgetOnly.websiteSignals!.hasAccessibilityWidget = true;
    const withLowScore = structuredClone(RICH);
    withLowScore.pageSpeed = { ...RICH.pageSpeed, accessibilityScore: 10 };

    for (const key of ["a11y_statement", "site_a11y"]) {
      for (const f of [RICH, withScore, withWidgetOnly, withLowScore]) {
        const rule = ruleOf(f, key);
        if (rule.known) expect(rule.text, `${key}/${rule.text}`).not.toMatch(NO_DIGIT_RE);
      }
    }
  });
});

// ------- ממד "בשלות תהליכים" (אבן דרך 4, משימה 1) - נגזר ממודל העסק, לא מ-ScanFindings -------

function makeModel(
  data: Partial<Record<ModelSection, Record<string, unknown>>> = {},
  credits: Partial<Record<ModelSection, number>> = {},
): BusinessModel {
  return {
    data: Object.fromEntries(MODEL_SECTIONS.map((s) => [s, data[s] ?? {}])) as BusinessModel["data"],
    fieldSources: {},
    credits: Object.fromEntries(MODEL_SECTIONS.map((s) => [s, credits[s] ?? 0])) as BusinessModel["credits"],
    completenessPct: 0,
  };
}

describe("process dimension (אבן דרך 4, משימה 1)", () => {
  it("model=null: זהה לחלוטין להתנהגות שלפני המשימה (רגרסיה - חתימת ה-stub)", () => {
    for (const findings of [RICH, THIN, NO_GBP]) {
      expect(scoreWithModel(findings, null)).toEqual(scoreFindings(DIMENSIONS, findings));
      expect(scoreFindings(buildDimensions(null), findings)).toEqual(scoreFindings(DIMENSIONS, findings));
      expect(scoreFindings(buildDimensions(), findings)).toEqual(scoreFindings(DIMENSIONS, findings));
    }
    const process = scoreWithModel(RICH, null).dimensions.find((d) => d.key === "process")!;
    expect(process.score).toBeNull();
    expect(process.dataStatus).toBe("none");
    for (const r of process.rules) {
      expect(r.known).toBe(false);
      expect(r.earned).toBe(false);
      expect(r.text).toBe("");
    }
  });

  describe("lead_handling", () => {
    it("earned: מי מטפל וזמן תגובה, בלי נפילות - בסגנון אופטיקה בק", () => {
      const model = makeModel(
        { lead_flow: { whoHandles: "האישה עונה בחנות, בעל העסק עונה בערב", responseTime: "עד שעה" } },
        { lead_flow: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
      expect(rule.okText(RICH)).toContain("האישה עונה בחנות");
    });

    // סקירת קוד (סבב 2, H1): כשה-LLM בוחר שם שדה אחר מ-whoHandles/responseTime (מותר לו,
    // extract.ts לא כופה סכימה) - העדר השם הקבוע לא אמור להפוך תשובה תקינה לפער
    it("earned: טקסט מדווח בשם שדה אחר (לא whoHandles/responseTime) בלי סימני נפילה - עדיין earned", () => {
      const model = makeModel(
        { lead_flow: { intakeSummary: "מגיעות בעיקר בטלפון ובוואטסאפ, עונים באותו יום" } },
        { lead_flow: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
      // אין whoHandles/responseTime בשם הזה - okText נופל לניסוח כללי, לא משפט שבור
      expect(rule.okText(RICH)).toBe("הטיפול בפניות מסודר, אין סימני נפילה בתשובות שנאספו");
    });

    it("gap: מילת מפתח לנפילה מופיעה בטקסט המדווח (בכל שם שדה) - מצוטטת", () => {
      const model = makeModel(
        {
          lead_flow: {
            whoHandles: "בעל העסק", responseTime: "תוך יום",
            leadDrop: "פניות בפייסבוק לפעמים נופלות ולא עונים בזמן",
          },
        },
        { lead_flow: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toContain("נופלות");
    });

    it("gap: קרדיט מלא אבל שום טקסט מדווח (רק שדה boolean) - הודעה כללית", () => {
      const model = makeModel({ lead_flow: { hasContactForm: true } }, { lead_flow: 1 });
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toBe("אין תמונה מסודרת על מי מטפל בפניות ותוך כמה זמן, פניות עלולות ליפול בין הכיסאות");
    });

    it("ערכים לא-מחרוזתיים (boolean) לא הופכים דבר - רק מחרוזות נספרות", () => {
      const model = makeModel(
        { lead_flow: { whoHandles: "בעל העסק", urgentFlag: true } },
        { lead_flow: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.earned(RICH)).toBe(true);
    });

    it("unknown: קרדיט lead_flow מתחת ל-1 (רק מהסריקה)", () => {
      const model = makeModel({ lead_flow: { hasContactForm: true } }, { lead_flow: 0.5 });
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      expect(rule.known(RICH)).toBe(false);
    });

    // סקירת קוד (סבב 2, M1): responseTime הוא לרוב משפט מלא, לא משך זמן - "תוך ${responseTime}"
    // הפיק עברית שבורה ("תוך משתדלים לחזור באותו יום")
    it("okText לא מפיק עברית שבורה כש-responseTime הוא משפט מלא", () => {
      const model = makeModel(
        { lead_flow: { whoHandles: "המזכירה", responseTime: "משתדלים לחזור באותו יום" } },
        { lead_flow: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "lead_handling")!;
      const ok = rule.okText(RICH);
      expect(ok).not.toContain("תוך משתדלים");
      expect(ok).toBe("הטיפול בפניות מסודר - המזכירה. זמן תגובה: משתדלים לחזור באותו יום");
    });
  });

  describe("manual_tasks", () => {
    it("earned: קרדיט מלא ואין שום טקסט מדווח", () => {
      const model = makeModel({ manual_tasks: {} }, { manual_tasks: 1 });
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
    });

    it("earned: שלילה מפורשת ('אין עבודה ידנית') נחשבת earned גם כשהטקסט לא ריק", () => {
      const model = makeModel(
        { manual_tasks: { manualTasks: "אין עבודה ידנית, הכל עובר דרך המערכת" } },
        { manual_tasks: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
    });

    it("gap: משימות ידניות מדווחות - מצוטטות (בסגנון אופטיקה בק)", () => {
      const model = makeModel(
        { manual_tasks: { manualTasks: "רישום ביומן ידני, שיחות כשמוכן, תזכורות ידניות" } },
        { manual_tasks: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toContain("רישום ביומן ידני");
    });

    // סקירת קוד (סבב 2, H2 - תרחיש הסקירה המדויק): מסלול ה-fallback ב-extract.ts שומר
    // ownerNotes כששם השדה לא whoHandles/manualTasks - קרדיט 1 בכל זאת (הסקציה נענתה),
    // אבל הטקסט עצמו מתאר עבודה ידנית מפורשת. חייב להיות פער, לא שבח
    it("gap: מסלול fallback שומר ownerNotes (לא manualTasks) - עדיין פער, לא שבח שגוי", () => {
      const model = makeModel(
        { manual_tasks: { ownerNotes: "רישום ביומן ידני, שיחות כשמוכן, תזכורות ידניות" } },
        { manual_tasks: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toContain("רישום ביומן ידני");
    });

    it("gap: ציטוט ארוך נחתך לכ-80 תווים", () => {
      const longQuote = "משימה ידנית חוזרת ומייגעת שדורשת המון זמן כל שבוע ולא נגמרת אף פעם, ממש עומס גדול על הצוות הקטן שלנו";
      const model = makeModel({ manual_tasks: { manualTasks: longQuote } }, { manual_tasks: 1 });
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      const gap = rule.gapText(RICH);
      expect(gap).toContain("...");
      expect(gap).not.toContain(longQuote);
    });

    it("unknown: קרדיט manual_tasks 0 (הסריקה לבדה אף פעם לא מזכה סקציה זו)", () => {
      const model = makeModel();
      const rule = processRules(model).find((r) => r.key === "manual_tasks")!;
      expect(rule.known(RICH)).toBe(false);
    });
  });

  describe("internal_tools", () => {
    it("earned: יש CRM מדווח מעבר לחשבוניות", () => {
      const model = makeModel(
        { tools: { platform: "wordpress", detected: ["google_analytics"], managementTool: "יש לנו CRM לניהול לקוחות" } },
        { tools: 1 },
      );
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
    });

    it("earned: שמות כלי ניהול מוכרים (מאנדיי/פריוריטי)", () => {
      const model = makeModel({ tools: { managementTool: "עובדים עם מאנדיי ופריוריטי" } }, { tools: 1 });
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(true);
    });

    it("gap: אין CRM, רק אקסל", () => {
      const model = makeModel({ tools: { managementTool: "אין CRM, מנהלים הכל באקסל" } }, { tools: 1 });
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toContain("אקסל");
    });

    // סקירת קוד (סבב 2, M2) - ארבעת תרחישי השלילה שהשומר המקורי פספס
    it.each([
      ["אנחנו לא משתמשים ב-CRM"],
      ["ביטלנו את ה-CRM לפני שנה"],
      ["חשבנו לקנות CRM בעתיד"],
      ["אין לנו CRM, רק וורד"],
    ])("gap: שלילה מורחבת - %s", (text) => {
      const model = makeModel({ tools: { managementTool: text } }, { tools: 1 });
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.earned(RICH)).toBe(false);
    });

    it("gap: שום שדה מדווח מעבר ל-platform/detected - הודעה כללית", () => {
      const model = makeModel({ tools: { platform: "wix", detected: ["facebook_pixel"] } }, { tools: 1 });
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.known(RICH)).toBe(true);
      expect(rule.earned(RICH)).toBe(false);
      expect(rule.gapText(RICH)).toContain("אין מערכת ניהול פנימית");
    });

    it("unknown: קרדיט tools 0.5 בלבד (זוהה בסריקה, לא אושר בראיון)", () => {
      const model = makeModel({ tools: { platform: "wix", detected: [] } }, { tools: 0.5 });
      const rule = processRules(model).find((r) => r.key === "internal_tools")!;
      expect(rule.known(RICH)).toBe(false);
    });
  });

  it("buildDimensions(model): שאר הממדים זהים ל-DIMENSIONS (רק process מוחלף)", () => {
    const model = makeModel({ lead_flow: { whoHandles: "א", responseTime: "ב" } }, { lead_flow: 1 });
    const report = scoreWithModel(RICH, model);
    const legacy = scoreFindings(DIMENSIONS, RICH);
    for (const key of ["visibility", "reputation", "accessibility", "infrastructure"] as const) {
      expect(report.dimensions.find((d) => d.key === key)).toEqual(legacy.dimensions.find((d) => d.key === key));
    }
    const process = report.dimensions.find((d) => d.key === "process")!;
    expect(process.score).not.toBeNull();
  });
});
