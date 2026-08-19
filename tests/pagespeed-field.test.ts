import { describe, it, expect, vi } from "vitest";
import { runPageSpeed } from "../src/pipeline/google/pagespeed";
import { DIMENSIONS } from "../src/pipeline/score/dimensions";
import { scoreFindings } from "../src/pipeline/score/engine";
import type { FieldExperience, ScanFindings } from "../src/pipeline/types";

// נתוני שדה (CrUX) מול נתוני מעבדה. הבאג שהמבחנים האלה נועלים: ריצת lab יחידה האשימה
// שלושה אתרים ישראליים אמיתיים באיטיות (8.0 / 15.9 / 53.4 שניות) בזמן שמדידת גוגל על
// גולשים אמיתיים באותם אתרים החזירה 1.28 / 1.58 / 1.90 שניות. השדה כבר הגיע בתשובת PSI
// ונשמר ב-raw, אבל אף אחד לא קרא אותו, ולכן הדוח הציג האשמת שווא.

const META = { startedAt: "", durationMs: 0, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 };

function psiResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

// גוף PSI מינימלי עם lab איטי - כדי שכל מה שמשתנה בין המקרים הוא נתון השדה
function slowLabBody(extra: Record<string, unknown>) {
  return {
    lighthouseResult: {
      categories: { performance: { score: 0.26 } },
      audits: { "largest-contentful-paint": { numericValue: 15882 } },
    },
    ...extra,
  };
}

function runWith(body: unknown) {
  const fetchImpl = vi.fn(async () => psiResponse(body));
  return runPageSpeed("https://example.co.il", { apiKey: "k", fetchImpl });
}

// אתר שה-lab מאשים באיטיות: ציון 26, טעינה 15.9 שניות
function findingsWith(field?: FieldExperience): ScanFindings {
  return {
    business: { placeId: "p", name: "עסק", website: "https://example.co.il" },
    websiteSignals: {
      pagesCrawled: 4, crawledUrls: [], hasContactForm: true, hasWhatsappLink: true,
      hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
      hasFacebookPixel: false, hasGoogleAnalytics: true, jsRendered: false,
    },
    pageSpeed: { performanceScore: 26, seoScore: 95, lcpMs: 15882, field },
    partial: [],
    meta: META,
  };
}

// perf ו-lcp חיים תחת "נראות דיגיטלית" (אתר שלא נטען הוא אתר שלא נראה)
function ruleOf(findings: ScanFindings, key: string) {
  const visibility = scoreFindings(DIMENSIONS, findings).dimensions.find((d) => d.key === "visibility")!;
  return visibility.rules.find((r) => r.key === key)!;
}

describe("קריאת נתוני שדה מתשובת PSI", () => {
  it("קורא אחוזון 75, קטגוריית LCP וקטגוריה כוללת ברמת העמוד", async () => {
    const result = await runWith(slowLabBody({
      loadingExperience: {
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1281, category: "FAST" } },
        overall_category: "FAST",
      },
    }));
    expect(result.field).toEqual({ lcpMs: 1281, lcpCategory: "FAST", overall: "FAST", scope: "page" });
    // ה-lab נשמר כמו שהוא - הוא לא נמחק, הוא רק מפסיק להיות העדות הקובעת
    expect(result.performanceScore).toBe(26);
    expect(result.lcpMs).toBe(15882);
  });

  it("אין נתון לעמוד אבל יש למקור: נלקח נתון המקור ומסומן ככזה", async () => {
    const result = await runWith(slowLabBody({
      loadingExperience: { metrics: {} },
      originLoadingExperience: {
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1576, category: "FAST" } },
        overall_category: "AVERAGE",
      },
    }));
    expect(result.field).toEqual({ lcpMs: 1576, lcpCategory: "FAST", overall: "AVERAGE", scope: "origin" });
  });

  it("גוגל סימנה origin_fallback על נתון העמוד: הנתון תקף אבל היקפו מקור", async () => {
    const result = await runWith(slowLabBody({
      loadingExperience: {
        origin_fallback: true,
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1900, category: "FAST" } },
        overall_category: "FAST",
      },
    }));
    expect(result.field?.scope).toBe("origin");
    expect(result.field?.lcpMs).toBe(1900);
  });

  it("אין די תנועה: אין נתון שדה כלל, וזה לא הופך לשום טענה", async () => {
    const noField = await runWith(slowLabBody({}));
    expect(noField.field).toBeUndefined();

    // גוגל מחזירה לפעמים את המבנה בלי metrics - גם זה אינו נתון
    const emptyShape = await runWith(slowLabBody({
      loadingExperience: { id: "https://example.co.il/", initial_url: "https://example.co.il/" },
    }));
    expect(emptyShape.field).toBeUndefined();
  });

  it("ערך קטגוריה שלא מוכר לנו נזרק ולא מתפרש", async () => {
    const result = await runWith(slowLabBody({
      loadingExperience: {
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400, category: "MEDIOCRE" } },
        overall_category: "SOMETHING_NEW",
      },
    }));
    expect(result.field).toEqual({ lcpMs: 2400, lcpCategory: undefined, overall: undefined, scope: "page" });
  });
});

describe("הניקוד: מדידת גולשים אמיתיים גוברת על המעבדה", () => {
  it("lab מאשים באיטיות ושדה אומר שהאתר מהיר: אין פער, לא בביצועים ולא בטעינה", () => {
    const findings = findingsWith({ lcpMs: 1281, lcpCategory: "FAST", overall: "FAST", scope: "page" });

    const perf = ruleOf(findings, "perf");
    expect(perf.known).toBe(true);
    expect(perf.earned).toBe(true);
    expect(perf.text).toContain("גולשים אמיתיים");
    // ההאשמה עצמה: הציון 26 לא מוצג יותר כפער
    expect(perf.text).not.toContain("26");

    const lcp = ruleOf(findings, "lcp");
    expect(lcp.earned).toBe(true);
    expect(lcp.text).toContain("1.3");
    expect(lcp.text).not.toContain("15.9");
  });

  it("השדה אומר שהאתר איטי: הפער כן נאמר, ובמספר של המבקרים האמיתיים", () => {
    const findings = findingsWith({ lcpMs: 6200, lcpCategory: "SLOW", overall: "SLOW", scope: "page" });

    const lcp = ruleOf(findings, "lcp");
    expect(lcp.known).toBe(true);
    expect(lcp.earned).toBe(false);
    expect(lcp.text).toContain("6.2");
    // המספר של המעבדה לא מוצג כשיש מדידה אמיתית טובה ממנו
    expect(lcp.text).not.toContain("15.9");

    const perf = ruleOf(findings, "perf");
    expect(perf.earned).toBe(false);
  });

  it("שדה בינוני לא משתיק את המעבדה: פער נשאר פער", () => {
    const findings = findingsWith({ lcpMs: 4500, lcpCategory: "AVERAGE", overall: "AVERAGE", scope: "origin" });
    expect(ruleOf(findings, "perf").earned).toBe(false);
    expect(ruleOf(findings, "lcp").earned).toBe(false);
  });

  it("בלי נתון שדה ההתנהגות זהה לחלוטין למה שהיה קודם (רגרסיה)", () => {
    const findings = findingsWith(undefined);

    const perf = ruleOf(findings, "perf");
    expect(perf.known).toBe(true);
    expect(perf.earned).toBe(false);
    expect(perf.text).toContain("26");

    const lcp = ruleOf(findings, "lcp");
    expect(lcp.known).toBe(true);
    expect(lcp.earned).toBe(false);
    expect(lcp.text).toContain("15.9");
  });

  it("יש שדה מהיר בלי נתון מעבדה בכלל: עדיין ידוע, ועדיין לא פער", () => {
    const findings = findingsWith({ lcpMs: 1576, lcpCategory: "FAST", overall: "FAST", scope: "origin" });
    findings.pageSpeed = { field: findings.pageSpeed!.field };

    const perf = ruleOf(findings, "perf");
    expect(perf.known).toBe(true);
    expect(perf.earned).toBe(true);

    const lcp = ruleOf(findings, "lcp");
    expect(lcp.known).toBe(true);
    expect(lcp.earned).toBe(true);
  });

  it("קטגוריה כוללת חסרה: קטגוריית ה-LCP היא הקירוב, ורק היא", () => {
    const onlyLcpFast = findingsWith({ lcpMs: 1281, lcpCategory: "FAST", scope: "page" });
    expect(ruleOf(onlyLcpFast, "perf").earned).toBe(true);

    // קטגוריה כוללת קיימת וגרועה גוברת על LCP מהיר - לא בוחרים את מה שנוח
    const overallSlow = findingsWith({ lcpMs: 1281, lcpCategory: "FAST", overall: "SLOW", scope: "page" });
    expect(ruleOf(overallSlow, "perf").earned).toBe(false);
  });
});
