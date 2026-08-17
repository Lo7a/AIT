// יומן הפעולות (usage_events, הוחלט 16.8): טבלה אחת לשלוש מטרות - היסטוריית משתמש, תשתית
// ההיטמאפס/סטטיסטיקות של שלב ב (כולל שימוש מכירתי: מי צפה במה = למי מתקשרים), ויומן ביקורת.
// התפר היחיד לכתיבה הוא emitUsageEvent: רישום אירוע לעולם לא מפיל את הפעולה שהוא מתעד -
// כשל כתיבה נבלע עם לוג שרת בלבד. actor/user מופרדים כבר עכשיו: היום הם תמיד זהים (פעולה
// עצמית), ומצב ההתחזות של האדמין (שלב האדמין) רק יעביר ערכים שונים - האודיט נולד מהמבנה.

// הטיפוסים הקיימים היום - מחרוזת חופשית בסכמה בכוונה (שורדת שינויים בלי מיגרציה), הרשימה
// כאן היא התיעוד החי ומקור האמת לצד הקורא (מסכי האדמין בהמשך)
export const USAGE_EVENT_TYPES = [
  "login",              // כניסה מוצלחת (metadata.method: magic_link / oauth)
  "search",             // חיפוש עסק (Places, בתשלום; metadata.query - גם נתון מוצרי מעניין)
  "diagnosis_created",  // נוצר אבחון חדש (מאירוע created של זרם הסריקה)
  "scan_completed",     // סריקה הסתיימה ונשמרה (מאירוע done של הזרם)
  "interview_started",
  "interview_answer",   // metadata: questionKey / isFreeText
  "interview_finished",
  "roadmap_built",
  "brief_sent",         // metadata.sent: האם השליחה בפועל הצליחה
  "report_viewed",
  "roadmap_viewed",
  // אירועי מסגרת של מצב ההתחזות (impersonation.ts): userId = המשתמש שמתחזים אליו,
  // actorUserId = האדמין. הפעולות שבתוך המצב ממילא נושאות actor שונה - אלה רק סימני הפתיחה והסגירה
  "impersonation_started",
  "impersonation_stopped",
  // אדמין שינה הגדרת מערכת (מגבלות קצב וכו'): metadata = {key, from, to}; userId = האדמין עצמו
  "settings_changed",
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export interface UsageEventInput {
  type: UsageEventType;
  // בהקשר של איזה חשבון קרתה הפעולה; actorUserId = מי ביצע בפועל - ברירת מחדל: המשתמש עצמו
  userId: string;
  actorUserId?: string;
  entityType?: "diagnosis" | "roadmap_item";
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type EventsDb = { usageEvent: any };

// רישום אירוע - לעולם לא זורק: היומן הוא נלווה, הפעולה עצמה קודמת לו תמיד
export async function emitUsageEvent(db: EventsDb, input: UsageEventInput): Promise<void> {
  try {
    await db.usageEvent.create({
      data: {
        type: input.type,
        userId: input.userId,
        actorUserId: input.actorUserId ?? input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as object | undefined,
      },
    });
  } catch (err) {
    console.error("usage-events: רישום נכשל (הפעולה עצמה לא נפגעה):", err);
  }
}

// תרגום אירועי זרם הסריקה (diagnose-events.ts) לאירועי יומן - טהור וניתן לבדיקה: created =
// נוצר אבחון, done = סריקה הושלמה; כל השאר (step/step_done/error) לא נרשמים ביומן
export function usageEventForDiagnoseEvent(
  e: { type: string; diagnosisId?: string },
  userId: string,
): UsageEventInput | null {
  if (e.type === "created" && e.diagnosisId != null) {
    return { type: "diagnosis_created", userId, entityType: "diagnosis", entityId: e.diagnosisId };
  }
  if (e.type === "done" && e.diagnosisId != null) {
    return { type: "scan_completed", userId, entityType: "diagnosis", entityId: e.diagnosisId };
  }
  return null;
}
