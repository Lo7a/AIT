import type { ScoreReport, DataStatus } from "../score/types";
import type { PartialFlag } from "../types";
import type { BusinessModel, NextStepRecommendation } from "../model/business-model";
import type { DiagnosisStatus } from "../../server/status";

// שכבת תצוגה משותפת ל-CLI ולמסכים (שער 2א, דרישה 4) - טהורה, נבדקת אופליין

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  full: "מידע מלא",
  partial: "מידע חלקי",
  none: "אין מידע",
};

// תגי הסוגריים של ה-CLI נגזרים מהתוויות - עריכת תווית אחת לא תפצל בשקט בין ה-CLI ל-UI
export const DATA_TAG: Record<string, string> = {
  partial: ` (${DATA_STATUS_LABEL.partial})`,
  none: ` (${DATA_STATUS_LABEL.none})`,
};

// ראשי תיבות לאווטאר זהות: אות ראשונה משתי המילים הראשונות, או שתי הראשונות בשם קצר.
// יושב כאן ולא במעטפת: רשימת האבחונים היא רכיב שרת והמעטפת היא "use client", ופונקציה
// שחוצה את הגבול הזה קורסת בזמן ריצה. שכבת התצוגה הטהורה נגישה לשני הצדדים
export function initialsOf(name: string): string {
  const words = name.trim().split(/s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  return name.trim().slice(0, 2);
}

export const DIAGNOSIS_STATUS_LABEL: Record<DiagnosisStatus, string> = {
  created: "נוצר, טרם נסרק",
  scanning: "בסריקה",
  scanned: "נסרק, מחשבים דוח",
  report_ready: "דוח מוכן",
  interviewing: "בראיון",
  roadmap_ready: "Roadmap מוכן",
};

// תווית עברית קצרה, פונה לבעל העסק, לכל מפתח חוק אמיתי (DIMENSIONS + processRules(null) ב-
// dimensions.ts). דיווח מייסד: הדוח הציג "לא נבדק - אין מידע (no_problem_themes)" - שם המשתנה
// הגולמי במקום עברית. חוק חדש בלי תווית כאן ייכשל בבדיקה (tests/presenter.test.ts), לא בפרודקשן -
// ראו RuleLine ב-default-screens.tsx, שמשתמש כאן עם נפילה חזרה על rule.key אם המפה פיגרה בכל זאת
export const RULE_LABEL_HE: Record<string, string> = {
  // process (בשלות תהליכים)
  lead_handling: "טיפול בפניות",
  manual_tasks: "עבודה ידנית חוזרת",
  internal_tools: "כלי ניהול פנימי",
  // visibility (נראות דיגיטלית)
  gbp_exists: "פרופיל עסקי בגוגל",
  has_website: "קיום אתר",
  own_website: "אתר עצמאי",
  perf: "מהירות האתר",
  lcp: "זמן טעינה ראשוני",
  seo: "בסיס SEO",
  gbp_phone: "טלפון בפרופיל גוגל",
  gbp_rating: "דירוג בגוגל",
  // reputation (מוניטין וביקורות)
  has_reviews: "ביקורות בגוגל",
  review_volume: "היקף ביקורות",
  rating_good: "רמת הדירוג",
  no_problem_themes: "בעיות חוזרות בביקורות",
  positive_themes: "נקודות חוזק בביקורות",
  // accessibility (נגישות ללקוח)
  phone_available: "טלפון נגיש ללקוח",
  whatsapp: "וואטסאפ באתר",
  contact_form: "טופס יצירת קשר",
  online_booking: "קביעת תור אונליין",
  email_link: "אימייל נגיש",
  a11y_statement: "הצהרת נגישות",
  site_a11y: "נגישות האתר",
  // infrastructure (תשתית דיגיטלית)
  analytics: "מדידת תנועה באתר",
  fb_pixel: "פיקסל פייסבוק",
  chat_widget: "צ'אט באתר",
  multi_page: "אתר רב-עמודי",
  // בדיקות תקינות (health) - דומיין, דואר ואבטחה
  domain_expiry: "תוקף רישום הדומיין",
  // החליף את dmarc ב-20.8: ממצא אחד לכל הגדרת הדואר. המפה נשמרת מסונכרנת עם dimensions.ts
  // בלי מפתחות היסטוריים (בדיקת שמירה ב-presenter.test.ts) - scan.scores שמור מלפני השינוי
  // ירונדר עם המפתח הגולמי עד הריענון הבא שלו
  mail_auth: "אימות הדואר של הדומיין",
  safe_browsing: "סימון ברשימת האתרים המסוכנים",
  local_business_schema: "סימון עסק מקומי באתר",
};

/**
 * התווית העברית של חוק, או null כשאין.
 *
 * למה null ולא נפילה חזרה על המפתח: scan.scores נשמר בבסיס הנתונים, ולכן דוח ישן מכיל
 * מפתחות של גרסת ניקוד קודמת. כשחוק משנה שם (dmarc -> mail_auth, 20.8) המפתח הישן נשאר
 * בדוחות השמורים, והמפה בכוונה לא מחזיקה מפתחות היסטוריים - בדיקה נועלת אותה מול
 * dimensions.ts. הנפילה חזרה על המפתח הגולמי הדפיסה "dmarc" באנגלית בתוך דוח עברי,
 * בדיוק הבאג שהמייסד דיווח עליו. מי שמרנדר מחליט מה להציג כשאין תווית - ולא מדפיס מפתח.
 */
export function ruleLabelHe(key: string): string | null {
  return RULE_LABEL_HE[key] ?? null;
}

export const PARTIAL_FLAG_LABEL: Record<PartialFlag, string> = {
  no_website: "אין אתר לעסק",
  few_reviews: "מעט ביקורות",
  no_review_text: "אין טקסט ביקורות לניתוח",
  crawl_failed: "קריאת האתר נכשלה",
  pagespeed_failed: "בדיקת המהירות נכשלה",
  review_analysis_failed: "ניתוח הביקורות נכשל",
  js_rendered: "האתר מרונדר ב-JavaScript - אותות חלקיים",
  no_gbp: "העסק לא נמצא בגוגל מפות",
  social_only: "הנוכחות הדיגיטלית היא עמוד ברשת חברתית, לא אתר עצמאי",
  // כשלי בדיקות התקינות (תחקיר 21.8) - תיעוד איסוף בלבד: השדה חסר והחוק מדווח "לא נבדק"
  health_domain_failed: "בדיקת רישום הדומיין נכשלה",
  health_mail_failed: "בדיקת רשומות הדואר נכשלה",
  health_safebrowsing_failed: "בדיקת Safe Browsing נכשלה",
  health_failed: "בדיקות התקינות לא רצו",
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
    lines.push(`  ${d.label}: ${d.score ?? "-"}${tag}`);
  }
  if (score.topGaps.length > 0) {
    lines.push("פערים מובילים:");
    for (const g of score.topGaps) lines.push(`  ✗ ${g.text}`);
  } else if (score.overall != null) {
    // עסק בריא בלי פערים מובילים - שורה חיובית במקום סקציה ריקה. מותנה ב-overall != null: אם אין
    // בכלל מידע לאף ממד (topGaps ריק כי אין חוקים ידועים, לא כי הכול תקין) "בסיס דיגיטלי חזק" הוא הטעיה
    // שסותרת את שורת "אין מספיק מידע" שכבר הודפסה למעלה
    lines.push("לא נמצאו פערים מהותיים בסריקה. בסיס דיגיטלי חזק.");
  }
  if (score.topStrengths.length > 0) {
    lines.push("מה עובד טוב:");
    for (const s of score.topStrengths) lines.push(`  ✓ ${s.text}`);
  }
  lines.push(`שלמות האבחון: ${model.completenessPct}% · הצעד הבא: ${nextStep.reason}`);
  return lines.join("\n");
}
