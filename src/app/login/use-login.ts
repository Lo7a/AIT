"use client";
// השכבה היחידה של מסך הכניסה שמדברת עם Supabase (דפדפן): שולחת קישור כניסה / מפנה ל-Google,
// ומתרגמת תוצאות לאירועים על ה-reducer הטהור (login-logic.ts). ה-client נוצר עצל וחד-פעמי -
// רק כשיש env (המסך מציג הודעת הגדרה אחרת, ראו page.tsx).
import { useReducer, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { INITIAL_LOGIN_STATE, isValidEmail, loginReducer } from "./login-logic";

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export function useLogin() {
  const [state, dispatch] = useReducer(loginReducer, INITIAL_LOGIN_STATE);
  const clientRef = useRef<ReturnType<typeof makeClient> | null>(null);
  const client = () => (clientRef.current ??= makeClient());

  async function sendMagicLink() {
    // ה-reducer שופט ולידציה וכפילויות; כאן בודקים לפניו רק כדי לא לירות בקשה על קלט פסול
    if (!isValidEmail(state.email) || state.phase === "sending") {
      dispatch({ type: "submit" });
      return;
    }
    dispatch({ type: "submit" });
    try {
      // ברירת המחדל של תבנית המייל מפנה דרך emailRedirectTo (זרימת code -> /auth/callback);
      // אם תבנית ה-token_hash הוגדרה בדשבורד, הקישור נוחת ישירות ב-/auth/confirm - שני
      // המסלולים בנויים ועובדים (ראו app/auth)
      const { error } = await client().auth.signInWithOtp({
        email: state.email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error != null) {
        dispatch({ type: "failed", message: "שליחת הקישור נכשלה, נסו שוב בעוד רגע" });
        return;
      }
      dispatch({ type: "sent" });
    } catch {
      dispatch({ type: "failed", message: "שליחת הקישור נכשלה, נסו שוב בעוד רגע" });
    }
  }

  async function signInWithGoogle() {
    try {
      const { error } = await client().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // הצלחה = הדפדפן כבר בדרך לגוגל; רק כשל נשאר כאן להצגה
      if (error != null) dispatch({ type: "failed", message: "הכניסה עם Google נכשלה, נסו שוב" });
    } catch {
      dispatch({ type: "failed", message: "הכניסה עם Google נכשלה, נסו שוב" });
    }
  }

  return {
    state,
    editEmail: (email: string) => dispatch({ type: "edit", email }),
    sendMagicLink,
    signInWithGoogle,
    resetToForm: () => dispatch({ type: "reset" }),
  };
}
