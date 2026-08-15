"use client";

import { useAttachWait, useBlockedWait, useScanStream, type StepLine, type Target } from "./use-scan-stream";

export type ScanAttach = { diagnosisId: string; status: string };

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

// מסך המתנה משותף לשני המצבים שבהם לא פותחים זרם חדש: attach (יודעים מ-page.tsx מראש שיש
// אבחון חי) וגם blocked (המנעול בצד לקוח תפס mount שני לאותו יעד באותו טעינת עמוד). בשני
// המקרים אין הצדקה לסריקה נוספת בתשלום - רק מציגים שמשהו קורה ברקע.
function WaitingScreen({
  message, showHomeLink,
}: {
  message: string;
  showHomeLink?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-busy="true">
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">
        הסריקה כבר רצה ברקע
      </h1>
      <p className="mt-2 animate-fade-up text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        {message}
      </p>
      <div
        role="status"
        aria-live="polite"
        className="mt-10 flex animate-fade-up items-center gap-3"
        style={{ animationDelay: "160ms" }}
      >
        <span className="h-2 w-2 rounded-full bg-[#111111] animate-pulse" aria-hidden="true" />
        <span className="text-sm text-[#6F6E6A]">בודקים כל כמה שניות אם הדוח מוכן</span>
      </div>
      {showHomeLink && (
        <a
          href="/"
          className="mt-6 inline-block animate-fade-up text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
          style={{ animationDelay: "240ms" }}
        >
          חזרה לעמוד הראשי
        </a>
      )}
    </main>
  );
}

// מצב attach: page.tsx כבר קבע (בצד שרת, לפני שהמסך הזה בכלל התרנדר) שיש אבחון חי ליעד -
// לא פותחים POST /api/diagnose חדש בשום תנאי, רק שואלים כל 3 שניות אם הוא הגיע ל-report_ready.
function AttachedScan({ diagnosisId }: { diagnosisId: string }) {
  useAttachWait(diagnosisId);
  return <WaitingScreen message="מתחברים אליה, הדוח ייפתח אוטומטית כשיהיה מוכן" />;
}

// המסך החסום מנוטר לפי היעד (אין לו diagnosisId): ברגע שהסריקה שרצה ברקע מסיימת - מנווטים
// לדוח, בדיוק כמו attach. בלי זה המסך היה נשאר תקוע לנצח גם כשהדוח כבר מוכן (באג קמפאי 15.8)
function BlockedScan({ target }: { target: Target }) {
  useBlockedWait(target);
  return <WaitingScreen message="סריקה לעסק הזה כבר רצה בחלון אחר" showHomeLink />;
}

function LiveScan({ target }: { target: Target }) {
  const { title, lines: steps, error, blocked } = useScanStream(target);

  if (blocked) {
    return <BlockedScan target={target} />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-busy={error == null}>
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 animate-fade-up text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        בדרך כלל זה לוקח פחות מדקה
      </p>

      {error && (
        <div
          role="alert"
          className="mt-8 animate-fade-up rounded-lg border border-black/[0.06] bg-[#FDEBEC] p-5 text-[#9F2F2D]"
        >
          <p>{error}</p>
          <a
            href="/"
            className="mt-2 inline-block text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
          >
            חזרה לעמוד הראשי
          </a>
        </div>
      )}

      {steps.length > 0 && (
        <ul
          role="status"
          aria-live="polite"
          className="mt-10 divide-y divide-black/[0.06] border-t border-black/[0.06]"
        >
          {steps.map((s, i) => (
            <li
              key={s.key}
              className="flex animate-fade-up items-center gap-4 py-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <StepIndicator step={s} />
              <div className="min-w-0 flex-1">
                <p>{s.label}</p>
                {s.done && s.detail && (
                  <p className="mt-0.5 text-sm tabular-nums text-[#6F6E6A]">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function ScanRunner({ target, attach }: { target: Target; attach?: ScanAttach }) {
  if (attach) return <AttachedScan diagnosisId={attach.diagnosisId} />;
  return <LiveScan target={target} />;
}
