// לוגיקה טהורה של דף הנחיתה (אנונימי): שמירת כוונת החיפוש לפני ההפניה לכניסה, ושליפתה
// אחרי ההתחברות - כדי שמה שהמבקר הקליד לא ילך לאיבוד בדרך. storage מוזרק (sessionStorage
// בפועל) - הבדיקות רצות אופליין עם אובייקט פשוט.

export const PENDING_SEARCH_KEY = "ait_pending_search";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// שמירה רק כשיש תוכן ממשי; מוחזר האם נשמר (הקורא מפנה לכניסה בכל מקרה - עם או בלי כוונה)
export function stashPendingSearch(storage: StorageLike, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    storage.setItem(PENDING_SEARCH_KEY, trimmed);
    return true;
  } catch {
    // storage חסום (מצב פרטי קשוח וכו') - הכוונה פשוט לא נשמרת, הזרימה ממשיכה
    return false;
  }
}

// שליפה חד-פעמית: הערך נמחק עם הקריאה - רענון של מסך הבית לא ימלא שוב את החיפוש
export function popPendingSearch(storage: StorageLike): string | null {
  try {
    const value = storage.getItem(PENDING_SEARCH_KEY);
    if (value == null || value.length === 0) return null;
    storage.removeItem(PENDING_SEARCH_KEY);
    return value;
  } catch {
    return null;
  }
}
