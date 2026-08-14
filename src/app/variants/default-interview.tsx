"use client";

import { useEffect, useRef } from "react";
import type { InterviewSnapshot } from "../../server/run-interview";
import { useInterviewChat } from "../interview/use-interview-chat";
import type { ChatMessage, SectionProgressItem } from "../interview/chat-logic";

// מסך הראיון בשפת העיצוב הזמנית הקיימת (ראו default-screens.tsx) - אין כאן שום לוגיקה,
// רק תצוגה על גבי useInterviewChat. גרסת עיצוב עתידית מחליפה את הקובץ הזה בלבד.

const SECONDARY_BTN =
  "rounded-md border border-black/[0.12] px-4 py-2 text-sm text-[#111111] hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";
const QUIET_BTN =
  "px-4 py-2 text-sm text-[#6F6E6A] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";

const CHIP_CLASSES: Record<SectionProgressItem["state"], string> = {
  full: "border-[#111111] bg-[#111111] text-white",
  partial: "border-[#111111]/25 bg-[#F1F0EE] text-[#111111]",
  none: "border-black/[0.12] text-[#6F6E6A]",
};

function TypingDots() {
  return (
    <div
      className="flex max-w-[85%] animate-fade-up items-center gap-2 self-start rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm text-[#6F6E6A]"
      aria-hidden="true"
    >
      <span>חושב</span>
      <span className="flex items-end gap-0.5">
        <span className="h-1 w-1 animate-bounce rounded-full bg-[#6F6E6A]" style={{ animationDelay: "0ms" }} />
        <span className="h-1 w-1 animate-bounce rounded-full bg-[#6F6E6A]" style={{ animationDelay: "150ms" }} />
        <span className="h-1 w-1 animate-bounce rounded-full bg-[#6F6E6A]" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-lg bg-[#111111] px-4 py-2.5 text-white">
        {message.content}
      </div>
    );
  }
  return (
    <div className="max-w-[85%] self-start whitespace-pre-wrap break-words rounded-lg border border-black/[0.06] bg-white px-4 py-2.5">
      {message.content}
    </div>
  );
}

export function DefaultInterview({
  diagnosisId, initial,
}: {
  diagnosisId: string;
  initial: InterviewSnapshot;
}) {
  const {
    messages, busy, starting, finishing, input, freeText, visible, sections,
    completenessPct, error, closed,
    inputRef, send, skip, finish, setInput, setFreeText,
  } = useInterviewChat(diagnosisId, initial);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // גלילה אוטומטית היא אפקט ויזואלי גרידא, לכן חי כאן ולא ב-hook (ראו use-scan-stream.ts
    // להערת ה-scroll המקבילה במסך הסריקה)
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const inputDisabled = busy || starting || finishing || closed;
  const controlsDisabled = busy || starting;

  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-busy={starting || busy || finishing}>
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight">
        ראיון קצר על העסק
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        כמה שאלות ממוקדות שיעזרו לדייק את ההמלצות. אפשר לדלג, לעבור לכתיבה חופשית ולסיים מתי שרוצים.
      </p>

      <section className="mt-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#F1F0EE]">
          <div
            className="h-[2px] rounded-full bg-[#111111] transition-[width] duration-500"
            style={{ width: `${completenessPct}%` }}
          />
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {sections.map((s) => (
            <li key={s.key} className={`rounded-full border px-2.5 py-1 text-xs ${CHIP_CLASSES[s.state]}`}>
              {s.label}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-live="polite"
        className="mt-8 flex animate-fade-up flex-col gap-3"
        style={{ animationDelay: "160ms" }}
      >
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {busy && <TypingDots />}
        <div ref={bottomRef} />
      </section>

      <div className="mt-6 animate-fade-up" style={{ animationDelay: "200ms" }}>
        {freeText ? (
          <div className="rounded-lg border border-black/[0.06] bg-white p-5">
            <p className="text-lg font-medium">ספרו לי על העסק במילים שלכם</p>
            {visible == null && (
              <p className="mt-1 text-sm text-[#6F6E6A]">אפשר להמשיך בכתיבה חופשית או לסיים</p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              {visible != null && (
                <button
                  type="button"
                  className={SECONDARY_BTN}
                  disabled={controlsDisabled}
                  onClick={() => setFreeText(false)}
                >
                  חזרה לשאלות
                </button>
              )}
              <button
                type="button"
                className={QUIET_BTN}
                disabled={finishing || starting}
                onClick={() => void finish()}
              >
                סיום הראיון
              </button>
            </div>
          </div>
        ) : (
          visible && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-5">
              <p className="text-lg font-medium">{visible.text}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className={SECONDARY_BTN} disabled={controlsDisabled} onClick={skip}>
                  דלג
                </button>
                <button
                  type="button"
                  className={SECONDARY_BTN}
                  disabled={controlsDisabled}
                  onClick={() => setFreeText(true)}
                >
                  כתיבה חופשית
                </button>
                <button
                  type="button"
                  className={QUIET_BTN}
                  disabled={finishing || starting}
                  onClick={() => void finish()}
                >
                  סיום הראיון
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {error && (
        <p className="mt-4 animate-fade-up text-sm text-[#B3261E]" role="alert">
          {error} - אפשר לנסות שוב
        </p>
      )}

      <div className="mt-4 flex animate-fade-up items-end gap-3" style={{ animationDelay: "240ms" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          rows={2}
          placeholder="כתבו כאן"
          className="min-h-[3rem] flex-1 resize-none rounded-lg border border-black/[0.12] bg-white px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={inputDisabled || input.trim().length === 0}
          className="shrink-0 rounded-md bg-[#111111] px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          שליחה
        </button>
      </div>
    </main>
  );
}
