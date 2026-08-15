import type { ScanFindings } from "../types";
import {
  noGbp as noGbpOf, crawlUsable as crawlUsableOf, reviewsAnalyzed as reviewsAnalyzedOf,
} from "../evidence";

// עשר הסקציות של מודל העסק (אפיון 7)
export const MODEL_SECTIONS = [
  "profile", "channels", "lead_flow", "scheduling", "service",
  "billing", "retention", "tools", "pains", "manual_tasks",
] as const;
export type ModelSection = (typeof MODEL_SECTIONS)[number];
export type FieldSource = "scan" | "interview" | "free_text" | "document" | "connection";

export interface BusinessModel {
  data: Record<ModelSection, Record<string, unknown>>;
  fieldSources: Partial<Record<ModelSection, FieldSource[]>>;
  // קרדיט גולמי לכל סקציה — לשימוש recommendNextStep (0.5 עדיין "לא הושלם") ולמד השלמות ב-UI
  credits: Record<ModelSection, number>;
  completenessPct: number;
}

export interface NextStepRecommendation {
  action: "interview" | "free_text";
  reason: string;
}

// קרדיט לסקציה: 0 = אין כלום, 0.5 = מידע חלקי מהסריקה, 1 = אושר בראיון (אבן דרך 3)
type Credit = 0 | 0.5 | 1;

function domainOf(website?: string): string | undefined {
  try {
    // `|| undefined` — הגנה מפני hostname שהופך למחרוזת ריקה אחרי הסרת "www." (למשל host שהוא "www." בלבד)
    return website ? new URL(website).hostname.replace(/^www\./, "") || undefined : undefined;
  } catch {
    return undefined;
  }
}

// נוסחת ההשלמות כפונקציה מיוצאת בפני עצמה — תפר עתידי: אבן דרך 3 תעדכן קרדיטים בודדים
// (לדוגמה אחרי תשובת ראיון) בלי לגזור מודל שלם מחדש, ותקרא לזה ישירות על מפת הקרדיטים המעודכנת
export function completenessOf(credits: Record<ModelSection, number>): number {
  return Math.round(
    (MODEL_SECTIONS.reduce((sum, k) => sum + credits[k], 0) / MODEL_SECTIONS.length) * 100,
  );
}

export function deriveBusinessModel(f: ScanFindings): BusinessModel {
  const s = f.websiteSignals;
  const noGbp = noGbpOf(f);
  const problemThemes = f.reviewInsights?.problemThemes.map((t) => t.theme) ?? [];
  const domain = domainOf(f.business.website);

  // ביקורות "נותחו" רק אם יש דגימה בפועל (totalAnalyzed > 0) — לא מספיק ש-reviewInsights קיים:
  // analyze/reviews יכול להחזיר אובייקט מלא עם totalAnalyzed: 0 כש-scan.ts מדגיל no_review_text
  // (אין טקסט לאף ביקורת). "לא נבדק כלום" חייב להיראות שונה מ"נבדק ונמצא נקי" — predicate משותף
  // עם score/dimensions.ts דרך ../evidence (ראו הערת as-built בתוכנית).
  const reviewsAnalyzed = reviewsAnalyzedOf(f);

  // יש אותות אתר וניתן לסמוך על "לא נמצא": js_rendered הופך רק היעדרים לא-מהימנים, לא נוכחויות —
  // אותה אסימטריה שנקבעה במשימה 6, עכשיו predicate משותף דרך ../evidence: גילוי חיובי הוא ראיה
  // תמיד, "לא נמצא" דורש שהזחילה קראה HTML אמיתי. ראו הערת as-built בתוכנית.
  const crawlUsable = crawlUsableOf(f);

  const toolsDetected = [
    ...(s?.hasGoogleAnalytics ? ["google_analytics"] : []),
    ...(s?.hasFacebookPixel ? ["facebook_pixel"] : []),
    ...(s?.hasChatWidget ? ["chat_widget"] : []),
  ];
  const toolsDetectedAny = toolsDetected.length > 0;

  const sections: Record<ModelSection, { data: Record<string, unknown>; credit: Credit }> = {
    profile: {
      // אין מפתח `domain` בכלל כשאין דומיין — לא `domain: undefined` (JSON.stringify מוחק את זה, אבל
      // ה-object החי בזיכרון/במבחנים לא צריך להסתמך על ההתנהגות העקיפה הזאת; ראו הערת as-built)
      data: { name: f.business.name, ...(domain ? { domain } : {}) },
      credit: 0.5, // שם ודומיין תמיד ידועים מהסריקה; תחום/גודל/ותק — מהראיון
    },
    channels: {
      // עמוד ברשת חברתית (אבן דרך 4, משימה 0) הוא ערוץ אמיתי של העסק - נכנס לצד google, לא במקומו
      // (עסק יכול להימצא גם בגוגל וגם להפנות משם לעמוד פייסבוק בלבד)
      data: {
        ...(noGbp ? {} : { google: true, ...(f.business.reviewCount != null ? { reviewCount: f.business.reviewCount } : {}) }),
        ...(f.socialOnly ? { social: { platform: f.socialOnly.platform, url: f.socialOnly.url } } : {}),
      },
      credit: (noGbp && !f.socialOnly) ? 0 : 0.5,
    },
    lead_flow: {
      // בניגוד ל-scheduling/tools למטה: העדר טופס יצירת קשר לא נספר כידע גם כשה-crawl אמין —
      // "אין טופס" לא אומר הרבה על איך מטפלים בלידים בפועל (הם עשויים להגיע בטלפון/וואטסאפ),
      // אז זו לא תשובה לשאלה שהסקציה הזו אמורה למלא
      data: s?.hasContactForm ? { hasContactForm: true } : {},
      credit: s?.hasContactForm ? 0.5 : 0, // יש טופס — אבל מי מטפל ותוך כמה זמן? רק הראיון יודע
    },
    scheduling: {
      // חיובי = הוכחה גם באתר js_rendered; שלילי רק כשהזחילה באמת קראה את האתר
      data: s?.hasOnlineBooking ? { hasOnlineBooking: true } : crawlUsable ? { hasOnlineBooking: false } : {},
      credit: (crawlUsable || !!s?.hasOnlineBooking) ? 0.5 : 0,
    },
    service: { data: {}, credit: 0 },
    billing: { data: {}, credit: 0 },
    retention: { data: {}, credit: 0 },
    tools: {
      // חיובי = כלי שזוהה בפועל, נספר גם ב-js_rendered; פלטפורמה/רשימת "לא זוהה כלום" רק כשהזחילה אמינה
      data: (crawlUsable || toolsDetectedAny)
        ? { ...(s?.platform ? { platform: s.platform } : {}), detected: toolsDetected }
        : {},
      credit: (crawlUsable || toolsDetectedAny) ? 0.5 : 0,
    },
    pains: {
      data: reviewsAnalyzed ? { fromReviews: problemThemes } : {},
      credit: reviewsAnalyzed ? 0.5 : 0,
    },
    manual_tasks: { data: {}, credit: 0 },
  };

  const data = Object.fromEntries(
    MODEL_SECTIONS.map((k) => [k, sections[k].data]),
  ) as BusinessModel["data"];
  const fieldSources = Object.fromEntries(
    MODEL_SECTIONS.filter((k) => sections[k].credit > 0).map((k) => [k, ["scan"] as FieldSource[]]),
  );
  const credits = Object.fromEntries(
    MODEL_SECTIONS.map((k) => [k, sections[k].credit]),
  ) as BusinessModel["credits"];
  const completenessPct = completenessOf(credits);

  return { data, fieldSources, credits, completenessPct };
}

// סדר העדיפות של סקציות לראיון + הניסוח שלהן — הסקציה הראשונה שעדיין לא הושלמה (קרדיט < 1) קובעת את ההמלצה
const INTERVIEW_PRIORITY: [ModelSection, string][] = [
  ["lead_flow", "טיפול בלידים"],
  ["service", "שירות ותפעול"],
  ["billing", "גבייה וחשבוניות"],
  ["manual_tasks", "משימות ידניות חוזרות"],
];

const FREE_TEXT_THRESHOLD = 20; // עד 20% (כולל) — אין בסיס לשאלות ממוקדות, עדיף סיפור חופשי

export function recommendNextStep(m: BusinessModel): NextStepRecommendation {
  if (m.completenessPct <= FREE_TEXT_THRESHOLD) {
    return {
      action: "free_text",
      // ניסוח שנכון גם כש"אין מידע ציבורי" וגם כשהיה מידע אבל לא הצלחנו לאסוף אותו (crawl/PSI נכשלו)
      reason: "כמעט ולא הצלחנו לאסוף מידע על העסק ממקורות ציבוריים, ספר לנו עליו במילים שלך וזה ימלא את התמונה",
    };
  }
  // קרדיט 0.5 (מהסריקה בלבד) עדיין נחשב "לא הושלם" — רק אישור בראיון (קרדיט 1) סוגר סקציה.
  // בדיקה לפי fieldSources (יש/אין מקור) הייתה בוחרת בטעות בסקציה הבאה בתור גם כשהראשונה
  // חלקית בלבד — ראו הערת as-built בתוכנית.
  const missing = INTERVIEW_PRIORITY.find(([section]) => m.credits[section] < 1);
  const label = missing?.[1] ?? "העסק";
  return {
    action: "interview",
    reason: `השלם כמה שאלות על ${label}, זה ישפר משמעותית את דיוק ההמלצות`,
  };
}
