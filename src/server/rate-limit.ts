// הגבלת קצב מבוססת DB מאחורי תפר אחד (החלטת ארכיטקטורה 16.8): בלי ספק חיצוני, בלי זיכרון
// תהליך (לא שורד serverless) - הספירה נעשית על usage_events שכבר נכתבים ממילא בכל פעולה.
// אלה מעצורי שימוש-לרעה (abuse), לא מכסות מוצר: הכרעת המייסד היא אפס אכיפת מכסות בתקופת
// הטסט, ומתג המכסות העסקי (עסקים לחשבון, סריקות לחודש) יגיע יחד עם המודל העסקי וישען על
// אותה טבלה בדיוק. לכן הגבולות כאן נדיבים בכוונה - משתמש אמיתי לא אמור לפגוש אותם לעולם.
//
// עיקרון fail-open: אם ספירת האירועים נכשלת (תקלת DB) הבקשה עוברת עם לוג שרת - זמינות
// המערכת קודמת לחסימה בשלב הזה. הספירה היא על אירועי הצלחה (נכתבים אחרי הפעולה), אז
// כישלונות לא נספרים - מקובל למעצור עלות: מה שעולה כסף הוא בדיוק הפעולות שמצליחות.
import type { SessionUser } from "./auth/session";
import { isAdmin } from "./auth/guard";
import type { UsageEventType } from "./usage-events";

export interface RateRule {
  type: UsageEventType; // סוג האירוע שנספר (= מה שהפעולה עצמה רושמת ביומן)
  limit: number;        // מקסימום אירועים בחלון
  windowSeconds: number;
}

// הגבולות במקום אחד - כיוונון עתידי נוגע רק כאן. נדיבים בכוונה (ראו למעלה)
export const RATE_RULES = {
  scan: { type: "diagnosis_created", limit: 15, windowSeconds: 3600 },
  search: { type: "search", limit: 60, windowSeconds: 3600 },
  interviewMessage: { type: "interview_answer", limit: 90, windowSeconds: 3600 },
  roadmapBuild: { type: "roadmap_built", limit: 20, windowSeconds: 3600 },
  brief: { type: "brief_sent", limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, RateRule>;

/* eslint-disable @typescript-eslint/no-explicit-any */
type CountDb = { usageEvent: any };

// null = מותר להמשיך; אחרת - תשובת 429 מוכנה. אדמין לא מוגבל (הצד שלנו בודק ומדגים בלי חיכוך)
export async function enforceRateLimit(
  db: CountDb,
  user: SessionUser,
  rule: RateRule,
  now: Date = new Date(),
): Promise<Response | null> {
  if (isAdmin(user)) return null;
  try {
    const since = new Date(now.getTime() - rule.windowSeconds * 1000);
    const count = await db.usageEvent.count({
      where: { userId: user.id, type: rule.type, createdAt: { gte: since } },
    });
    if (count < rule.limit) return null;
    return Response.json(
      { error: "יותר מדי פעולות בפרק זמן קצר, נסו שוב מאוחר יותר" },
      { status: 429 },
    );
  } catch (err) {
    console.error("rate-limit: ספירה נכשלה (fail-open, הבקשה עוברת):", err);
    return null;
  }
}
