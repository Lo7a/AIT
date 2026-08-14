"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NdjsonParser } from "../ndjson";
import type { DiagnoseEvent, DiagnoseStepKey } from "../../server/diagnose-events";

type Target = { placeId?: string; name?: string; url?: string };

type StepLine = {
  key: DiagnoseStepKey;
  label: string;
  done: boolean;
  ok?: boolean;
  detail?: string;
};

// הגנת אנטי-כפילות ברמת המודול - זו ההגנה האמיתית על עלות בפועל, לא reactStrictMode.
// כל יעד (מזוהה לפי JSON.stringify) שכבר יש עבורו סריקה רצה מסומן כאן; ניסיון נוסף
// לטעון את הרכיב עבור אותו יעד (למשל רינדור כפול, ניווט הלוך-חזור) לא יורה סריקה שנייה.
// reactStrictMode כבוי ב-next.config.ts כדי לצמצם רעש בפיתוח בלבד - הוא לא ההגנה עצמה,
// כי בפרודקשן אין הכפלת אפקטים ממילא. המפתח משוחרר רק ב-done/error, כדי לאפשר בעתיד
// אבחון חוזר של אותו עסק (למשל אחרי שהאתר שלו השתנה).
const startedTargets = new Set<string>();

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function StepIndicator({ step }: { step: StepLine }) {
  if (!step.done) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-[#111111] animate-pulse" />
      </span>
    );
  }
  if (step.ok) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#EDF3EC] text-[#346538]">
        <CheckIcon />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#FDEBEC] text-[#9F2F2D]">
      <FailIcon />
    </span>
  );
}

export function ScanRunner({ target }: { target: Target }) {
  const router = useRouter();
  const key = JSON.stringify(target);
  const guardedRef = useRef(false);
  const [title, setTitle] = useState("מתחילים את האבחון");
  const [steps, setSteps] = useState<StepLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // שער כפול: startedTargets (חוצה-רכיבים, שורד רימאונט) + guardedRef (מגן על ה-mount
    // הנוכחי מפני הרצה כפולה של אותו effect באותה מופע רכיב)
    if (startedTargets.has(key) || guardedRef.current) return;
    startedTargets.add(key);
    guardedRef.current = true;

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
          release();
          router.replace(`/report/${e.diagnosisId}`);
          break;
        case "error":
          release();
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
            if (cancelled) return;
            applyEvent(e);
          }
        }
        const rest = parser.flush();
        for (const e of rest) {
          if (cancelled) return;
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
    };
  }, [key, router, target]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="animate-fade-up font-[family-name:var(--font-serif)] text-3xl font-bold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 animate-fade-up text-[#787774]" style={{ animationDelay: "80ms" }}>
        בדרך כלל זה לוקח פחות מדקה
      </p>

      {error && (
        <div className="mt-8 animate-fade-up rounded-lg border border-black/[0.06] bg-[#FDEBEC] p-5 text-[#9F2F2D]">
          <p>{error}</p>
          <a href="/" className="mt-2 inline-block text-[#111111] underline-offset-4 hover:underline">
            חזרה לעמוד הראשי
          </a>
        </div>
      )}

      {steps.length > 0 && (
        <ul className="mt-10 divide-y divide-black/[0.06] border-t border-black/[0.06]">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className="flex animate-fade-up items-center gap-4 py-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <StepIndicator step={s} />
              <div className="min-w-0 flex-1">
                <p className="tabular-nums">{s.label}</p>
                {s.done && s.detail && <p className="mt-0.5 text-sm text-[#787774]">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
