import type { ThemeId } from "../theme";
import type { ComponentType } from "react";
import * as modern from "./modern/index";
import * as dark from "./dark/index";
import * as vivid from "./vivid/index";

// כל גרסה מספקת חמישה מסכים; עד שגרסה נבנית - ה-fallback הוא רכיבי ברירת המחדל הקיימים
export interface VariantScreens {
  Home: ComponentType<{ recent: import("../../server/diagnosis-read").DiagnosisListItem[] }>;
  Scan: ComponentType<{
    target: { placeId?: string; name?: string; url?: string; city?: string };
    // כשקיים - הרענון/הכניסה החוזרת מתחברים לאבחון חי שכבר קיים ליעד (ראו diagnosis-lookup.ts)
    // במקום לפתוח זרם סריקה חדש בתשלום; ראו ScanRunner.
    attach?: { diagnosisId: string; status: string };
  }>;
  Report: ComponentType<{
    report: NonNullable<Awaited<ReturnType<typeof import("../../server/diagnosis-read").getReport>>>;
    // "מה מונח על השולחן" (loss leads, score measures - שלב א') - מחושב ב-RSC (report/[id]/page.tsx)
    // דרך report-highlights.ts, בזיכרון בלבד. אופציונלי: undefined/מערך ריק = נופל ללייאאוט
    // מוביל-ציון כמו היום (ראו default-screens.tsx, DefaultReport)
    lossHighlights?: import("../../pipeline/roadmap/loss-highlights").LossHighlight[];
  }>;
  Interview: ComponentType<{ diagnosisId: string; initial: import("../../server/run-interview").InterviewSnapshot }>;
  Roadmap: ComponentType<{
    report: NonNullable<Awaited<ReturnType<typeof import("../../server/diagnosis-read").getReport>>>;
    initialRoadmap: import("../../server/roadmap-repo").RoadmapView | null;
  }>;
}

const REGISTRY: Record<ThemeId, VariantScreens> = { modern, dark, vivid };

// דיספצ'ר הגרסאות: קובצי ה-route (page.tsx וכו') קוראים רק לפונקציה הזו ולא יודעים
// דבר על המבנה הפנימי של כל גרסה. סוכן שבונה גרסה נוגע רק בתיקייה שלו (modern/dark/vivid)
// ולעולם לא בקובץ הזה - כך שלושה סוכנים יכולים לעבוד במקביל בלי קונפליקטים.
export function getVariant(theme: ThemeId): VariantScreens {
  return REGISTRY[theme];
}
