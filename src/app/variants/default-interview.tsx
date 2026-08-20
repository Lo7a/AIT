"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { InterviewSnapshot } from "../../server/run-interview";
import { useInterviewChat } from "../interview/use-interview-chat";
import type { ChatMessage, SectionProgressItem } from "../interview/chat-logic";
import { AppShell } from "../ui/app-shell";
import { ImpersonateSearch } from "../ui/impersonate-search";
import { UserMenu } from "../ui/user-menu";
import { AnswerOptions } from "../ui/answer-options";
import { FillBar } from "../ui/motion";

// מסך הראיון בשפת העיצוב הנבחרת (הכרעת מייסד 18.8: כהה פרמיום, סגול וברקת, Rubik - ראו
// globals.css) - אין כאן שום לוגיקת עסק, רק תצוגה על גבי useInterviewChat. ניהול פוקוס
// כן חי כאן (ולא בהוק): הוא תלוי-DOM/תזמון-רינדור, לא כלל עסקי - ראו ההערות ליד ה-effect למטה.
// כללי החלקים המונפשים: מחלקות .rv יושבות רק על עטיפות סטטיות שנטענות פעם אחת עם המסך -
// אף פעם לא על הודעות/פאנלים שמתחלפים עם ה-state, כדי ששינוי state לא יריץ כניסה מחדש.

// הבדל מלא/חלקי/כלום לא נשען על צבע בלבד: full מלא ובגבול רציף, partial בגבול מקווקו
// עם נקודה מוקפת, none בגבול רציף דהוי בלי נקודה בכלל - ניתן להבחין גם
// בגווני אפור/עיוורון צבעים
const SECTION_CHIP_STYLE: Record<SectionProgressItem["state"], CSSProperties> = {
  full: { color: "var(--acc2-soft)", background: "rgba(var(--acc2-rgb),.09)", borderColor: "rgba(var(--acc2-rgb),.35)" },
  partial: { color: "var(--txt)", background: "var(--surface-1)", borderStyle: "dashed", borderColor: "rgba(var(--acc-rgb),.5)" },
  none: { color: "var(--dim)", background: "transparent", borderColor: "var(--hair-soft)" },
};
const STATE_LABEL: Record<SectionProgressItem["state"], string> = {
  full: "הושלם",
  partial: "חלקי",
  none: "עוד לא",
};

// כפתור-קו שקט (סיום הראיון): ghost-act מ-globals בלי מצב disabled משלו, אז מוסיפים כאן
const GHOST_BTN = "ghost-act disabled:cursor-not-allowed disabled:opacity-40";

function SectionChip({ item }: { item: SectionProgressItem }) {
  return (
    <li
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={SECTION_CHIP_STYLE[item.state]}
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

// החץ בעיגול של כפתורי .btn (globals) - בממשק עברי קדימה = שמאלה
function CapArrow() {
  return (
    <span className="cap" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </span>
  );
}

function TypingDots() {
  return (
    // הטקסט "חושב" נשאר נגיש (לא aria-hidden) כדי שהוא ייקרא בתוך אזור ה-aria-live של
    // ההודעות - רק הנקודות המונפשות עצמן דקורטיביות
    <div className="flex max-w-[85%] animate-fade-up items-center gap-2 self-start rounded-2xl border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] px-4 py-2.5 text-sm text-[color:var(--mut)]">
      <span>חושב</span>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "0ms" }} />
        <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "150ms" }} />
        <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[62ch] self-end whitespace-pre-wrap break-words rounded-2xl border border-[rgba(var(--acc-rgb),.3)] bg-[rgba(var(--acc-rgb),.14)] px-4 py-2.5">
        {message.content}
      </div>
    );
  }
  return (
    <div className="max-w-[62ch] self-start whitespace-pre-wrap break-words rounded-2xl border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] px-4 py-2.5">
      {message.content}
    </div>
  );
}

export function DefaultInterview({
  diagnosisId, initial, businessName, isAdmin = false, userEmail = null,
}: {
  diagnosisId: string;
  initial: InterviewSnapshot;
  businessName?: string;
  isAdmin?: boolean;
  userEmail?: string | null;
}) {
  const {
    messages, busy, starting, finishing, input, freeText, visible, sections,
    completenessPct, error, closed, canSend, canFinish, canSkip, canAnswer, canConfirmOptions,
    selectedOptions, customInputOpen,
    send, skip, finish, selectOption, confirmOptions, toggleOption, openCustomInput, setInput, setFreeText,
  } = useInterviewChat(diagnosisId, initial);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // קבוצת התשובות נקראת בשם השאלה עצמה ולא בתווית גנרית
  const promptId = useId();
  const inputDisabled = busy || starting || finishing || closed;
  // השאלה הנוכחית מציעה צ'יפים ועדיין לא נלחץ "אחר" - פאנל הצ'יפים מוצג במקום תיבת הטקסט
  // המשותפת (אפיון מחדש-ראיון, החלטה D). בלי אפשרויות (כמו שאלת הסיכום) - נשאר בדיוק כמו היום.
  const showChips = !freeText && visible != null && (visible.options?.length ?? 0) > 0 && !customInputOpen;
  const showTextInput = !showChips;

  useEffect(() => {
    // גלילה אוטומטית היא אפקט ויזואלי גרידא, לכן חי כאן ולא ב-hook (ראו use-scan-stream.ts
    // להערת ה-scroll המקבילה במסך הסריקה)
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  // ניהול פוקוס: focus() על תיבת טקסט מנוטרלת (disabled) הוא no-op בדפדפן, ובזמן ש-inputDisabled
  // הוא true הפוקוס כבר "נפל" ל-body. לכן לא מספיק לקרוא focus() מיד אחרי dispatch (זה בדיוק
  // הבאג שהיה כאן) - צריך effect שרץ אחרי שהרינדור בפועל הפך את השדה בחזרה לפעיל, ותופס במפורש
  // את המעבר true -> false. בנתיב resume (הראיון כבר interviewing) inputDisabled false כל הזמן
  // אז אין מעבר ואין פוקוס-גניבה בטעינה; בנתיב start טרי הוא true בהתחלה (starting) והופך ל-false
  // רק אחרי שה-POST /start חוזר - זה כן מעבר אמיתי, וזה בכוונה: מיד כשאפשר להקליד, הפוקוס שם
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

  // "אחר": בניגוד לדלג/מעבר מצב למעלה, כאן התיבה לא הייתה קיימת בכלל רגע לפני הלחיצה (showChips
  // היה true, showTextInput false) - focus() מיידי היה פוגע ב-ref ריק (הרכיב עוד לא רונדר).
  // צריך effect שרץ אחרי שהרינדור בפועל הוסיף את התיבה, בדיוק כמו wasDisabledRef למעלה אבל
  // על המעבר false -> true של customInputOpen במקום busy/starting/finishing/closed
  const wasCustomInputOpenRef = useRef(customInputOpen);
  useEffect(() => {
    if (!wasCustomInputOpenRef.current && customInputOpen) {
      inputRef.current?.focus();
    }
    wasCustomInputOpenRef.current = customInputOpen;
  }, [customInputOpen]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <AppShell active="interview" diagnosisId={diagnosisId} userLabel={userEmail} isAdmin={isAdmin}>
      {/* שורת הזהות: על איזה עסק הראיון הזה. היה חסר כאן בלבד, וכשיש כמה אבחונים אי אפשר
          היה לדעת עם מי מדברים (דיווח מייסד 20.8). אותו מבנה בדיוק כמו בדוח וב-Roadmap */}
      {businessName != null && businessName !== "" && (
        <header className="topbar">
          {/* רק הזהות. "הדוח חי" כבר מוצג בכותרת המסך עצמו, ולהראות אותו פעמיים
              על אותו מסך זה רעש ולא הדגשה */}
          <span className="brand-txt"><small>הראיון</small><b>{businessName}</b></span>
          <div className="side">
            {isAdmin && <ImpersonateSearch />}
            <UserMenu email={userEmail} isAdmin={isAdmin} />
          </div>
        </header>
      )}
      {/* אותה פריסת שתי-עמודות של הדוח (.repC) ולא רוחב משלו. עד 20.8 המסך הזה ישב על
          760 פיקסלים בזמן שכל שאר המערכת על 94 אחוז - הוא נראה כמו מסך של מוצר אחר.
          העמודה הצדדית נושאת את "איפה אני עומד" והראשית את השיחה עצמה.
          הרוחב הקריא נשמר בתוך התוכן ולא במכל: הבועות חסומות ב-62ch ותיבת התשובה
          ב-72ch, כי שורת טקסט ברוחב 900 פיקסלים היא שורה שאי אפשר לעקוב אחריה */}
      <main className="repC" aria-busy={starting || busy || finishing}>
        {/* העמודה הצדדית נושאת "איפה אני עומד" בלבד. הכותרת והתיאור עברו לעמודה
            הראשית: כותרת של 32 פיקסלים ופסקה של 52 תווים בתוך רצועה של 318 פיקסלים
            נשברות לשבע שורות, וגם ככה מקומה של כותרת העמוד הוא בראש התוכן */}
        <aside className="rep-side">
        {/* הכרטיס נבנה מחדש (דיווח מייסד 20.8: "הדוח חי" לא התחבר לשאר).
            הוא היה גלולה ירוקה מרחפת בראש הכרטיס בלי הקשר - תג בלי משפט. עכשיו יש
            כאן סדר אחד: מה המספר, מה הפס שמתחתיו אומר, מה כבר נאסף, ובסוף מה שהתג
            באמת התכוון לומר - בעברית פשוטה ולא כסיסמה */}
        <section className="shell rv d1">
          <div className="core card-pad">
            <h2 className="card-title flush">שלמות האבחון</h2>
            <div
              role="progressbar"
              aria-valuenow={completenessPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="שלמות האבחון"
              className="mt-3"
            >
              <span className="num block text-[34px] font-extrabold leading-none tracking-[-.03em] text-[color:var(--acc-soft)]">
                {completenessPct}%
              </span>
              <div className="mt-3"><FillBar percent={completenessPct} /></div>
            </div>

            <p className="mt-5 text-[10.5px] font-bold tracking-[.12em] text-[color:var(--dim)]">
              מה כבר יש לנו
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {sections.map((s) => (
                <SectionChip key={s.key} item={s} />
              ))}
            </ul>

            {/* מה ש"הדוח חי" ניסה להגיד, אמור: כל תשובה מרעננת את scan.scores מיד
                (run-interview). עובדה מערכתית, ולכן היא נאמרת כמשפט ולא כתג */}
            <p className="mt-5 flex items-start gap-2 border-t pt-4 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--row-line)", color: "var(--mut)" }}>
              <span className="live-dot" aria-hidden="true" />
              כל תשובה מעדכנת את הדוח מיד. אפשר לעצור באמצע ולחזור.
            </p>
          </div>
        </section>
        </aside>

        <div className="rep-main">
        {/* כותרת העמוד, גדולה ובראש התוכן - כמו בתוכנית העבודה (הנחיית מייסד 20.8) */}
        <header className="page-head rv">
          <h1>ראיון קצר על העסק</h1>
          <p>כמה שאלות ממוקדות שיעזרו לדייק את ההמלצות. אפשר לדלג, לעבור לכתיבה חופשית ולסיים מתי שרוצים.</p>
        </header>

        <section aria-live="polite" className="rv d2 flex flex-col gap-3">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {(busy || starting) && <TypingDots />}
          <div ref={bottomRef} />
        </section>

        {/* העטיפה כאן סטטית (תמיד מרונדרת) - רק התוכן הפנימי מתחלף בין המצבים, כך שהחלפת
            פאנל לא מריצה שוב את אנימציית הכניסה */}
        <div className="rv d3 mt-6">
          {freeText ? (
            <div className="shell">
              <div className="core card-pad">
                <p className="text-[16.5px] font-bold leading-snug tracking-[-.01em]">ספרו לי על העסק במילים שלכם</p>
                {visible == null && (
                  <p className="mt-1 text-[12.5px] text-[color:var(--mut)]">אפשר להמשיך בכתיבה חופשית או לסיים</p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {visible != null && (
                    <button
                      type="button"
                      className="btn-quiet"
                      disabled={!canSkip}
                      onClick={() => handleSetFreeText(false)}
                    >
                      חזרה לשאלות
                    </button>
                  )}
                  <button type="button" className={GHOST_BTN} disabled={!canFinish} onClick={() => void finish()}>
                    סיום הראיון
                  </button>
                </div>
              </div>
            </div>
          ) : showChips && visible?.options ? (
            <div className="shell">
              <div className="core card-pad">
                <p id={promptId} className="text-[16.5px] font-bold leading-snug tracking-[-.01em]">{visible.text}</p>
                {/* תיבת התשובות המשותפת (ui/answer-options.tsx) - אותה תיבה משרתת גם את
                    ההדגמה בדף הנחיתה. key על מפתח השאלה: תיבה חדשה לכל שאלה, אחרת סימון
                    ה"נבחר" של התשובה הקודמת נגרר לשאלה הבאה */}
                <div className="mt-4">
                  <AnswerOptions
                    key={visible.key}
                    options={visible.options}
                    selected={visible.multiSelect ? selectedOptions : []}
                    multiSelect={visible.multiSelect}
                    disabled={!canAnswer}
                    onPick={(label) => (visible.multiSelect ? toggleOption(label) : selectOption(label))}
                    onOther={openCustomInput}
                    labelledBy={promptId}
                  />
                </div>
                {visible.multiSelect && (
                  <div className="mt-4">
                    <button
                      type="button"
                      className="btn sm"
                      disabled={!canConfirmOptions}
                      onClick={() => void confirmOptions()}
                    >
                      שליחה
                      <CapArrow />
                    </button>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-[color:var(--hair)] pt-4">
                  <button type="button" className="btn-quiet" disabled={!canSkip} onClick={handleSkip}>
                    דלג
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={!canSkip}
                    onClick={() => handleSetFreeText(true)}
                  >
                    כתיבה חופשית
                  </button>
                  <button type="button" className={GHOST_BTN} disabled={!canFinish} onClick={() => void finish()}>
                    סיום הראיון
                  </button>
                </div>
              </div>
            </div>
          ) : (
            visible && (
              <div className="shell">
                <div className="core card-pad">
                  <p className="text-[16.5px] font-bold leading-snug tracking-[-.01em]">{visible.text}</p>
                  {visible.options != null && customInputOpen && (
                    <p className="mt-1 text-[12.5px] text-[color:var(--mut)]">אפשר לכתוב את התשובה למטה</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" className="btn-quiet" disabled={!canSkip} onClick={handleSkip}>
                      דלג
                    </button>
                    <button
                      type="button"
                      className="btn-quiet"
                      disabled={!canSkip}
                      onClick={() => handleSetFreeText(true)}
                    >
                      כתיבה חופשית
                    </button>
                    <button type="button" className={GHOST_BTN} disabled={!canFinish} onClick={() => void finish()}>
                      סיום הראיון
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {error && (
          <p className="form-error mt-4" role="alert">
            {error}
          </p>
        )}

        {showTextInput && (
          <div className="rv d4 mt-4 flex items-end gap-3">
            {/* .field שב-globals מעצב input בלבד - התיבה כאן היא textarea (שורות + Enter לשליחה),
                אז אותו מראה מיושם ב-utilities בלי לגעת ב-CSS המשותף */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputDisabled}
              rows={2}
              placeholder="כתבו כאן"
              aria-label="הודעה לראיון"
              className="min-h-[3.2rem] flex-1 resize-none rounded-[14px] border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] px-4 py-3 text-[15px] outline-none transition placeholder:text-[color:var(--dim)] focus:border-[rgba(var(--acc-rgb),.55)] focus:bg-[rgba(var(--acc-rgb),.06)] focus:shadow-[0_0_0_4px_rgba(var(--acc-rgb),.12)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button type="button" className="btn sm shrink-0" onClick={() => void send()} disabled={!canSend}>
              שליחה
              <CapArrow />
            </button>
          </div>
        )}
        </div>
      </main>
    </AppShell>
  );
}
