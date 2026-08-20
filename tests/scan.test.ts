import { describe, it, expect, vi } from "vitest";
import { runScan, type ScanDeps } from "../src/pipeline/scan";
import { crawlWebsite } from "../src/pipeline/crawler/crawl";
import { collectHealth } from "../src/pipeline/health";
import type { DomainHealth, MailHealth, PlaceDetails, SafeBrowsingCheck, WebsiteSignals } from "../src/pipeline/types";

const RICH_DETAILS: PlaceDetails = {
  placeId: "pid-1", name: "מוסך הצפון", phone: "04-1234567",
  website: "https://example.co.il", rating: 4.6, reviewCount: 23,
  reviews: [
    { rating: 5, text: "שירות מעולה" },
    { rating: 2, text: "חיכיתי שבוע לתשובה" },
    { rating: 4, text: "מקצועיים" },
    { rating: 3, text: "בסדר גמור" },
    { rating: 5, text: "אמינים" },
  ],
};

const RICH_SIGNALS: WebsiteSignals = {
  pagesCrawled: 3, crawledUrls: ["https://example.co.il"],
  hasContactForm: true, hasWhatsappLink: false, hasPhoneLink: true,
  hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
  hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
};

function richDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    details: vi.fn().mockResolvedValue(RICH_DETAILS),
    // בדיקות אופליין: לעולם לא DNS או whois אמיתיים
    health: vi.fn().mockResolvedValue({ failures: [] }),
    crawl: vi.fn().mockResolvedValue(RICH_SIGNALS),
    pagespeed: vi.fn().mockResolvedValue({ performanceScore: 42, seoScore: 90, lcpMs: 4100 }),
    analyzeReviews: vi.fn().mockResolvedValue({
      insights: {
        totalAnalyzed: 5,
        positiveThemes: [{ theme: "שירות אדיב", count: 3 }],
        problemThemes: [{ theme: "זמני תגובה איטיים", count: 1 }],
      },
      usage: { inputTokens: 500, outputTokens: 60 },
    }),
    ...overrides,
  };
}

describe("runScan", () => {
  it("produces full findings for a rich-footprint business", async () => {
    const findings = await runScan("pid-1", richDeps());
    expect(findings.business).toEqual({
      placeId: "pid-1", name: "מוסך הצפון", phone: "04-1234567",
      website: "https://example.co.il", rating: 4.6, reviewCount: 23,
    });
    expect(findings.websiteSignals?.platform).toBe("wordpress");
    expect(findings.pageSpeed?.performanceScore).toBe(42);
    expect(findings.reviewInsights?.totalAnalyzed).toBe(5);
    expect(findings.partial).toEqual([]);
    expect(findings.meta.placesCalls).toBe(1);
    expect(findings.meta.llmInputTokens).toBe(500);
    expect(findings.meta.llmOutputTokens).toBe(60);
    expect(findings.meta.estCostUsd).toBe(0.03);
    expect(typeof findings.meta.durationMs).toBe("number");
    expect(new Date(findings.meta.startedAt).getTime()).not.toBeNaN();
  });

  it("never leaks raw review text into the findings JSON (Google ToS)", async () => {
    const findings = await runScan("pid-1", richDeps());
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("חיכיתי שבוע לתשובה");
    expect(serialized).not.toContain("שירות מעולה");
  });

  it("runs crawl and pagespeed in parallel, not sequentially", async () => {
    const order: string[] = [];
    const deps = richDeps({
      crawl: vi.fn(async () => {
        order.push("crawl-start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("crawl-end");
        return RICH_SIGNALS;
      }),
      pagespeed: vi.fn(async () => {
        order.push("psi-start");
        return { performanceScore: 1, seoScore: 1, lcpMs: 1 };
      }),
    });
    await runScan("pid-1", deps);
    // PSI התחיל לפני שה-crawl הסתיים - כלומר רצו במקביל
    expect(order.indexOf("psi-start")).toBeLessThan(order.indexOf("crawl-end"));
  });

  it("degrades gracefully for a thin-footprint business (no website, few reviews)", async () => {
    const thin: PlaceDetails = {
      placeId: "pid-2", name: "אינסטלטור דוד", phone: "050-1111111",
      website: undefined, rating: 5, reviewCount: 2,
      reviews: [{ rating: 5, text: "מקצוען" }],
    };
    const deps = richDeps({ details: vi.fn().mockResolvedValue(thin) });
    const findings = await runScan("pid-2", deps);
    expect(deps.crawl).not.toHaveBeenCalled();
    expect(deps.pagespeed).not.toHaveBeenCalled();
    expect(findings.websiteSignals).toBeUndefined();
    expect(findings.pageSpeed).toBeUndefined();
    expect(findings.partial).toEqual(["no_website", "few_reviews"]);
    expect(findings.reviewInsights).toBeDefined(); // מנתחים גם ביקורת אחת
  });

  it("records partial flags instead of failing when sub-steps throw", async () => {
    const deps = richDeps({
      crawl: vi.fn().mockRejectedValue(new Error("boom")),
      pagespeed: vi.fn().mockRejectedValue(new Error("psi down")),
      analyzeReviews: vi.fn().mockRejectedValue(new Error("llm down")),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partial).toContain("pagespeed_failed");
    expect(findings.partial).toContain("review_analysis_failed");
    expect(findings.websiteSignals).toBeUndefined();
    expect(findings.reviewInsights).toBeUndefined();
    expect(findings.business.name).toBe("מוסך הצפון"); // האבחון עדיין מחזיר ממצאים
    expect(findings.meta.llmInputTokens).toBe(0);
    expect(findings.partialDetails?.crawl_failed).toContain("boom");
  });

  // המסלול הזה לא עובר בכלל בבדיקת ה-API: details.website מגיע מגוגל, ונסרק כמו שהוא.
  // ההגנה היחידה שמכסה אותו היא בשכבת ה-fetch, ולכן היא נבדקת כאן מקצה לקצה
  it("refuses a Places-sourced website that points at an internal host, and still returns a report", async () => {
    const fetchImpl = vi.fn();
    // ליטרל פנימי נופל בשער התחבירי עוד לפני DNS; ה-resolver המזויף רק מבטיח אופליין
    const lookupImpl = vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]);
    const deps = richDeps({
      details: vi.fn().mockResolvedValue({ ...RICH_DETAILS, website: "http://127.0.0.1:6379/" }),
      crawl: (siteUrl: string) => crawlWebsite(siteUrl, { fetchImpl, lookupImpl }),
    });
    const findings = await runScan("pid-1", deps);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partialDetails?.crawl_failed).toContain("127.0.0.1");
    expect(findings.partialDetails?.crawl_failed).not.toContain("6379");
    expect(findings.business.name).toBe("מוסך הצפון"); // הדוח עדיין נבנה
    expect(findings.reviewInsights?.totalAnalyzed).toBe(5);
  });

  it("propagates a details failure (nothing to scan without the business)", async () => {
    const deps = richDeps({
      details: vi.fn().mockRejectedValue(new Error("Places details HTTP 403")),
    });
    await expect(runScan("pid-1", deps)).rejects.toThrow(/403/);
  });

  it("counts prior places calls in the cost meter", async () => {
    const findings = await runScan("pid-1", richDeps(), { priorPlacesCalls: 1 });
    expect(findings.meta.placesCalls).toBe(2);
    expect(findings.meta.estCostUsd).toBeCloseTo(0.06);
  });

  it("adds a js_rendered partial flag when the crawler flags it", async () => {
    const deps = richDeps({
      crawl: vi.fn().mockResolvedValue({ ...RICH_SIGNALS, jsRendered: true }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("js_rendered");
  });

  it("flags no_review_text when a rated business has no review texts", async () => {
    const rated: PlaceDetails = { ...RICH_DETAILS, reviews: [] };
    const deps = richDeps({
      details: vi.fn().mockResolvedValue(rated),
      analyzeReviews: vi.fn().mockResolvedValue({
        insights: { totalAnalyzed: 0, positiveThemes: [], problemThemes: [] },
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("no_review_text");
    expect(findings.partial).not.toContain("few_reviews"); // reviewCount=23 - העסק לא "דל ביקורות"
  });
});

// אבן דרך 4, משימה 0.7: payload גולמי לשימוש עתידי (scan.raw)
describe("runScan - raw payload", () => {
  it("collects placeDetails/pageSpeed/crawledUrls raw when the collectors provide it, without leaking raw into findings.business/pageSpeed", async () => {
    const detailsRaw = { id: "pid-1", nationalPhoneNumber: "04-1234567" };
    const pageSpeedRaw = { categories: { performance: { score: 0.42 } }, metrics: { lcp: 4100 } };
    const deps = richDeps({
      details: vi.fn().mockResolvedValue({ ...RICH_DETAILS, address: "העצמאות 1, חיפה", raw: detailsRaw }),
      pagespeed: vi.fn().mockResolvedValue({ performanceScore: 42, seoScore: 90, lcpMs: 4100, raw: pageSpeedRaw }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.business.address).toBe("העצמאות 1, חיפה");
    expect(findings.raw).toEqual({
      placeDetails: detailsRaw,
      pageSpeed: pageSpeedRaw,
      crawledUrls: RICH_SIGNALS.crawledUrls,
    });
    // findings.pageSpeed נשאר נקי - בלי raw מוטבע בתוכו (אין כפילות)
    expect(findings.pageSpeed).toEqual({ performanceScore: 42, seoScore: 90, lcpMs: 4100 });
    expect((findings.pageSpeed as { raw?: unknown }).raw).toBeUndefined();
  });

  it("still captures placeDetails raw on the social-only route (Places always runs there); crawl/PSI raw stay absent", async () => {
    const detailsRaw = { id: "pid-1", websiteUri: "https://www.facebook.com/business-social" };
    const crawl = vi.fn();
    const pagespeed = vi.fn();
    const deps = richDeps({
      details: vi.fn().mockResolvedValue({
        ...RICH_DETAILS, website: "https://www.facebook.com/business-social", raw: detailsRaw,
      }),
      crawl, pagespeed,
    });
    const findings = await runScan("pid-1", deps);
    expect(crawl).not.toHaveBeenCalled();
    expect(pagespeed).not.toHaveBeenCalled();
    expect(findings.raw).toEqual({ placeDetails: detailsRaw, pageSpeed: undefined, crawledUrls: undefined });
  });

  it("findings.raw is undefined when no collector supplies raw data (e.g. mocks without it)", async () => {
    const findings = await runScan("pid-2", richDeps({
      details: vi.fn().mockResolvedValue({
        placeId: "pid-2", name: "אינסטלטור דוד", website: undefined, rating: 5, reviewCount: 2,
        reviews: [{ rating: 5, text: "מקצוען" }],
      }),
    }));
    expect(findings.raw).toBeUndefined();
  });
});

// משימה 3 (תחקיר 21.8): סריקת ייצור חזרה בלי מפתח health והסיבות נבלעו בשקט. מעכשיו
// כל דחייה של תת-בדיקה נרשמת בהערות האיסוף - והשדה נשאר חסר, "לא נבדק", לעולם לא ממצא
describe("runScan - נראות לכשלי בדיקות התקינות", () => {
  const OK_DOMAIN: DomainHealth = { registrar: "רשם לדוגמה", daysToExpiry: 200 };
  const OK_MAIL: MailHealth = { hasMx: true, hasSpf: true };
  const OK_SB: SafeBrowsingCheck = { flagged: false, checkedAt: "2026-08-21T00:00:00.000Z" };

  // המסלול האמיתי מקצה לקצה: collectHealth עם תת-בדיקות מוזרקות (אפס רשת), דחייה אחת בכל פעם
  it("whois rejection: the reason reaches the collection notes and the domain field stays missing", async () => {
    const deps = richDeps({
      health: (siteUrl) => collectHealth(siteUrl, {
        domain: () => Promise.reject(new Error("connect ETIMEDOUT 43")),
        mail: async () => OK_MAIL,
        safeBrowsing: async () => OK_SB,
      }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("health_domain_failed");
    expect(findings.partialDetails?.health_domain_failed).toContain("ETIMEDOUT");
    expect(findings.health?.domain).toBeUndefined(); // חסר = "לא נבדק", לא קביעה שלילית
    expect(findings.health?.mail).toEqual(OK_MAIL); // הכשל לא הפיל את שכנותיה
    expect(findings.health?.safeBrowsing).toEqual(OK_SB);
  });

  it("dns rejection: the reason reaches the collection notes and the mail field stays missing", async () => {
    const deps = richDeps({
      health: (siteUrl) => collectHealth(siteUrl, {
        domain: async () => OK_DOMAIN,
        mail: () => Promise.reject(new Error("queryTxt ESERVFAIL")),
        safeBrowsing: async () => OK_SB,
      }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("health_mail_failed");
    expect(findings.partialDetails?.health_mail_failed).toContain("ESERVFAIL");
    expect(findings.health?.mail).toBeUndefined();
    expect(findings.health?.domain).toEqual(OK_DOMAIN);
  });

  it("safe browsing rejection: the reason reaches the collection notes and the field stays missing", async () => {
    const deps = richDeps({
      health: (siteUrl) => collectHealth(siteUrl, {
        domain: async () => OK_DOMAIN,
        mail: async () => OK_MAIL,
        safeBrowsing: () => Promise.reject(new Error("Web Risk HTTP 403")),
      }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("health_safebrowsing_failed");
    expect(findings.partialDetails?.health_safebrowsing_failed).toContain("403");
    expect(findings.health?.safeBrowsing).toBeUndefined();
    expect(findings.health?.domain).toEqual(OK_DOMAIN);
  });

  it("records health_failed when deps.health itself rejects, and findings.health stays absent", async () => {
    const deps = richDeps({
      health: vi.fn().mockRejectedValue(new Error("health infra down")),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toContain("health_failed");
    expect(findings.partialDetails?.health_failed).toContain("health infra down");
    expect(findings.health).toBeUndefined(); // RICH_SIGNALS בלי schema - אין מה למזג
    expect(findings.business.name).toBe("מוסך הצפון"); // הסריקה עצמה לא נפלה
  });

  it("success adds no collection note at all", async () => {
    const deps = richDeps({
      health: vi.fn().mockResolvedValue({
        signals: { domain: OK_DOMAIN, mail: OK_MAIL, safeBrowsing: OK_SB },
        failures: [],
      }),
    });
    const findings = await runScan("pid-1", deps);
    expect(findings.partial).toEqual([]);
    expect(findings.partialDetails).toBeUndefined();
    expect(findings.health?.domain).toEqual(OK_DOMAIN);
    expect(findings.health?.mail).toEqual(OK_MAIL);
    expect(findings.health?.safeBrowsing).toEqual(OK_SB);
  });
});
