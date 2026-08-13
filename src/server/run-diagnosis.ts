import type { PrismaClient } from "@prisma/client";
import { runScan, defaultDeps, type ScanDeps } from "../pipeline/scan";
import {
  scanWebsiteOnly, defaultWebsiteOnlyDeps, type WebsiteOnlyDeps,
} from "../pipeline/scan-website";
import { normalizeSiteUrl } from "../pipeline/site-url";
import { scoreFindings } from "../pipeline/score/engine";
import { DIMENSIONS } from "../pipeline/score/dimensions";
import {
  deriveBusinessModel, recommendNextStep, type BusinessModel, type NextStepRecommendation,
} from "../pipeline/model/business-model";
import { generateNarrative, type NarrativeOptions, type NarrativeResult } from "../pipeline/report/narrative";
import type { ScanFindings } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import { createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow } from "./diagnosis-repo";
import { websiteKeyOf } from "./website-key";
import type { DiagnoseEvent, DiagnoseStepKey } from "./diagnose-events";

// האורקסטרציה המלאה של אבחון — חולצה מ-cli-diagnose.ts כדי שה-CLI ומסך הסריקה החיה
// יריצו את אותו קוד בדיוק. אירועי ההתקדמות נפלטים בעטיפת ה-deps — הצנרת עצמה לא השתנתה.

export type DiagnoseTarget =
  | { kind: "places"; placeId: string; name: string; city?: string }
  | { kind: "url"; url: string };

export interface DiagnoseOutcome {
  diagnosisId: string;
  businessId: string;
  findings: ScanFindings;
  score: ScoreReport;
  model: BusinessModel;
  nextStep: NextStepRecommendation;
  narrative: NarrativeResult;
}

export interface RunDiagnosisOptions {
  onEvent?: (e: DiagnoseEvent) => void;
  scanDeps?: ScanDeps;           // הזרקה בבדיקות — ברירת מחדל: הצנרת החיה
  websiteDeps?: WebsiteOnlyDeps;
  narrativeOptions?: NarrativeOptions;
}

// הסריקה נכשלה כולה והאבחון הוחזר ל-created — הודעה עברית ידידותית למסך/CLI
export class DiagnoseFailed extends Error {}

type Emit = (e: DiagnoseEvent) => void;

async function step<T>(
  emit: Emit, key: DiagnoseStepKey, label: string,
  fn: () => Promise<T>, detailOf: (r: T) => string,
): Promise<T> {
  emit({ type: "step", key, label });
  try {
    const result = await fn();
    emit({ type: "step_done", key, ok: true, detail: detailOf(result) });
    return result;
  } catch (err) {
    // dep שנפל הופך בצנרת לדגל partial (חוץ מ-details שהוא פטאלי — runScan יפיל את הכול)
    emit({ type: "step_done", key, ok: false, detail: "לא הצליח — ממשיכים בלי המקור הזה" });
    throw err;
  }
}

function wrapScanDeps(base: ScanDeps, emit: Emit): ScanDeps {
  return {
    details: (placeId) => step(emit, "details", "מאתרים את פרטי העסק בגוגל", () => base.details(placeId),
      (d) => d.reviewCount != null ? `נמצאו ${d.reviewCount} ביקורות ודירוג ${d.rating ?? "ללא"}` : "פרטי העסק התקבלו"),
    crawl: (u) => step(emit, "crawl", "קוראים את האתר", () => base.crawl(u),
      (s) => `נסרקו ${s.pagesCrawled} עמודים`),
    pagespeed: (u) => step(emit, "pagespeed", "בודקים מהירות טעינה במובייל", () => base.pagespeed(u),
      (p) => p.performanceScore != null ? `ציון ביצועים ${p.performanceScore}/100` : "אין נתון ביצועים"),
    analyzeReviews: (r) => step(emit, "reviews", "מנתחים את הביקורות", () => base.analyzeReviews(r),
      (x) => x.insights.totalAnalyzed > 0 ? `נותחו ${x.insights.totalAnalyzed} ביקורות` : "אין טקסט ביקורות לניתוח"),
  };
}

function wrapWebsiteDeps(base: WebsiteOnlyDeps, emit: Emit): WebsiteOnlyDeps {
  return {
    crawl: (u) => step(emit, "crawl", "קוראים את האתר", () => base.crawl(u),
      (s) => `נסרקו ${s.pagesCrawled} עמודים`),
    pagespeed: (u) => step(emit, "pagespeed", "בודקים מהירות טעינה במובייל", () => base.pagespeed(u),
      (p) => p.performanceScore != null ? `ציון ביצועים ${p.performanceScore}/100` : "אין נתון ביצועים"),
  };
}

export async function runDiagnosis(
  prisma: PrismaClient,
  target: DiagnoseTarget,
  opts: RunDiagnosisOptions = {},
): Promise<DiagnoseOutcome> {
  const emit: Emit = opts.onEvent ?? (() => {});

  // נרמול URL לפני כל כתיבה ל-DB — כתובת פסולה נכשלת מוקדם ונקי
  const siteUrl = target.kind === "url" ? normalizeSiteUrl(target.url) : undefined;

  // שלב 1: יצירת עסק + אבחון (created). מסלול URL: שם = מפתח הדומיין, website = origin יציב (משימה 3)
  const businessName = siteUrl ? websiteKeyOf(siteUrl.href) : (target as { name: string }).name;
  const created = await createDiagnosisForBusiness(prisma, siteUrl
    ? { name: businessName, website: siteUrl.origin }
    : { name: businessName, placeId: (target as { placeId: string }).placeId, city: (target as { city?: string }).city });
  emit({ type: "created", diagnosisId: created.diagnosisId, businessName });

  // שלב 2: סריקה תחת scanning; כל כישלון מחזיר ל-created עם השגיאה המקורית
  await transitionDiagnosis(prisma, created.diagnosisId, "scanning");
  let findings: ScanFindings;
  try {
    findings = siteUrl
      ? await scanWebsiteOnly(siteUrl.href, wrapWebsiteDeps(opts.websiteDeps ?? defaultWebsiteOnlyDeps, emit))
      : await runScan((target as { placeId: string }).placeId,
          wrapScanDeps(opts.scanDeps ?? defaultDeps, emit), { priorPlacesCalls: 1 });

    // מסלול URL: כישלון כפול (גם crawl וגם PSI) = אין שום ממצא — נבדק לפני scanned
    if (siteUrl && findings.partial.includes("crawl_failed") && findings.partial.includes("pagespeed_failed")) {
      throw new DiagnoseFailed("שני המקורות נכשלו — אין ממצאים לאבחון");
    }
  } catch (err) {
    try {
      await transitionDiagnosis(prisma, created.diagnosisId, "created");
    } catch (revertErr) {
      // ההחזרה נכשלה (race) — לא בולעים, אבל השגיאה שממשיכה היא שגיאת הסריקה המקורית
      console.error("נכשל גם ניסיון החזרת הסטטוס ל-created:", revertErr instanceof Error ? revertErr.message : revertErr);
    }
    throw err;
  }
  await transitionDiagnosis(prisma, created.diagnosisId, "scanned");

  // שלב 3: ציונים ומודל (סינכרוני, אירוע אחד), נרטיב (fallback פנימי — לא מפיל)
  emit({ type: "step", key: "score", label: "מחשבים ציונים ומודל עסק" });
  const score = scoreFindings(DIMENSIONS, findings);
  const model = deriveBusinessModel(findings);
  const nextStep = recommendNextStep(model);
  emit({
    type: "step_done", key: "score", ok: true,
    detail: score.overall == null ? "אין מספיק מידע לציון כולל" : `ציון כולל ${score.overall}/100`,
  });
  const narrative = await step(emit, "narrative", "כותבים את הדוח",
    () => generateNarrative(findings, score, opts.narrativeOptions),
    (n) => n.usedFallback ? "נרטיב תבנית (LLM לא אושר)" : "הנרטיב מוכן");

  // שלב 4: שמירה אטומית ומעבר ל-report_ready
  await step(emit, "save", "שומרים את האבחון", async () => {
    await saveScanResult(prisma, created.diagnosisId, toScanRow(findings, score, narrative), model);
    await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");
  }, () => "האבחון נשמר");

  // שלב 5: backfill האתר שהתגלה — קוסמטי, אחרי report_ready, כשל לא מפיל אבחון ששולם.
  // רק במסלול Places (ב-url האתר נשמר כבר ביצירה).
  if (!siteUrl && findings.business.website) {
    try {
      await prisma.business.update({
        where: { id: created.businessId },
        data: { website: findings.business.website },
      });
    } catch (err) {
      console.error("עדכון האתר בשורת העסק נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  emit({ type: "done", diagnosisId: created.diagnosisId });
  return {
    diagnosisId: created.diagnosisId, businessId: created.businessId,
    findings, score, model, nextStep, narrative,
  };
}
