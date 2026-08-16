// שכבת הסשן (החלטת ארכיטקטורה 16.8): הזהות המאומתת חיה ב-Supabase Auth, אבל כל הקוד העסקי
// מדבר אך ורק עם טבלת המראה users שלנו (schema.prisma) - הפונקציה כאן היא התפר היחיד בין
// השניים. ה-claims מגיעים מוזרקים (getClaims) כדי שהבדיקות יריצו את כל הלוגיקה אופליין עם
// fake-db, בלי Supabase אמיתי - אותו דפוס כמו complete המוזרק בצינור ה-LLM.

// מה שאנחנו צריכים מ-JWT מאומת: מזהה הזהות (sub) והאימייל. שדות נוספים לא חוצים את התפר
export interface AuthClaims {
  sub: string;
  email: string | null;
}

// getClaims מחזיר null כשאין סשן תקף (אין cookie, חתימה פסולה, או שה-env של Supabase חסר)
export type ClaimsGetter = () => Promise<AuthClaims | null>;

export interface SessionUser {
  id: string;
  authId: string | null;
  email: string | null;
  role: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// db: PrismaClient או ה-fake של הבדיקות - רק user נצרך כאן
type UserDb = { user: any };

// מציאת (או יצירת) שורת המראה של המשתמש המחובר. שלושה מסלולים, לפי הסדר:
// 1. שורה קיימת לפי authId - המסלול החם של כל בקשה מחוברת.
// 2. שורה קיימת לפי email בלי authId - "תביעת" שורה שנזרעה מראש (כך אדמין ראשון: זורעים שורת
//    email+role=admin לפני הכניסה הראשונה, וההתחברות הראשונה מאמצת אותה בלי לאבד את ה-role).
// 3. אין שורה - נוצרת חדשה עם role ברירת המחדל של הסכמה ("owner").
// הפונקציה מרפאת את עצמה: גם אם שורת המראה נמחקה (ניקוי DB) בזמן שהסשן בדפדפן חי, הבקשה
// הבאה יוצרת אותה מחדש - אין תלות בסדר הקמה.
export async function getSessionUser(db: UserDb, getClaims: ClaimsGetter): Promise<SessionUser | null> {
  const claims = await getClaims();
  if (claims == null) return null;

  const byAuthId = await db.user.findUnique({ where: { authId: claims.sub } });
  if (byAuthId != null) {
    // סנכרון אימייל: המשתמש שינה אימייל בצד Supabase - השורה שלנו מתעדכנת בשקט. כשל (למשל
    // האימייל החדש כבר תפוס בשורה אחרת - ייחודיות) לא מפיל את הבקשה, רק נרשם בלוג השרת
    if (claims.email != null && byAuthId.email !== claims.email) {
      try {
        return toSessionUser(await db.user.update({ where: { id: byAuthId.id }, data: { email: claims.email } }));
      } catch (err) {
        console.error("session: email sync failed:", err);
      }
    }
    return toSessionUser(byAuthId);
  }

  if (claims.email != null) {
    const byEmail = await db.user.findUnique({ where: { email: claims.email } });
    if (byEmail != null && byEmail.authId == null) {
      return toSessionUser(await db.user.update({ where: { id: byEmail.id }, data: { authId: claims.sub } }));
    }
  }

  try {
    return toSessionUser(await db.user.create({ data: { authId: claims.sub, email: claims.email } }));
  } catch (err) {
    // מרוץ יצירה: שתי בקשות ראשונות במקביל - השנייה נופלת על ייחודיות authId וקוראת את השורה
    // שהראשונה יצרה. אם גם הקריאה החוזרת ריקה - זו שגיאה אמיתית ועולה הלאה
    const raced = await db.user.findUnique({ where: { authId: claims.sub } });
    if (raced != null) return toSessionUser(raced);
    throw err;
  }
}

function toSessionUser(row: { id: string; authId: string | null; email: string | null; role: string }): SessionUser {
  return { id: row.id, authId: row.authId, email: row.email, role: row.role };
}
