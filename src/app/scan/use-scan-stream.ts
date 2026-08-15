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
  // המנעול חסם את ה-mount הזה מלירות סריקה: כבר יש הרצה חיה של אותו יעד בטאב הזה (mount/רימאונט
  // קודם באותו טעינת עמוד - למשל ניווט הלוך-חזור בלי F5). לא ה-blocked שקורה בעצם ה-effect
  // הזה שרץ שוב עבור אותו mount (guardedRef) - זה נשאר no-op שקט, ראו הערה למטה.
  blocked: boolean;
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
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // שער כפול: startedTargets (חוצה-רכיבים, שורד רימאונט) + guardedRef (מגן על ה-mount
    // הנוכחי מפני הרצה כפולה של אותו effect באותה מופע רכיב). guardedRef נשמר לפי מפתח
    // היעד עצמו (לא boolean גורף) - כך שניווט searchParams-בלבד לאותו מופע רכיב
    // (/scan?A -> /scan?B) לא חוסם בטעות את היעד החדש B.
    //
    // שני התנאים לא שקולים: startedTargets.has(key) בלי guardedRef שלנו על אותו key אומר שמישהו
    // אחר (mount קודם באותו טעינת עמוד, למשל ניווט הלוך-חזור בלי F5) כבר מריץ את היעד הזה - זה
    // אמור להיראות למשתמש (blocked=true, מסך המתנה עם קישור הביתה), לא להישאר תקוע על הכותרת
    // הדיפולטית. guardedRef.current === key לבדו אומר שזה ה-effect של המופע שלנו-עצמנו שרץ שוב
    // (למשל שינוי רפרנס של target באותו mount) - ה-cleanup הקודם כבר סימן cancelled, וההרצה
    // הקודמת ממשיכה לנהל את המצב; אין כאן שום דבר לחסום למשתמש, no-op שקט כמו קודם.
    if (startedTargets.has(key)) {
      setBlocked(true);
      return;
    }
    if (guardedRef.current === key) return;
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

  return { title, lines: steps, error, done: finished, blocked };
}

export interface AttachWaitState {
  status: string | null;
}

// מצב "blocked": מנעול הטאב תפס mount שני לאותו יעד, והמסך הזה לא מכיר diagnosisId - רק את
// היעד. בלי הפולינג הזה המסך היה שקר סטטי ("בודקים כל כמה שניות") שלא מנווט לעולם, גם אחרי
// שהסריקה שרצה ברקע סיימה (באג קמפאי 15.8). שואלים לפי היעד ומנווטים כשהדוח מוכן.
export function useBlockedWait(target: Target): void {
  const router = useRouter();
  const query = target.placeId
    ? `placeId=${encodeURIComponent(target.placeId)}`
    : target.url
      ? `url=${encodeURIComponent(target.url)}`
      : null;

  useEffect(() => {
    if (!query) return; // יעד בלי מזהה בר-חיפוש - נשארים במסך הסטטי עם הקישור הביתה
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/diagnose/status?${query}`);
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { status?: string; id?: string } | null;
        if (cancelled || !data?.status || !data.id) return;
        if (data.status === "report_ready") router.replace(`/report/${data.id}`);
      } catch {
        // כשל רשת חולף - הפעימה הבאה תנסה שוב
      }
    }

    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [query, router]);
}

// מצב "attach": מסך הסריקה יודע מראש (מ-page.tsx, לפני שהוא בכלל התרנדר) שכבר יש אבחון חי
// ביעד הזה - כאן לא פותחים זרם חדש (=לא סריקה כפולה בתשלום) אלא רק שואלים כל 3 שניות מה
// הסטטוס שלו, ובהגעה ל-report_ready מנווטים לדוח בדיוק כמו שה-stream החי היה עושה בסיום.
export function useAttachWait(diagnosisId: string | null): AttachWaitState {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/diagnose/status?id=${diagnosisId}`);
        if (!res.ok) return; // 404/500 זמני - מנסים שוב בפעימה הבאה, לא הופכים לשגיאה קבועה
        const data = (await res.json()) as { status?: string };
        if (cancelled || !data.status) return;
        setStatus(data.status);
        if (data.status === "report_ready") router.replace(`/report/${diagnosisId}`);
      } catch {
        // כשל רשת חולף - הפעימה הבאה תנסה שוב
      }
    }

    void poll(); // בדיקה מיידית - לא מחכים 3 שניות ריקות אם הדוח כבר מוכן
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [diagnosisId, router]);

  return { status };
}
