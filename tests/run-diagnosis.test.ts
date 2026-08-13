import { describe, expect, it } from "vitest";
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
