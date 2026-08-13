import type { ScanFindings } from "../types";

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
    return website ? new URL(website).hostname.replace(/^www\./, "") : undefined;
  } catch {
    return undefined;
  }
}

export function deriveBusinessModel(f: ScanFindings): BusinessModel {
  const s = f.websiteSignals;
  const noGbp = f.partial.includes("no_gbp");
  const problemThemes = f.reviewInsights?.problemThemes.map((t) => t.theme) ?? [];

  const sections: Record<ModelSection, { data: Record<string, unknown>; credit: Credit }> = {
    profile: {
      data: { name: f.business.name, domain: domainOf(f.business.website) },
      credit: 0.5, // שם ודומיין תמיד ידועים מהסריקה; תחום/גודל/ותק — מהראיון
    },
    channels: {
      data: noGbp ? {} : { google: true, reviewCount: f.business.reviewCount },
      credit: noGbp ? 0 : 0.5,
    },
    lead_flow: {
      data: s?.hasContactForm ? { hasContactForm: true } : {},
      credit: s?.hasContactForm ? 0.5 : 0, // יש טופס — אבל מי מטפל ותוך כמה זמן? רק הראיון יודע
    },
    scheduling: {
      data: s ? { hasOnlineBooking: s.hasOnlineBooking } : {},
      // יודעים אם יש קביעת תור אונליין ברגע שיש אותות אתר בכלל — גם "אין" הוא ממצא אמיתי
      // (תוקן מ-`s?.hasOnlineBooking ? 0.5 : 0`, ראו הערת as-built בתוכנית)
      credit: s ? 0.5 : 0,
    },
    service: { data: {}, credit: 0 },
    billing: { data: {}, credit: 0 },
    retention: { data: {}, credit: 0 },
    tools: {
      data: s
        ? {
            platform: s.platform,
            detected: [
              ...(s.hasGoogleAnalytics ? ["google_analytics"] : []),
              ...(s.hasFacebookPixel ? ["facebook_pixel"] : []),
              ...(s.hasChatWidget ? ["chat_widget"] : []),
            ],
          }
        : {},
      credit: s ? 0.5 : 0,
    },
    pains: {
      data: f.reviewInsights ? { fromReviews: problemThemes } : {},
      // קרדיט ברגע שהביקורות נותחו בפועל — "נבדק ולא נמצאו בעיות חוזרות" הוא ממצא תקף
      // בדיוק כמו "נמצאו בעיות" (תוקן מ-`problemThemes.length > 0 ? 0.5 : 0`,
      // ראו הערת as-built בתוכנית — אחרת עסק "עשיר" עם ביקורות נקיות מקבל 0 קרדיט על סקציה שכן נבדקה)
      credit: f.reviewInsights ? 0.5 : 0,
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
  const completenessPct = Math.round(
    (MODEL_SECTIONS.reduce((sum, k) => sum + sections[k].credit, 0) / MODEL_SECTIONS.length) * 100,
  );

  return { data, fieldSources, credits, completenessPct };
}

// סדר העדיפות של סקציות לראיון + הניסוח שלהן — הסקציה הראשונה שעדיין לא הושלמה (קרדיט < 1) קובעת את ההמלצה
const INTERVIEW_PRIORITY: [ModelSection, string][] = [
  ["lead_flow", "טיפול בלידים"],
  ["service", "שירות ותפעול"],
  ["billing", "גבייה וחשבוניות"],
  ["manual_tasks", "משימות ידניות חוזרות"],
];

const FREE_TEXT_THRESHOLD = 20; // מתחת ל-20% שלמות — אין בסיס לשאלות ממוקדות, עדיף סיפור חופשי

export function recommendNextStep(m: BusinessModel): NextStepRecommendation {
  if (m.completenessPct <= FREE_TEXT_THRESHOLD) {
    return {
      action: "free_text",
      reason: "אין כמעט מידע ציבורי על העסק — ספר לנו עליו במילים שלך וזה ימלא את התמונה",
    };
  }
  // קרדיט 0.5 (מהסריקה בלבד) עדיין נחשב "לא הושלם" — רק אישור בראיון (קרדיט 1) סוגר סקציה.
  // בדיקה לפי fieldSources (יש/אין מקור) הייתה בוחרת בטעות בסקציה הבאה בתור גם כשהראשונה
  // חלקית בלבד — ראו הערת as-built בתוכנית.
  const missing = INTERVIEW_PRIORITY.find(([section]) => m.credits[section] < 1);
  const label = missing?.[1] ?? "העסק";
  return {
    action: "interview",
    reason: `השלם כמה שאלות על ${label} — זה ישפר משמעותית את דיוק ההמלצות`,
  };
}
