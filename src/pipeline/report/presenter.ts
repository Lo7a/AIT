import type { ScoreReport, DataStatus } from "../score/types";
import type { PartialFlag } from "../types";
import type { BusinessModel, NextStepRecommendation } from "../model/business-model";
import type { DiagnosisStatus } from "../../server/status";

// שכבת תצוגה משותפת ל-CLI ולמסכים (שער 2א, דרישה 4) — טהורה, נבדקת אופליין

export const DATA_TAG: Record<string, string> = { partial: " (מידע חלקי)", none: " (אין מידע)" };

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  full: "מידע מלא",
  partial: "מידע חלקי",
  none: "אין מידע",
};

export const DIAGNOSIS_STATUS_LABEL: Record<DiagnosisStatus, string> = {
  created: "נוצר — טרם נסרק",
  scanning: "בסריקה",
  scanned: "נסרק — מחשבים דוח",
  report_ready: "דוח מוכן",
  interviewing: "בראיון",
  roadmap_ready: "Roadmap מוכן",
};

export const PARTIAL_FLAG_LABEL: Record<PartialFlag, string> = {
  no_website: "אין אתר לעסק",
  few_reviews: "מעט ביקורות",
  no_review_text: "אין טקסט ביקורות לניתוח",
  crawl_failed: "קריאת האתר נכשלה",
  pagespeed_failed: "בדיקת המהירות נכשלה",
  review_analysis_failed: "ניתוח הביקורות נכשל",
  js_rendered: "האתר מרונדר ב-JavaScript — אותות חלקיים",
  no_gbp: "העסק לא נמצא בגוגל מפות",
};

export type ScoreToneKind = "good" | "mid" | "low" | "unknown";

export function scoreTone(score: number | null): ScoreToneKind {
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 50) return "mid";
  return "low";
}

export function formatDiagnosisSummary(
  score: ScoreReport,
  model: BusinessModel,
  nextStep: NextStepRecommendation,
): string {
  const lines: string[] = [];
  lines.push(score.overall == null ? "ציון כולל: אין מספיק מידע" : `ציון כולל: ${score.overall}/100`);
  for (const d of score.dimensions) {
    const tag = DATA_TAG[d.dataStatus] ?? "";
    lines.push(`  ${d.label}: ${d.score ?? "—"}${tag}`);
  }
  if (score.topGaps.length > 0) {
    lines.push("פערים מובילים:");
    for (const g of score.topGaps) lines.push(`  ✗ ${g.text}`);
  } else if (score.overall != null) {
    // עסק בריא בלי פערים מובילים — שורה חיובית במקום סקציה ריקה. מותנה ב-overall != null: אם אין
    // בכלל מידע לאף ממד (topGaps ריק כי אין חוקים ידועים, לא כי הכול תקין) "בסיס דיגיטלי חזק" הוא הטעיה
    // שסותרת את שורת "אין מספיק מידע" שכבר הודפסה למעלה
    lines.push("לא נמצאו פערים מהותיים בסריקה — בסיס דיגיטלי חזק.");
  }
  if (score.topStrengths.length > 0) {
    lines.push("מה עובד טוב:");
    for (const s of score.topStrengths) lines.push(`  ✓ ${s.text}`);
  }
  lines.push(`שלמות האבחון: ${model.completenessPct}% · הצעד הבא: ${nextStep.reason}`);
  return lines.join("\n");
}
