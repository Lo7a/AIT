import { describe, expect, it, vi } from "vitest";
import { runDiagnosis, DiagnoseFailed } from "../src/server/run-diagnosis";
import type { DiagnoseEvent } from "../src/server/diagnose-events";
import type { ScanDeps } from "../src/pipeline/scan";
import type { WebsiteOnlyDeps } from "../src/pipeline/scan-website";
import { makeFakeDb } from "./fakes/fake-db";

const happyScanDeps: ScanDeps = {
  details: async () => ({
    placeId: "p1", name: "עסק בדיקה", website: "https://x.co.il", phone: "03-1234567",
    rating: 4.4, reviewCount: 8,
    reviews: [{ rating: 5, text: "שירות" }],
  }),
  crawl: async () => ({
    pagesCrawled: 3, crawledUrls: ["https://x.co.il"], hasContactForm: true, hasWhatsappLink: false,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
  }),
  pagespeed: async () => ({ performanceScore: 60, lcpMs: 4000 }),
  analyzeReviews: async () => ({
    insights: { totalAnalyzed: 1, positiveThemes: [{ theme: "שירות אדיב", count: 1 }], problemThemes: [] },
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
};

// נרטיב מוזרק: JSON תקין — לא מפעיל LLM חי ולא תלוי בפרטי ה-guard
const fakeComplete = async () => ({
  data: { headline: "כותרת", summary: "סיכום", gapExplanations: [] },
  usage: { inputTokens: 10, outputTokens: 10 },
});

function collect() {
  const events: DiagnoseEvent[] = [];
  return { events, onEvent: (e: DiagnoseEvent) => events.push(e) };
}

describe("runDiagnosis — מסלול Places", () => {
  it("מסיים ב-report_ready עם סדר מעברים מלא ופולט אירועים בסדר הנכון", async () => {
    const { db, transitions, scans, businesses } = makeFakeDb();
    const { events, onEvent } = collect();
    const outcome = await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק בדיקה" }, {
      onEvent, scanDeps: happyScanDeps, narrativeOptions: { complete: fakeComplete },
    });

    expect(transitions).toEqual(["created→scanning", "scanning→scanned", "scanned→report_ready"]);
    expect(outcome.score.overall).not.toBeNull();
    expect(outcome.diagnosisId).toBeTruthy();
    expect(scans).toHaveLength(1);
    // פרובננס הנרטיב נשמר (משימה 1)
    expect(scans[0].narrative).toHaveProperty("usedFallback");

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("created");
    expect(types[types.length - 1]).toBe("done");
    const stepKeys = events.filter((e) => e.type === "step").map((e) => (e as { key: string }).key);
    expect(stepKeys[0]).toBe("details");
    expect(stepKeys).toEqual(expect.arrayContaining(["crawl", "pagespeed", "reviews", "score", "narrative", "save"]));

    // backfill: האתר שהתגלה בסריקה נכתב לשורת העסק
    expect(businesses[0].website).toBe("https://x.co.il");
  });

  it("כישלון פרטי העסק — חזרה ל-created, השגיאה המקורית נזרקת, אין scan", async () => {
    const { db, transitions, scans } = makeFakeDb();
    const deps: ScanDeps = { ...happyScanDeps, details: async () => { throw new Error("Places נפל"); } };
    await expect(runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק" }, {
      scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    })).rejects.toThrow("Places נפל");
    expect(transitions).toEqual(["created→scanning", "scanning→created"]);
    expect(scans).toHaveLength(0);
  });

  it("dep בודד שנופל (crawl) לא מפיל אבחון — נגמר report_ready עם step_done ok:false", async () => {
    const { db, transitions } = makeFakeDb();
    const { events, onEvent } = collect();
    const deps: ScanDeps = { ...happyScanDeps, crawl: async () => { throw new Error("timeout"); } };
    await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק" }, {
      onEvent, scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    });
    expect(transitions[transitions.length - 1]).toBe("scanned→report_ready");
    const crawlDone = events.find((e) => e.type === "step_done" && e.key === "crawl");
    expect(crawlDone).toMatchObject({ ok: false });
  });
});

describe("runDiagnosis — מסלול URL", () => {
  const happyWebDeps: WebsiteOnlyDeps = {
    crawl: happyScanDeps.crawl,
    pagespeed: happyScanDeps.pagespeed,
  };

  it("מסיים ב-report_ready; העסק נוצר עם websiteKey מנורמל ו-website יציב (origin)", async () => {
    const { db, transitions, businesses } = makeFakeDb();
    await runDiagnosis(db, { kind: "url", url: "https://www.x.co.il/" }, {
      websiteDeps: happyWebDeps, narrativeOptions: { complete: fakeComplete },
    });
    expect(transitions).toEqual(["created→scanning", "scanning→scanned", "scanned→report_ready"]);
    expect(businesses[0].websiteKey).toBe("x.co.il");
    // זהות יציבה (משימה 3): נשמר origin, לא href עם path
    expect(businesses[0].website).toBe("https://www.x.co.il");
  });

  it("כישלון כפול (crawl+PSI) — DiagnoseFailed, חזרה ל-created, אין scan", async () => {
    const { db, transitions, scans } = makeFakeDb();
    const deps: WebsiteOnlyDeps = {
      crawl: async () => { throw new Error("down"); },
      pagespeed: async () => { throw new Error("down"); },
    };
    await expect(runDiagnosis(db, { kind: "url", url: "https://x.co.il" }, {
      websiteDeps: deps, narrativeOptions: { complete: fakeComplete },
    })).rejects.toThrow(DiagnoseFailed);
    // הכישלון הכפול מזוהה בתוך ה-try, לפני המעבר ל-scanned (scanned→created אינו מעבר חוקי)
    expect(transitions).toEqual(["created→scanning", "scanning→created"]);
    expect(scans).toHaveLength(0);
  });

  it("url לא תקין — נזרק לפני כל כתיבה ל-DB", async () => {
    const { db, diagnoses } = makeFakeDb();
    await expect(runDiagnosis(db, { kind: "url", url: "mailto:x@y.co.il" }, {}))
      .rejects.toThrow();
    expect(diagnoses).toHaveLength(0);
  });
});

describe("runDiagnosis — עמידות בפני onEvent שזורק", () => {
  it("onEvent שזורק על כל קריאה לא משבש נתונים — מגיע ל-report_ready בלי דגלי כישלון שקריים", async () => {
    const { db, transitions, scans } = makeFakeDb();
    const throwingOnEvent = () => { throw new Error("Controller is already closed"); };
    const outcome = await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק בדיקה" }, {
      onEvent: throwingOnEvent, scanDeps: happyScanDeps, narrativeOptions: { complete: fakeComplete },
    });

    expect(transitions).toEqual(["created→scanning", "scanning→scanned", "scanned→report_ready"]);
    expect(scans).toHaveLength(1);
    // צרכן שנופל לא הופך dep שהצליח לדגל partial שקרי
    expect(outcome.findings.partial).not.toContain("crawl_failed");
    expect(outcome.findings.partial).not.toContain("pagespeed_failed");
  });

  it("done נפלט אחרי ה-backfill — website כבר מעודכן ברגע שאירוע done נשלח", async () => {
    const { db, businesses } = makeFakeDb();
    let websiteAtDone: string | null | undefined;
    const onEvent = (e: DiagnoseEvent) => {
      if (e.type === "done") websiteAtDone = businesses[0]?.website;
    };
    await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק בדיקה" }, {
      onEvent, scanDeps: happyScanDeps, narrativeOptions: { complete: fakeComplete },
    });
    expect(websiteAtDone).toBe("https://x.co.il");
  });
});

describe("runDiagnosis — כישלון גם ב-revert", () => {
  it("updateMany נכשל גם על scanning→created — השגיאה המקורית (לא שגיאת ה-revert) ממשיכה להיזרק", async () => {
    const { db, transitions } = makeFakeDb({ failTransitions: new Set(["scanning→created"]) });
    const deps: ScanDeps = { ...happyScanDeps, details: async () => { throw new Error("Places נפל"); } };
    await expect(runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק" }, {
      scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    })).rejects.toThrow("Places נפל");
    // ה-revert עצמו נכשל (updateMany מדומה count:0) — לא נרשם כמעבר מוצלח
    expect(transitions).toEqual(["created→scanning"]);
  });
});

describe("runDiagnosis — עסק בלי אתר", () => {
  it("crawl/pagespeed מסומנים skipped עם הסבר 'לעסק אין אתר', בלי דגלי כישלון", async () => {
    const { db } = makeFakeDb();
    const { events, onEvent } = collect();
    const deps: ScanDeps = {
      ...happyScanDeps,
      details: async () => ({
        placeId: "p1", name: "עסק בלי אתר", website: undefined, rating: 4.2, reviewCount: 12,
        reviews: [{ rating: 5, text: "מעולה" }],
      }),
    };
    const outcome = await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק בלי אתר" }, {
      onEvent, scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    });

    const crawlDone = events.find((e) => e.type === "step_done" && e.key === "crawl");
    const pagespeedDone = events.find((e) => e.type === "step_done" && e.key === "pagespeed");
    expect(crawlDone).toMatchObject({ ok: false, detail: "לעסק אין אתר" });
    expect(pagespeedDone).toMatchObject({ ok: false, detail: "לעסק אין אתר" });
    // "אין אתר" הוא ידוע-מראש, לא כישלון dep בפועל — לא דגלי crawl_failed/pagespeed_failed
    expect(outcome.findings.partial).not.toContain("crawl_failed");
    expect(outcome.findings.partial).not.toContain("pagespeed_failed");
  });
});

describe("runDiagnosis - נוכחות חברתית כ'אתר' (אבן דרך 4, משימה 0)", () => {
  const explodingWebsiteDeps: WebsiteOnlyDeps = {
    crawl: async () => { throw new Error("crawl לא אמור להיקרא בכלל על עמוד חברתי"); },
    pagespeed: async () => { throw new Error("pagespeed לא אמור להיקרא בכלל על עמוד חברתי"); },
  };

  it("מסלול Places: ה-website הרשום בגוגל הוא עמוד פייסבוק - מדלגים על crawl+PSI לגמרי, socialOnly נכנס ל-findings", async () => {
    const { db } = makeFakeDb();
    const { events, onEvent } = collect();
    const crawl = vi.fn(happyScanDeps.crawl);
    const pagespeed = vi.fn(happyScanDeps.pagespeed);
    const deps: ScanDeps = {
      ...happyScanDeps,
      details: async () => ({
        placeId: "p1", name: "בית קפה", website: "https://www.facebook.com/business-social",
        phone: "03-0000000", rating: 4.6, reviewCount: 40,
        reviews: [{ rating: 5, text: "מעולה" }],
      }),
      crawl, pagespeed,
    };
    const outcome = await runDiagnosis(db, { kind: "places", placeId: "p1", name: "בית קפה" }, {
      onEvent, scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    });

    expect(crawl).not.toHaveBeenCalled();
    expect(pagespeed).not.toHaveBeenCalled();
    expect(outcome.findings.socialOnly).toEqual({ platform: "facebook", url: "https://www.facebook.com/business-social" });
    expect(outcome.findings.partial).toContain("social_only");
    // הערת האיסוף עם שם הפלטפורמה בפועל חייבת להישמר - בעל העסק צריך לראות "עמוד פייסבוק", לא רק דגל ריק
    expect(outcome.findings.partialDetails?.social_only).toBe("הנוכחות הדיגיטלית היא עמוד פייסבוק - אין אתר עצמאי לסריקה");
    expect(outcome.findings.partial).not.toContain("crawl_failed");
    expect(outcome.findings.partial).not.toContain("pagespeed_failed");

    const crawlDone = events.find((e) => e.type === "step_done" && e.key === "crawl");
    const pagespeedDone = events.find((e) => e.type === "step_done" && e.key === "pagespeed");
    expect(crawlDone).toMatchObject({ ok: false });
    expect(pagespeedDone).toMatchObject({ ok: false });
  });

  it("מסלול URL: הכתובת שהוזנה היא עצמה עמוד פייסבוק - מדלגים על crawl+PSI, socialOnly נכנס ל-findings", async () => {
    const { db } = makeFakeDb();
    const { events, onEvent } = collect();
    const outcome = await runDiagnosis(db, { kind: "url", url: "https://www.facebook.com/business-social" }, {
      onEvent, websiteDeps: explodingWebsiteDeps, narrativeOptions: { complete: fakeComplete },
    });

    expect(outcome.findings.socialOnly).toEqual({ platform: "facebook", url: "https://www.facebook.com/business-social" });
    expect(outcome.findings.partial).toContain("social_only");
    expect(outcome.findings.partialDetails?.social_only).toBe("הנוכחות הדיגיטלית היא עמוד פייסבוק - אין אתר עצמאי לסריקה");
    const crawlDone = events.find((e) => e.type === "step_done" && e.key === "crawl");
    const pagespeedDone = events.find((e) => e.type === "step_done" && e.key === "pagespeed");
    expect(crawlDone).toMatchObject({ ok: false });
    expect(pagespeedDone).toMatchObject({ ok: false });
  });

  it("מסלול URL: שני עמודי פייסבוק שונים יוצרים שני עסקים עם websiteKey שונה (באג הזהות שתוקן)", async () => {
    const { db, businesses } = makeFakeDb();
    await runDiagnosis(db, { kind: "url", url: "https://www.facebook.com/business-one" }, {
      websiteDeps: explodingWebsiteDeps, narrativeOptions: { complete: fakeComplete },
    });
    await runDiagnosis(db, { kind: "url", url: "https://www.facebook.com/business-two" }, {
      websiteDeps: explodingWebsiteDeps, narrativeOptions: { complete: fakeComplete },
    });

    expect(businesses).toHaveLength(2);
    expect(businesses[0].websiteKey).toBe("facebook.com/business-one");
    expect(businesses[1].websiteKey).toBe("facebook.com/business-two");
    expect(businesses[0].websiteKey).not.toBe(businesses[1].websiteKey);
  });
});
