"use client";
// מסך כניסה - עיצוב placeholder כמו כל המסכים (העיצוב האמיתי בשלב ב). JSX דק בלבד:
// כל הלוגיקה ב-use-login.ts + login-logic.ts.
import { useLogin } from "./use-login";
import { linkErrorMessage } from "./login-logic";

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
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">כניסה</h1>
        <p className="mt-4 rounded-lg bg-[#FBF3DB] px-4 py-3 text-[#956400]">
          ההתחברות עוד לא הוגדרה בסביבה הזו: חסרים מפתחות Supabase בקובץ ה-env. האפליקציה ממשיכה לעבוד בלי כניסה.
        </p>
      </main>
    );
  }

  if (state.phase === "sent") {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">בדקו את המייל</h1>
        <p className="mt-3 text-lg text-[#6F6E6A]">
          שלחנו קישור כניסה אל <span className="font-medium text-[#111111]" dir="ltr">{state.email.trim()}</span>.
          לחיצה עליו מכניסה אתכם ישר למערכת.
        </p>
        <button
          type="button"
          onClick={resetToForm}
          className="mt-6 text-sm font-medium text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          לא הגיע? לשלוח שוב
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">
        כניסה לאבחון העסק
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        מזינים אימייל ומקבלים קישור כניסה - בלי סיסמה.
      </p>

      <form
        className="mt-8 animate-fade-up"
        style={{ animationDelay: "160ms" }}
        onSubmit={(e) => { e.preventDefault(); void sendMagicLink(); }}
      >
        <label htmlFor="login-email" className="block text-sm font-medium">אימייל</label>
        <input
          id="login-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          value={state.email}
          onChange={(e) => editEmail(e.target.value)}
          disabled={state.phase === "sending"}
          className="mt-2 w-full rounded-lg border border-black/[0.12] bg-white px-4 py-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:opacity-60"
          placeholder="you@example.com"
        />
        {(state.error ?? linkError) != null && (
          <p role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-4 py-2 text-sm text-[#9F2F2D]">
            {state.error ?? linkError}
          </p>
        )}
        <button
          type="submit"
          disabled={state.phase === "sending"}
          className="mt-4 w-full rounded-lg bg-[#111111] px-4 py-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:opacity-60"
        >
          {state.phase === "sending" ? "שולחים קישור" : "שלחו לי קישור כניסה"}
        </button>
      </form>

      {googleEnabled && (
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="mt-4 w-full rounded-lg border border-black/[0.12] bg-white px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          כניסה עם Google
        </button>
      )}
    </main>
  );
}
