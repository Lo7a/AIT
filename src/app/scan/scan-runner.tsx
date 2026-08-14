"use client";

import { useScanStream, type StepLine, type Target } from "./use-scan-stream";

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
  const { title, lines: steps, error } = useScanStream(target);

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
