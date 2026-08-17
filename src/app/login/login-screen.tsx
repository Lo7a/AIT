"use client";
// מסך כניסה בעיצוב הנבחר (הכרעת מייסד 18.8): כהה פרמיום, סגול וברקת, Rubik - כרטיס auth
// על מערכת העיצוב ב-globals.css; הרקע והמתג כהה/בהיר מגיעים גלובלית מ-layout. JSX דק בלבד:
// כל הלוגיקה ב-use-login.ts + login-logic.ts.
import type { ReactNode } from "react";
import { useLogin } from "./use-login";
import { linkErrorMessage } from "./login-logic";

// ניווט עליון מינימלי: מותג שמחזיר לדף הבית
function AuthNav() {
  return (
    <nav className="land-nav">
      <a className="brand" href="/">
        <span className="brand-mark">AIT</span>
        <span className="brand-txt">
          <small>יועץ דיגיטלי לעסקים</small>
          <b>AIT</b>
        </span>
      </a>
    </nav>
  );
}

// מעטפת הכרטיס המשותפת לשלושת מצבי המסך: מעטפת כפולה ממורכזת עם סמל המותג למעלה
function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-shell shell rv d1">
        <div className="core auth-core">
          <div className="flex justify-center">
            <span
              className="brand-mark"
              style={{ width: 44, height: 44, borderRadius: 14, fontSize: 15 }}
            >
              AIT
            </span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

// אילוץ מוצר אמיתי, לא טקסט שיווקי: זרימת הקוד של Supabase נשלמת רק בדפדפן שביקש את הקישור
function SameBrowserHint() {
  return (
    <div className="auth-hint">
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span>חשוב לפתוח את הקישור באותו דפדפן שממנו ביקשתם אותו.</span>
    </div>
  );
}

// חץ הפעולה בעיגול של כפתור הגלולה (בכיוון RTL החץ מצביע שמאלה - קדימה)
function CapArrow() {
  return (
    <span className="cap">
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </span>
  );
}

export function LoginScreen({
  configured, googleEnabled, errorParam,
}: {
  // false = מפתחות Supabase עוד לא ב-env - מציגים הודעת הגדרה כנה במקום טופס שנכשל בשקט
  configured: boolean;
  googleEnabled: boolean;
  errorParam: string | null;
}) {
  const { state, editEmail, sendMagicLink, signInWithGoogle, resetToForm } = useLogin();
  const linkError = linkErrorMessage(errorParam);

  if (!configured) {
    return (
      <>
        <AuthNav />
        <AuthCard>
          <h1>כניסה</h1>
          {/* קופסת אזהרה כנה בגווני warn (ענבר) - אותו מבנה כמו form-error, בצבעי אזהרה */}
          <p style={{
            display: "flex", alignItems: "flex-start", gap: 9,
            fontSize: 12.5, color: "var(--warn)",
            background: "rgba(var(--warn-rgb),.08)",
            border: "1px solid rgba(var(--warn-rgb),.3)",
            borderRadius: 12, padding: "10px 14px",
          }}>
            ההתחברות עוד לא הוגדרה בסביבה הזו: חסרים מפתחות Supabase בקובץ ה-env. האפליקציה ממשיכה לעבוד בלי כניסה.
          </p>
        </AuthCard>
      </>
    );
  }

  if (state.phase === "sent") {
    return (
      <>
        <AuthNav />
        <AuthCard>
          <div className="flex justify-center">
            <span className="live-tag" style={{ alignSelf: "center" }}>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              הקישור נשלח
            </span>
          </div>
          <h1>בדקו את המייל</h1>
          <p className="sub">
            שלחנו קישור כניסה אל <b dir="ltr">{state.email.trim()}</b>.
            לחיצה עליו מכניסה אתכם ישר למערכת.
          </p>
          <SameBrowserHint />
          <button type="button" onClick={resetToForm} className="btn-quiet w-full">
            לא הגיע? לשלוח שוב
          </button>
        </AuthCard>
      </>
    );
  }

  return (
    <>
      <AuthNav />
      <AuthCard>
        <h1>כניסה לאבחון העסק</h1>
        <p className="sub">מזינים אימייל ומקבלים קישור כניסה - בלי סיסמה.</p>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); void sendMagicLink(); }}
        >
          <div>
            <label htmlFor="login-email" className="field-lb">אימייל</label>
            {/* dir=ltr גם על העטיפה: מזיז את אייקון המעטפה לצד של ריווח ה-46px ומיישר את הטקסט לשמאל */}
            <span className="field" dir="ltr">
              <svg
                width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={state.email}
                onChange={(e) => editEmail(e.target.value)}
                disabled={state.phase === "sending"}
                placeholder="you@example.com"
              />
            </span>
          </div>

          {(state.error ?? linkError) != null && (
            <p role="alert" className="form-error">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                style={{ flex: "none", marginTop: 2 }}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {state.error ?? linkError}
            </p>
          )}

          <button type="submit" disabled={state.phase === "sending"} className="btn wide">
            {state.phase === "sending" ? "שולחים קישור" : "שלחו לי קישור כניסה"}
            <CapArrow />
          </button>
        </form>

        {googleEnabled && (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="btn-quiet w-full"
          >
            {/* הלוגו הרשמי של גוגל בארבעת הצבעים */}
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
              <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
            </svg>
            כניסה עם Google
          </button>
        )}

        <SameBrowserHint />

        <div className="auth-alt">
          <a href="/">חזרה לדף הבית</a>
        </div>
      </AuthCard>
    </>
  );
}
