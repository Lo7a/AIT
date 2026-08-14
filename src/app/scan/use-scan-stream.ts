"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NdjsonParser } from "../ndjson";
import type { DiagnoseEvent, DiagnoseStepKey } from "../../server/diagnose-events";

export type Target = { placeId?: string; name?: string; url?: string; city?: string };

export type StepLine = {
  key: DiagnoseStepKey;
  label: string;
  done: boolean;
  ok?: boolean;
  detail?: string;
};

export interface ScanStreamState {
  title: string | null;
  lines: StepLine[];
  error: string | null;
  done: boolean;
}

// הגנת אנטי-כפילות ברמת המודול - הגנה best-effort פר-טאב על עלות בפועל, לא reactStrictMode.
// כל יעד (מזוהה לפי JSON.stringify) שכבר יש עבורו סריקה רצה מסומן כאן; ניסיון נוסף
// לטעון את הרכיב עבור אותו יעד (למשל רינדור כפול, ניווט הלוך-חזור) לא יורה סריקה שנייה.
// זו הגנה פר-טאב בלבד: שני טאבים פתוחים או רענון קשיח (F5) עדיין יכולים לירות פעמיים -
// דה-דופליקציה בצד שרת היא פריט רשום לפריסה, לא חלק מהמנעול הזה.
// reactStrictMode כבוי ב-next.config.ts כדי לצמצם רעש בפיתוח בלבד - הוא לא ההגנה עצמה,
// כי בפרודקשן אין הכפלת אפקטים ממילא. המפתח משוחרר רק ב-done/error, כדי לאפשר בעתיד
// אבחון חוזר של אותו עסק (למשל אחרי שהאתר שלו השתנה).
const startedTargets = new Set<string>();

// הוק משותף לכל גרסאות העיצוב: כל הלוגיקה הלא-ויזואלית של מסך הסריקה החיה (fetch,
// זרם NDJSON, מנעול אנטי-כפילות, ניווט בסיום) חיה כאן במקום אחד. כל גרסה בונה תצוגה
// משלה על גבי ה-state הזה בלי לגעת בלוגיקה עצמה.
export function useScanStream(target: Target): ScanStreamState {
  const router = useRouter();
  const key = JSON.stringify(target);
  const guardedRef = useRef<string | null>(null);
  const [title, setTitle] = useState<string | null>("מתחילים את האבחון");
  const [steps, setSteps] = useState<StepLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    // שער כפול: startedTargets (חוצה-רכיבים, שורד רימאונט) + guardedRef (מגן על ה-mount
    // הנוכחי מפני הרצה כפולה של אותו effect באותה מופע רכיב). guardedRef נשמר לפי מפתח
    // היעד עצמו (לא boolean גורף) - כך שניווט searchParams-בלבד לאותו מופע רכיב
    // (/scan?A -> /scan?B) לא חוסם בטעות את היעד החדש B.
    if (startedTargets.has(key) || guardedRef.current === key) return;
    startedTargets.add(key);
    guardedRef.current = key;

    let cancelled = false;
    const release = () => {
      startedTargets.delete(key);
    };

    function applyEvent(e: DiagnoseEvent) {
      switch (e.type) {
        case "created":
          setTitle(`מאבחנים את ${e.businessName}`);
          break;
        case "step":
          setSteps((prev) => [...prev, { key: e.key, label: e.label, done: false }]);
          break;
        case "step_done":
          setSteps((prev) =>
            prev.map((s) => (s.key === e.key ? { ...s, done: true, ok: e.ok, detail: e.detail } : s)),
          );
          break;
        case "done":
          setFinished(true);
          router.replace(`/report/${e.diagnosisId}`);
          break;
        case "error":
          setError(e.message);
          break;
      }
    }

    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(target),
        });
      } catch {
        // נכשל לפני שנוצר זרם כלשהו בצד השרת - לא נגרמה עלות, בטוח לשחרר
        if (!cancelled) setError("האבחון נכשל, נסו שוב");
        release();
        return;
      }
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        // שגיאות 400 הן מחרוזות עברית שלנו; כל השאר מקבל הודעה גנרית
        if (!cancelled) {
          setError(res.status === 400 && data?.error ? data.error : "האבחון נכשל, נסו שוב");
        }
        release();
        return;
      }
      try {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new NdjsonParser<DiagnoseEvent>();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const events = parser.push(decoder.decode(value, { stream: true }));
          for (const e of events) {
            // אירועי סיום חייבים לשחרר את המנעול גם אחרי רימאונט (cancelled), אחרת היעד
            // נשאר חסום למשך כל הסשן (מסך חסימה מדומה בניווט אחורה-קדימה). ה-setState
            // עצמו כן מדולג כשמבוטל - הרכיב כבר לא מותקן.
            if (e.type === "done" || e.type === "error") release();
            if (cancelled) continue;
            applyEvent(e);
          }
        }
        const rest = parser.flush();
        for (const e of rest) {
          if (e.type === "done" || e.type === "error") release();
          if (cancelled) continue;
          applyEvent(e);
        }
      } catch {
        // הזרם נקטע באמצע קריאה. לא משחררים את המפתח: הסריקה כנראה כבר עלתה כסף בפועל
        // (Places API) והשרת ממשיך אותה ברקע גם אחרי ניתוק (ראו diagnose-stream.ts) -
        // שחרור כאן היה מאפשר סריקה כפולה בתשלום כפול על אותו יעד בדיוק.
        if (!cancelled) {
          setError("החיבור נקטע. ייתכן שהסריקה ממשיכה ברקע, בדקו את הרשימה בעמוד הראשי בעוד דקה");
        }
      }
    })();

    return () => {
      cancelled = true;
      // לא מבטלים את ה-reader כאן בכוונה: הסריקה חייבת להסתיים בצד שרת גם אחרי רימאונט
    };
  }, [key, router, target]);

  return { title, lines: steps, error, done: finished };
}
