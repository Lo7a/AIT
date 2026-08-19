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
import {
  createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow, enrichBusinessFromScan,
  BusinessOwnedByOtherError,
} from "./diagnosis-repo";
import { websiteKeyOf } from "./website-key";
import { withCallContext } from "./external-log";
import { socialPresenceOf, socialOnlyDetail } from "../pipeline/social-hosts";
import type { DiagnoseEvent, DiagnoseStepKey } from "./diagnose-events";

// האורקסטרציה המלאה של אבחון - חולצה מ-cli-diagnose.ts כדי שה-CLI ומסך הסריקה החיה
// יריצו את אותו קוד בדיוק. אירועי ההתקדמות נפלטים בעטיפת ה-deps - הצנרת עצמה לא השתנתה.

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
  scanDeps?: ScanDeps;           // הזרקה בבדיקות - ברירת מחדל: הצנרת החיה
  websiteDeps?: WebsiteOnlyDeps;
  narrativeOptions?: NarrativeOptions;
  // המשתמש המחובר (תיחום בעלות): מוטבע על העסק ביצירה; עסק של משתמש אחר נכשל עוד לפני
  // שנוצרת שורת אבחון (ראו diagnosis-repo.ts). CLI ומסלולי פיתוח לא מעבירים - אין הטבעה
  ownerUserId?: string;
}

// הסריקה נכשלה כולה והאבחון הוחזר ל-created - הודעה עברית ידידותית למסך/CLI
export class DiagnoseFailed extends Error {}

type Emit = (e: DiagnoseEvent) => void;

const CONTINUES_WITHOUT_DETAIL = "לא הצליח - ממשיכים בלי המקור הזה";

// step: עוטף dep יחיד בזוג אירועי step/step_done. failDetail מותאם למשמעות האמיתית של הכישלון -
// עבור dep לא-פטאלי (crawl/pagespeed/reviews/narrative) "ממשיכים בלי המקור הזה" נכון; עבור dep פטאלי
// (details/save) זה שקרי - הקורא מעביר טקסט מדויק. detailOf (עיצוב הטקסט להצלחה) רץ אחרי ה-try/catch
// בכוונה: אם detailOf עצמו זורק (באג בפורמט), זה לא אמור להיראות כמו כישלון של ה-dep שכן הצליח.
async function step<T>(
  emit: Emit, key: DiagnoseStepKey, label: string,
  fn: () => Promise<T>, detailOf: (r: T) => string,
  failDetail: string = CONTINUES_WITHOUT_DETAIL,
): Promise<T> {
  emit({ type: "step", key, label });
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    emit({ type: "step_done", key, ok: false, detail: failDetail });
    throw err;
  }
  emit({ type: "step_done", key, ok: true, detail: detailOf(result) });
  return result;
}

// פולט את זוג האירועים (step + step_done ok:false) עבור crawl ו-pagespeed גם יחד - משותף לכל מסלולי
// ה"אין מה לסרוק" (בלי אתר / אתר חברתי) כדי שמסך הסריקה החיה לא ייתקע על "קוראים את האתר" בלי סוף
function emitSkippedCrawlPsi(emit: Emit, detail: string): void {
  emit({ type: "step", key: "crawl", label: "קוראים את האתר" });
  emit({ type: "step_done", key: "crawl", ok: false, detail });
  emit({ type: "step", key: "pagespeed", label: "בודקים מהירות טעינה במובייל" });
  emit({ type: "step_done", key: "pagespeed", ok: false, detail });
}

function wrapScanDeps(base: ScanDeps, emit: Emit): ScanDeps {
  return {
    // בדיקות התקינות שקטות בזרם: הן מהירות, והן לא שלב שהמשתמש ממתין לו
    health: (siteUrl) => base.health(siteUrl),
    details: async (placeId) => {
      const details = await step(emit, "details", "מאתרים את פרטי העסק בגוגל", () => base.details(placeId),
        (d) => d.reviewCount != null ? `נמצאו ${d.reviewCount} ביקורות ודירוג ${d.rating ?? "ללא"}` : "פרטי העסק התקבלו",
        "איתור העסק נכשל");
      // לעסק אין אתר, או שהאתר הרשום הוא בעצם עמוד ברשת חברתית (ממצא מייסד) - בשני המקרים runScan
      // לא יקרא בכלל ל-crawl/pagespeed (ראו scan.ts). פולטים skipped מפורש כדי שהפלח הזה יראה הסבר
      // קצר ולא רשימה תלויה
      const social = details.website ? socialPresenceOf(details.website) : null;
      if (!details.website || social) {
        emitSkippedCrawlPsi(emit, social ? socialOnlyDetail(social.platform) : "לעסק אין אתר");
      }
      return details;
    },
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
  const raw = opts.onEvent ?? (() => {});
  // חוזה: onEvent לעולם לא מפיל את האורקסטרציה. emit נקרא מתוך ה-deps, שכישלונם נבלע
  // ב-Promise.allSettled - צרכן שזורק (למשל: enqueue לזרם אחרי שהלקוח התנתק) היה הופך לדגל
  // partial שקרי (crawl_failed עם "הצרכן נפל" כטקסט!) שנשמר בפועל ל-DB, ובמסלול URL - לכישלון כפול
  // מדומה ש-DiagnoseFailed הורס אבחון שבפועל הצליח
  const emit: Emit = (e) => {
    try { raw(e); } catch (err) { console.error("⚠️ onEvent נכשל (מתעלמים):", err instanceof Error ? err.message : err); }
  };

  // נרמול URL לפני כל כתיבה ל-DB - כתובת פסולה נכשלת מוקדם ונקי
  const siteUrl = target.kind === "url" ? normalizeSiteUrl(target.url) : undefined;
  // אתר חברתי (ממצא מייסד, אבן דרך 4 משימה 0): מזוהה כאן כדי שגם ה-website שנשמר וגם אירועי
  // הסריקה החיה יתייחסו אליו נכון, לפני שמגיעים בכלל ל-scanWebsiteOnly
  const urlSocial = target.kind === "url" ? socialPresenceOf(siteUrl!.href) : null;

  // שלב 1: יצירת עסק + אבחון (created). מסלול URL: שם = מפתח הדומיין, website = origin יציב (משימה 3) -
  // חוץ מדומיין חברתי: origin לבדו (facebook.com) מאבד את מקטע ה-path שמזהה את העמוד הספציפי,
  // בדיוק הבאג שמשימה 0 מתקנת ב-websiteKeyOf; לכן שם נשמר ה-href המלא כדי שהמפתח בהמשך יהיה נכון
  // הענפים נבדקים ישירות על target.kind (לא על siteUrl הנגזר) כדי שה-union יצטמצם בלי אף cast -
  // הוספת סוג שלישי ל-DiagnoseTarget תיכשל בקומפילציה כאן, לא תפיק undefined בשקט
  const businessName = target.kind === "url" ? websiteKeyOf(siteUrl!.href) : target.name;
  const created = await createDiagnosisForBusiness(prisma, target.kind === "url"
    ? { name: businessName, website: urlSocial ? siteUrl!.href : siteUrl!.origin, ownerUserId: opts.ownerUserId }
    : { name: businessName, placeId: target.placeId, city: target.city, ownerUserId: opts.ownerUserId })
    .catch((err) => {
      // סירוב בעלות הוא הודעה למשתמש (עסק אחד = חשבון אחד), לא תקלת תשתית - עובר לזרם כלשונו
      if (err instanceof BusinessOwnedByOtherError) throw new DiagnoseFailed(err.message);
      throw err;
    });
  emit({ type: "created", diagnosisId: created.diagnosisId, businessName });

  // שלב 2: סריקה תחת scanning; כל כישלון מחזיר ל-created עם השגיאה המקורית
  await transitionDiagnosis(prisma, created.diagnosisId, "scanning");
  let findings: ScanFindings;
  try {
    // אתר חברתי במסלול URL: scanWebsiteOnly ידלג בעצמו על crawl/pagespeed (ראו scan-website.ts),
    // אבל בלי הפולט הזה מסך הסריקה החיה לא היה מקבל בכלל אירועי crawl/pagespeed (שני ה-deps
    // הנחוצים ל-wrapWebsiteDeps כדי לפלוט אותם פשוט לא נקראים)
    if (urlSocial) emitSkippedCrawlPsi(emit, socialOnlyDetail(urlSocial.platform));
    // withCallContext: קריאות Places/PSI/ניתוח-ביקורות של הסריקה נרשמות בארכיון עם האבחון
    // שנוצר הרגע (המשתמש כבר בהקשר מהעטיפה ב-route של diagnose)
    findings = await withCallContext({ diagnosisId: created.diagnosisId }, () => target.kind === "url"
      ? scanWebsiteOnly(siteUrl!.href, wrapWebsiteDeps(opts.websiteDeps ?? defaultWebsiteOnlyDeps, emit))
      : runScan(target.placeId, wrapScanDeps(opts.scanDeps ?? defaultDeps, emit), { priorPlacesCalls: 1 }));

    // מסלול URL: כישלון כפול (גם crawl וגם PSI) = אין שום ממצא - נבדק לפני scanned
    if (target.kind === "url" && findings.partial.includes("crawl_failed") && findings.partial.includes("pagespeed_failed")) {
      throw new DiagnoseFailed("שני המקורות נכשלו, אין ממצאים לאבחון");
    }
  } catch (err) {
    try {
      await transitionDiagnosis(prisma, created.diagnosisId, "created");
    } catch (revertErr) {
      // ההחזרה נכשלה (race) - לא בולעים, אבל השגיאה שממשיכה היא שגיאת הסריקה המקורית
      console.error("⚠️ נכשל גם ניסיון החזרת הסטטוס ל-created:", revertErr instanceof Error ? revertErr.message : revertErr);
    }
    throw err;
  }
  await transitionDiagnosis(prisma, created.diagnosisId, "scanned");

  // שלב 3: ציונים ומודל (סינכרוני, אירוע אחד), נרטיב (fallback פנימי - לא מפיל)
  emit({ type: "step", key: "score", label: "מחשבים ציונים ומודל עסק" });
  const score = scoreFindings(DIMENSIONS, findings);
  const model = deriveBusinessModel(findings);
  const nextStep = recommendNextStep(model);
  emit({
    type: "step_done", key: "score", ok: true,
    detail: score.overall == null ? "אין מספיק מידע לציון כולל" : `ציון כולל ${score.overall}/100`,
  });
  const narrative = await step(emit, "narrative", "כותבים את הדוח",
    () => withCallContext({ diagnosisId: created.diagnosisId }, () => generateNarrative(findings, score, opts.narrativeOptions)),
    (n) => n.usedFallback ? "נרטיב תבנית (LLM לא אושר)" : "הנרטיב מוכן");

  // שלב 4: שמירה אטומית - הסריקה, מודל העסק והמעבר ל-report_ready באותה טרנזקציה
  // (saveScanResult מבצע את המעבר בפנים; קודם היו שני עגולי DB וקריסה ביניהם השאירה
  // אבחון תקוע ב-scanned עם סריקה שמורה)
  await step(emit, "save", "שומרים את האבחון",
    () => saveScanResult(prisma, created.diagnosisId, toScanRow(findings, score, narrative), model),
    () => "האבחון נשמר", "השמירה נכשלה");

  // שלב 5: backfill האתר שהתגלה - קוסמטי, אחרי report_ready, כשל לא מפיל אבחון ששולם.
  // רק במסלול Places (ב-url האתר נשמר כבר ביצירה).
  if (target.kind === "places" && findings.business.website) {
    try {
      await prisma.business.update({
        where: { id: created.businessId },
        data: { website: findings.business.website },
      });
    } catch (err) {
      console.error("⚠️ עדכון האתר בשורת העסק נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  // שלב 5ב: העשרת phone/address/city מהסריקה (אבן דרך 4, משימה 0.7) - רק במסלול Places (URL
  // אין בו קריאת Places בכלל, אין phone/address לגזור). קוסמטי כמו backfill האתר למעלה - כשל
  // לא מפיל אבחון ששולם (ראו נימוק מלא ב-enrichBusinessFromScan, diagnosis-repo.ts)
  if (target.kind === "places") {
    try {
      await enrichBusinessFromScan(prisma, created.businessId, findings.business);
    } catch (err) {
      console.error("עדכון פרטי הקשר בשורת העסק נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  emit({ type: "done", diagnosisId: created.diagnosisId });
  return {
    diagnosisId: created.diagnosisId, businessId: created.businessId,
    findings, score, model, nextStep, narrative,
  };
}
