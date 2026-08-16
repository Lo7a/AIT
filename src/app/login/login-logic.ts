// לוגיקה טהורה של מסך הכניסה - בלי React ובלי Supabase, כך שגרסת עיצוב עתידית תחליף רק
// JSX/CSS וכל המעברים נבדקים אופליין. use-login.ts הוא השכבה היחידה שמדברת עם Supabase
// ומתרגמת תשובות לאירועים על ה-reducer הזה. אותו דפוס כמו roadmap-logic.ts / chat-logic.ts.

export interface LoginState {
  phase: "idle" | "sending" | "sent";
  email: string;
  error: string | null;
}

export type LoginEvent =
  | { type: "edit"; email: string }
  | { type: "submit" }
  | { type: "sent" }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const INITIAL_LOGIN_STATE: LoginState = { phase: "idle", email: "", error: null };

// ולידציה מינימלית בצד הלקוח - השיפוט האמיתי אצל Supabase; זה רק חוסך סבב שרת על שגיאת הקלדה
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function loginReducer(state: LoginState, event: LoginEvent): LoginState {
  switch (event.type) {
    case "edit":
      // עריכה מנקה שגיאה קודמת - המשתמש כבר מתקן; בזמן שליחה השדה נעול (המסך משבית, וגם כאן)
      return state.phase === "sending" ? state : { ...state, email: event.email, error: null };
    case "submit": {
      if (state.phase === "sending") return state;
      if (!isValidEmail(state.email)) {
        return { ...state, phase: "idle", error: "כתובת האימייל לא נראית תקינה, בדקו אותה שוב" };
      }
      return { ...state, phase: "sending", error: null };
    }
    case "sent":
      return state.phase === "sending" ? { ...state, phase: "sent", error: null } : state;
    case "failed":
      return { ...state, phase: "idle", error: event.message };
    case "reset":
      // "לשלוח שוב" ממצב sent - חוזרים לטופס עם אותו אימייל
      return { ...state, phase: "idle", error: null };
  }
}

// הודעת השגיאה מה-redirect של קישור פג/פסול (auth-handlers מפנה עם ?error=link)
export function linkErrorMessage(errorParam: string | null): string | null {
  return errorParam === "link" ? "קישור הכניסה פג או כבר שומש, שלחו קישור חדש" : null;
}
