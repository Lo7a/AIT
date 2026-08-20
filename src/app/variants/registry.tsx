import type { ThemeId } from "../theme";
import type { ComponentType } from "react";
import * as modern from "./modern/index";
import * as dark from "./dark/index";
import * as vivid from "./vivid/index";

// כל גרסה מספקת חמישה מסכים; עד שגרסה נבנית - ה-fallback הוא רכיבי ברירת המחדל הקיימים
export interface VariantScreens {
  Home: ComponentType<{
    recent: import("../../server/diagnosis-read").DiagnosisListItem[];
    // חיווט הכניסה (אבן דרך "לצאת החוצה"): session = המשתמש המחובר (null/חסר = אנונימי),
    // loginEnabled = מפתחות Supabase קיימים ולכן קישור "כניסה" מוצג לאנונימיים. אופציונליים
    // כדי שגרסאות עיצוב קיימות ימשיכו להתקמפל בלי שינוי. isAdminUser = קישור "ניהול" (/admin)
    session?: { email: string | null } | null;
    loginEnabled?: boolean;
    isAdminUser?: boolean;
    // מצב התחזות פעיל: email = המשתמש שצופים בו; המסך מציג פס אזהרה עם כפתור יציאה
    impersonating?: { email: string | null } | null;
  }>;
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
    // השורה האישית (מדרגה ב, loss-calc.ts) - מחושבת ב-RSC מתשובות הכמות בראיון; null = אין שורה
    personalLoss?: import("../../pipeline/roadmap/loss-calc").PersonalLossLine | null;
    // "מה אפשר לעשות כבר עכשיו" (quick-wins.ts) - צעדים חינמיים שנגזרים מחוקים שנבדקו בפועל
    // ולא הושגו. אופציונלי: undefined/מערך ריק = הסקציה פשוט לא מוצגת
    quickWins?: import("../../pipeline/roadmap/quick-wins").QuickWin[];
    // "מה הבנתי על העסק שלך" (insights.ts) - מסקנות שמחברות כמה אותות מאומתים לתמונה אחת,
    // פותחות את הדוח. אופציונלי: undefined/מערך ריק = הסקציה פשוט לא מוצגת
    insights?: import("../../pipeline/roadmap/insights").Insight[];
    // הצופה הוא אדמין אמיתי: מציג את חיפוש ההתחזות בסרגל העליון ואת הכניסה לניהול
    // בסיידבר. נקבע בשרת - הלקוח לעולם לא מחליט על הרשאה
    isAdmin?: boolean;
  }>;
  Interview: ComponentType<{
    diagnosisId: string;
    initial: import("../../server/run-interview").InterviewSnapshot;
    // שם העסק שהראיון הזה שייך לו (דיווח מייסד 20.8): כשיש כמה אבחונים, מסך הראיון
    // היה המסך היחיד שלא אמר על מי מדובר. אופציונלי כדי שגרסאות עיצוב קיימות יתקמפלו
    businessName?: string;
    isAdmin?: boolean;
  }>;
  Roadmap: ComponentType<{
    report: NonNullable<Awaited<ReturnType<typeof import("../../server/diagnosis-read").getReport>>>;
    initialRoadmap: import("../../server/roadmap-repo").RoadmapView | null;
    personalLoss?: import("../../pipeline/roadmap/loss-calc").PersonalLossLine | null;
    isAdmin?: boolean;
  }>;
}

const REGISTRY: Record<ThemeId, VariantScreens> = { modern, dark, vivid };

// דיספצ'ר הגרסאות: קובצי ה-route (page.tsx וכו') קוראים רק לפונקציה הזו ולא יודעים
// דבר על המבנה הפנימי של כל גרסה. סוכן שבונה גרסה נוגע רק בתיקייה שלו (modern/dark/vivid)
// ולעולם לא בקובץ הזה - כך שלושה סוכנים יכולים לעבוד במקביל בלי קונפליקטים.
export function getVariant(theme: ThemeId): VariantScreens {
  return REGISTRY[theme];
}
