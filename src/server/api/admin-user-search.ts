import type { SessionUser } from "../auth/session";
import { isAdmin } from "../auth/guard";

// חיפוש משתמשים להתחזות מסרגל העליון (בקשת מייסד 20.8). אותו שער בדיוק כמו שאר פעולות
// הניהול: הזהות האמיתית ולא הזהות הפועלת, ולא-אדמין מקבל 404 ולא 403 - כדי שקיומו של
// המסלול לא ייחשף למי שאינו אמור לדעת עליו.
//
// למה תוצאה מצומצמת ולא רשימה מלאה: זו תיבת השלמה, לא מסך. שמונה הצעות זה מה שאפשר
// לקרוא בלי לגלול, וזה גם מה שמונע ממסלול פתוח-למחצה להפוך לייצוא של כל טבלת המשתמשים.

export const USER_SEARCH_LIMIT = 8;
/** מתחת לזה כל חיפוש מחזיר כמעט את כל הטבלה, וזו לא השלמה אלא רשימה */
export const USER_SEARCH_MIN_CHARS = 2;

export interface UserSuggestion {
  id: string;
  email: string | null;
  role: string;
}

export interface UserSearchDeps {
  getRealUser: () => Promise<SessionUser | null>;
  search: (q: string, limit: number) => Promise<UserSuggestion[]>;
}

export function makeUserSearchHandler(deps: UserSearchDeps) {
  return async function handle(req: Request): Promise<Response> {
    const real = await deps.getRealUser();
    if (real == null) return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
    if (!isAdmin(real)) return Response.json({ error: "לא נמצא" }, { status: 404 });

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    // שאילתה קצרה מדי אינה שגיאה - היא פשוט עוד לא חיפוש. מערך ריק, בלי רעש
    if (q.length < USER_SEARCH_MIN_CHARS) return Response.json({ users: [] });

    const users = await deps.search(q, USER_SEARCH_LIMIT);
    // המשתמש המחובר לא מוצע לעצמו: התחזות לעצמך היא פעולה ריקה
    return Response.json({ users: users.filter((u) => u.id !== real.id) });
  };
}
