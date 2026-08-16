// שכבת התיחום לפי בעלות (אבן דרך "לצאת החוצה"): בעל עסק רואה רק את האבחונים של העסקים
// שבבעלותו, אדמין רואה הכול. העיקרון המרכזי: אבחון זר מחזיר בדיוק את אותו "לא נמצא" כמו
// אבחון שלא קיים - בלי להסגיר שה-uuid קיים בכלל (no existence leak). כל הפונקציות מקבלות
// db מוזרק ורצות אופליין בבדיקות עם fake-db.
import { InterviewError } from "../../pipeline/interview/contract";
import type { SessionUser } from "./session";

/* eslint-disable @typescript-eslint/no-explicit-any */
// db: PrismaClient או ה-fake - רק diagnosis/business נצרכים כאן
type GuardDb = { diagnosis: any; business: any };

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

// הכרעת הגישה הטהורה: אדמין - הכול; בעלים - רק שורות שמשויכות אליו. שורת עסק בלי בעלים
// (נתוני טסט ותיקים מלפני שכבת המשתמשים) גלויה לאדמין בלבד - היא לא "של אף אחד", לא "של כולם"
export function canAccessDiagnosis(user: SessionUser, ownerUserId: string | null): boolean {
  return isAdmin(user) || (ownerUserId != null && ownerUserId === user.id);
}

// בדיקת גישה מלאה מול ה-DB: true = מותר, false = קיים אבל של מישהו אחר, null = לא קיים.
// ההבחנה false/null נשארת פנימית לשרת - כלפי הלקוח שתיהן "לא נמצא" (ראו assert למטה)
export async function userCanAccessDiagnosis(
  db: GuardDb,
  user: SessionUser,
  diagnosisId: string,
): Promise<boolean | null> {
  const d = await db.diagnosis.findUnique({ where: { id: diagnosisId } });
  if (d == null) return null;
  const business = await db.business.findUnique({ where: { id: d.businessId } });
  return canAccessDiagnosis(user, business?.ownerUserId ?? null);
}

// שער ה-API: זריקת InterviewError not_found (מיפוי ל-404 כבר קיים בכל ה-handlers) - אותה
// הודעה בדיוק לאבחון חסר ולאבחון זר
export async function assertDiagnosisAccess(
  db: GuardDb,
  user: SessionUser,
  diagnosisId: string,
): Promise<void> {
  if ((await userCanAccessDiagnosis(db, user, diagnosisId)) !== true) {
    throw new InterviewError("האבחון לא נמצא", "not_found");
  }
}

// תשובת 401 אחידה לכל ה-routes - בקשה בלי סשן תקף
export function unauthorizedResponse(): Response {
  return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
}
