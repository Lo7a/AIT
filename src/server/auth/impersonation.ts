// מצב התחזות (דרישת מייסד 16.8: "מצב של התחזות ככה שנוכל להתחזות למשתמש ולראות את הצד שלו"):
// אדמין בוחר משתמש, ומאותו רגע כל המסכים וה-API מתנהגים כאילו המשתמש הזה מחובר - אבל היומן
// רושם בכל פעולה גם מי ביצע בפועל (actorUserId), כך שההתחזות מתועדת מעצם המבנה, לא כתוספת.
// המנגנון: cookie בצד האדמין בלבד; משתמש רגיל עם cookie כזה מקבל אותו מיושם-לא (הכרעה כאן).
import type { SessionUser } from "./session";
import { isAdmin } from "./guard";

export const IMPERSONATE_COOKIE = "ait_impersonate";

// הזוג שכל שכבות האפליקציה עובדות איתו מעכשיו: user = בעיני מי המערכת פועלת (התיחום,
// הרשימות, ההרשאות), actor = מי יושב מול המקלדת בפועל. זהים בכל מצב רגיל
export interface ActingUser {
  user: SessionUser;
  actor: SessionUser;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type UserDb = { user: any };

// הכרעת ההתחזות הטהורה (נבדקת אופליין): רק אדמין אמיתי יכול להפוך ל-target, וכל כשל -
// target חסר, לא קיים, או מבקש שאינו אדמין - נופל בשקט לזהות האמיתית. אין מסלול שבו
// משתמש רגיל מקבל זהות של אחר
export async function resolveActingUser(
  db: UserDb,
  real: SessionUser,
  impersonatedId: string | null,
): Promise<ActingUser> {
  if (impersonatedId == null || impersonatedId.length === 0 || !isAdmin(real) || impersonatedId === real.id) {
    return { user: real, actor: real };
  }
  const target = await db.user.findUnique({ where: { id: impersonatedId } });
  if (target == null) return { user: real, actor: real };
  return {
    user: { id: target.id, authId: target.authId, email: target.email, role: target.role },
    actor: real,
  };
}

export function isImpersonating(acting: ActingUser): boolean {
  return acting.user.id !== acting.actor.id;
}

// הדמיה מלאה (הכרעת מייסד 24.8): מה שהצופה רואה נקבע לפי הזהות המדומה, לא האמיתית.
// אדמין שמתחזה לבעל עסק לא רואה ניהול - לא בסיידבר ולא בכניסה ישירה - כי המטרה של
// ההתחזות היא QA: לראות בדיוק את מה שהמשתמש רואה. דרך המילוט היא פס ההתחזות עם כפתור
// העצירה שיושב על מסכי העסק, ולכן אין סכנת נעילה. האבטחה לא זזה: ההרשאות האמיתיות
// ממשיכות להיבדק לפי actor בכל ה-API (ובפרט עצירת ההתחזות עצמה עובדת תמיד)
export function viewAsAdmin(acting: ActingUser | null): boolean {
  return acting != null && isAdmin(acting.user);
}
