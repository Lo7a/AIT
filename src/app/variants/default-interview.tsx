"use client";

import { useEffect, useRef } from "react";
import type { InterviewSnapshot } from "../../server/run-interview";
import { useInterviewChat } from "../interview/use-interview-chat";
import type { ChatMessage, SectionProgressItem } from "../interview/chat-logic";

// מסך הראיון בשפת העיצוב הזמנית הקיימת (ראו default-screens.tsx) - אין כאן שום לוגיקת עסק,
// רק תצוגה על גבי useInterviewChat. גרסת עיצוב עתידית מחליפה את הקובץ הזה בלבד. ניהול פוקוס
// כן חי כאן (ולא בהוק): הוא תלוי-DOM/תזמון-רינדור, לא כלל עסקי - ראו ההערות ליד ה-effect למטה.

const SECONDARY_BTN =
  "rounded-md border border-black/[0.12] px-4 py-2 text-sm text-[#111111] hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";
const QUIET_BTN =
  "px-4 py-2 text-sm text-[#6F6E6A] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";

// הבדל מלא/חלקי/כלום לא נשען על צבע בלבד: full מלא ובגבול רציף, partial בגבול מקווקו
// (border-dashed) עם נקודה מוקפת, none בגבול רציף דהוי בלי נקודה בכלל - ניתן להבחין גם
// בגווני אפור/עיוורון צבעים
const CHIP_CLASSES: Record<SectionProgressItem["state"], string> = {
  full: "border-solid border-[#111111] bg-[#111111] text-white",
  partial: "border-dashed border-[#111111]/50 bg-[#F1F0EE] text-[#111111]",
  none: "border-solid border-black/[0.12] text-[#6F6E6A]",
};
const STATE_LABEL: Record<SectionProgressItem["state"], string> = {
  full: "הושלם",
  partial: "חלקי",
  none: "עוד לא",
};

function SectionChip({ item }: { item: SectionProgressItem }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${CHIP_CLASSES[item.state]}`}
      aria-label={`${item.label}: ${STATE_LABEL[item.state]}`}
    >
      {item.state !== "none" && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.state === "full" ? "bg-current" : "border border-current"}`}
        />
      )}
      {item.label}
    </li>
  );
}

function TypingDots() {
  return (
    // הטקסט "חושב" נשאר נגיש (לא aria-hidden) כדי שהוא ייקרא בתוך אזור ה-aria-live של
    // ההודעות - רק הנקודות המונפשות עצמן דקורטיביות
    <div className="flex max-w-[85%] animate-fade-up items-center gap-2 self-start rounded-lg border border-black/[0.06] bg-white px-4 py-2.5 text-sm text-[#6F6E6A]">
      <span>חושב</span>
      <span className="flex items-end gap-0.5" aria-hidden="true">
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
    completenessPct, error, closed, canSend, canFinish, canSkip,
    send, skip, finish, setInput, setFreeText,
  } = useInterviewChat(diagnosisId, initial);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputDisabled = busy || starting || finishing || closed;

  useEffect(() => {
    // גלילה אוטומטית היא אפקט ויזואלי גרידא, לכן חי כאן ולא ב-hook (ראו use-scan-stream.ts
    // להערת ה-scroll המקבילה במסך הסריקה)
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  // ניהול פוקוס: focus() על תיבת טקסט מנוטרלת (disabled) הוא no-op בדפדפן, ובזמן ש-inputDisabled
  // הוא true הפוקוס כבר "נפל" ל-body. לכן לא מספיק לקרוא focus() מיד אחרי dispatch (זה בדיוק
  // הבאג שהיה כאן) - צריך effect שרץ אחרי שהרינדור בפועל הפך את השדה בחזרה לפעיל, ותופס במפורש
  // את המעבר true -> false (לא כל רינדור - אחרת גם טעינה ראשונית הייתה גונבת פוקוס מהמשתמש)
  const wasDisabledRef = useRef(inputDisabled);
  useEffect(() => {
    if (wasDisabledRef.current && !inputDisabled) {
      inputRef.current?.focus();
    }
    wasDisabledRef.current = inputDisabled;
  }, [inputDisabled]);

  // דלג/מעבר מצב לא משנים את inputDisabled (התיבה כל הזמן פעילה בזמן הזה), אז ה-effect למעלה
  // לא יתפוס את זה - הכפתור שנלחץ עלול "להיעלם" מתחת לעכבר (הפאנל מוחלף), אז מזיזים פוקוס
  // במפורש בכל handler כזה כדי שלא יישאר על body
  function handleSkip() {
    skip();
    inputRef.current?.focus();
  }
  function handleSetFreeText(value: boolean) {
    setFreeText(value);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-busy={starting || busy || finishing}>
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight">
        ראיון קצר על העסק
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        כמה שאלות ממוקדות שיעזרו לדייק את ההמלצות. אפשר לדלג, לעבור לכתיבה חופשית ולסיים מתי שרוצים.
      </p>

      <section className="mt-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div
          role="progressbar"
          aria-valuenow={completenessPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="שלמות האבחון"
          className="h-[2px] w-full overflow-hidden rounded-full bg-[#F1F0EE]"
        >
          <div
            className="h-[2px] rounded-full bg-[#111111] transition-[width] duration-500"
            style={{ width: `${completenessPct}%` }}
          />
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {sections.map((s) => (
            <SectionChip key={s.key} item={s} />
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
        {(busy || starting) && <TypingDots />}
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
                  disabled={!canSkip}
                  onClick={() => handleSetFreeText(false)}
                >
                  חזרה לשאלות
                </button>
              )}
              <button type="button" className={QUIET_BTN} disabled={!canFinish} onClick={() => void finish()}>
                סיום הראיון
              </button>
            </div>
          </div>
        ) : (
          visible && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-5">
              <p className="text-lg font-medium">{visible.text}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className={SECONDARY_BTN} disabled={!canSkip} onClick={handleSkip}>
                  דלג
                </button>
                <button
                  type="button"
                  className={SECONDARY_BTN}
                  disabled={!canSkip}
                  onClick={() => handleSetFreeText(true)}
                >
                  כתיבה חופשית
                </button>
                <button type="button" className={QUIET_BTN} disabled={!canFinish} onClick={() => void finish()}>
                  סיום הראיון
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {error && (
        <p className="mt-4 animate-fade-up text-sm text-[#B3261E]" role="alert">
          {error}
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
          aria-label="הודעה לראיון"
          className="min-h-[3rem] flex-1 resize-none rounded-lg border border-black/[0.12] bg-white px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="shrink-0 rounded-md bg-[#111111] px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          שליחה
        </button>
      </div>
    </main>
  );
}
