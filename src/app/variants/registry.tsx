import type { ThemeId } from "../theme";
import type { ComponentType } from "react";
import * as modern from "./modern/index";
import * as dark from "./dark/index";
import * as vivid from "./vivid/index";

// כל גרסה מספקת ארבעה מסכים; עד שגרסה נבנית - ה-fallback הוא רכיבי ברירת המחדל הקיימים
export interface VariantScreens {
  Home: ComponentType<{ recent: import("../../server/diagnosis-read").DiagnosisListItem[] }>;
  Scan: ComponentType<{
    target: { placeId?: string; name?: string; url?: string; city?: string };
    // כשקיים - הרענון/הכניסה החוזרת מתחברים לאבחון חי שכבר קיים ליעד (ראו diagnosis-lookup.ts)
    // במקום לפתוח זרם סריקה חדש בתשלום; ראו ScanRunner.
    attach?: { diagnosisId: string; status: string };
  }>;
  Report: ComponentType<{ report: NonNullable<Awaited<ReturnType<typeof import("../../server/diagnosis-read").getReport>>> }>;
  Interview: ComponentType<{ diagnosisId: string; initial: import("../../server/run-interview").InterviewSnapshot }>;
}

const REGISTRY: Record<ThemeId, VariantScreens> = { modern, dark, vivid };

// דיספצ'ר הגרסאות: קובצי ה-route (page.tsx וכו') קוראים רק לפונקציה הזו ולא יודעים
// דבר על המבנה הפנימי של כל גרסה. סוכן שבונה גרסה נוגע רק בתיקייה שלו (modern/dark/vivid)
// ולעולם לא בקובץ הזה - כך שלושה סוכנים יכולים לעבוד במקביל בלי קונפליקטים.
export function getVariant(theme: ThemeId): VariantScreens {
  return REGISTRY[theme];
}
