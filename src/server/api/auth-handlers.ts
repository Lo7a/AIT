// ראוטי ההתחברות כפונקציות מוזרקות (אותו דפוס כמו interview-handlers): קובצי ה-route מספקים
// closures מעל ה-client האמיתי של Supabase, והבדיקות מספקות פייקים - כל לוגיקת הניתוב,
// הולידציה והגנת ה-redirect נבדקת אופליין.

// הגנת open-redirect: פרמטר next חוזר מהמייל/מה-OAuth דרך ה-URL - מותר אך ורק נתיב יחסי
// פנימי ("/..."). "//host" הוא כתובת יחסית-פרוטוקול (יוצאת מהאתר) ולכן נחסם גם הוא
export function sanitizeNextPath(raw: string | null): string {
  if (raw == null || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

// redirect של 303 (See Other): הדפדפן תמיד ממשיך ב-GET, גם אחרי POST (התנתקות)
function redirectTo(origin: string, path: string): Response {
  return Response.redirect(new URL(path, origin), 303);
}

function loginErrorRedirect(origin: string): Response {
  return redirectTo(origin, "/login?error=link");
}

// אישור קישור כניסה מהמייל (תבנית token_hash): מאמת מול Supabase, יוצר את שורת המראה
// (ensureUser - כשל ביצירה לא חוסם את הכניסה: השכבה מרפאת את עצמה בבקשה הבאה), וממשיך פנימה
export function makeConfirmHandler(
  verifyMagicLink: (tokenHash: string) => Promise<boolean>,
  ensureUser: () => Promise<unknown>,
) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const tokenHash = url.searchParams.get("token_hash");
    const next = sanitizeNextPath(url.searchParams.get("next"));
    if (tokenHash == null || tokenHash.length === 0) return loginErrorRedirect(url.origin);
    try {
      if (!(await verifyMagicLink(tokenHash))) return loginErrorRedirect(url.origin);
      await ensureUser().catch((err) => console.error("auth confirm: ensureUser failed:", err));
      return redirectTo(url.origin, next);
    } catch (err) {
      console.error("auth confirm failure:", err);
      return loginErrorRedirect(url.origin);
    }
  };
}

// חזרה מזרימת code (ברירת המחדל של קישור המייל דרך emailRedirectTo, וגם Google OAuth בהמשך):
// החלפת ה-code בסשן (ה-code verifier כבר יושב ב-cookie בזכות @supabase/ssr) ואותו ensureUser
export function makeCallbackHandler(
  exchangeCode: (code: string) => Promise<boolean>,
  ensureUser: () => Promise<unknown>,
) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const next = sanitizeNextPath(url.searchParams.get("next"));
    if (code == null || code.length === 0) return loginErrorRedirect(url.origin);
    try {
      if (!(await exchangeCode(code))) return loginErrorRedirect(url.origin);
      await ensureUser().catch((err) => console.error("auth callback: ensureUser failed:", err));
      return redirectTo(url.origin, next);
    } catch (err) {
      console.error("auth callback failure:", err);
      return loginErrorRedirect(url.origin);
    }
  };
}

// התנתקות: POST בלבד (קישור GET שנשלח בצ'אט/מייל לא ינתק אף אחד). גם כשל בצד Supabase
// מחזיר הביתה - אין מה להציג למשתמש מעבר לזה
export function makeSignoutHandler(signOut: () => Promise<void>) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      await signOut();
    } catch (err) {
      console.error("auth signout failure:", err);
    }
    return redirectTo(url.origin, "/");
  };
}
