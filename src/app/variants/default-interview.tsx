"use client";

import { useEffect, useId, useRef } from "react";
import type { InterviewSnapshot, PlanItem } from "../../server/run-interview";
import { useInterviewChat } from "../interview/use-interview-chat";
import type { ChatMessage } from "../interview/chat-logic";
import { AppShell } from "../ui/app-shell";
import { BusinessFacts, type BusinessFactsProps } from "../ui/business-facts";
import { ImpersonateSearch } from "../ui/impersonate-search";
import { UserMenu } from "../ui/user-menu";
import { AnswerOptions } from "../ui/answer-options";
import { BrandFace } from "../ui/brand";
import { missingCount } from "../../pipeline/model/ledger";

// מסך הראיון בשפת העיצוב הנבחרת (הכרעת מייסד 18.8: כהה פרמיום, סגול וברקת, Rubik - ראו
// globals.css) - אין כאן שום לוגיקת עסק, רק תצוגה על גבי useInterviewChat. ניהול פוקוס
// כן חי כאן (ולא בהוק): הוא תלוי-DOM/תזמון-רינדור, לא כלל עסקי - ראו ההערות ליד ה-effect למטה.
// כללי החלקים המונפשים: מחלקות .rv יושבות רק על עטיפות סטטיות שנטענות פעם אחת עם המסך -
// אף פעם לא על הודעות/פאנלים שמתחלפים עם ה-state, כדי ששינוי state לא יריץ כניסה מחדש.
//
// **הפריסה (הכרעת אלעד 26.8):** שלושה פאנלים בגובה המסך, מימין לשמאל - רשימת השאלות
// הממוספרת (עם התשובה מתחת לכל שאלה שנענתה), השאלה הנוכחית עם האפשרויות שלה, והשיחה עם
// תיבת הכתיבה נעוצה בתחתיתה. כל פאנל גולל בתוך עצמו; הדף לא נגלל. קודם הצ'אט ישב מתחת
// לשאלה וגדל למטה, והדף כולו זז מתחת לעכבר בכל הודעה חדשה. הפנקס ברצועת הניווט.

// כפתור-קו שקט (סיום הראיון): ghost-act מ-globals בלי מצב disabled משלו, אז מוסיפים כאן
const GHOST_BTN = "ghost-act disabled:cursor-not-allowed disabled:opacity-40";

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
    <div className="flex max-w-[85%] items-end gap-2 self-end">
      <div className="flex animate-fade-up items-center gap-2 rounded-[13px] border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] px-3.5 py-1.5 text-[14px] leading-snug text-[color:var(--mut)]">
        <span>חושב</span>
        <span className="flex items-end gap-0.5" aria-hidden="true">
          <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "0ms" }} />
          <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "150ms" }} />
          <span className="h-1 w-1 animate-bounce rounded-full bg-[color:var(--acc)]" style={{ animationDelay: "300ms" }} />
        </span>
      </div>
      <BrandFace size={22} />
    </div>
  );
}

// הצד נקבע לפי כיוון הכתיבה ולא לפי שמאל/ימין קשיחים: self-start הוא הקצה שממנו הטקסט
// מתחיל, כלומר ימין בעברית. בעל העסק מימין, הסוכן משמאל - כמו בכל אפליקציית הודעות
// בעברית (דיווח אלעד 26.8: הצדדים היו הפוכים, כי self-end בעמודה RTL הוא שמאל).
//
// בועת היועץ נושאת את הפנים של הדמות (להב, 26.8) - שיחה עם מישהו, לא עם מערכת. הפנים
// בתחתית הבועה כמו בכל ממשק צ'אט, ורק בצד היועץ - המשתמש נשאר בלי אווטאר. הן אחרונות
// ב-DOM ולא ראשונות: בשורת flex ב-RTL האחרון הוא השמאלי, וזה הקצה החיצוני של הצד הזה
function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[58ch] self-start whitespace-pre-wrap break-words rounded-[13px] border border-[rgba(var(--acc-rgb),.3)] bg-[rgba(var(--acc-rgb),.14)] px-3.5 py-1.5 text-[14px] leading-snug">
        {message.content}
      </div>
    );
  }
  return (
    <div className="flex max-w-[58ch] items-end gap-2 self-end">
      <div className="min-w-0 whitespace-pre-wrap break-words rounded-[13px] border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] px-3.5 py-1.5 text-[14px] leading-snug">
        {message.content}
      </div>
      <BrandFace size={22} />
    </div>
  );
}

// רשימת השאלות הממוספרת. הסדר מגיע מהשרת (interviewPlan) ולא מסדר הבנק - הוא סימולציה של
// pickNextQuestion עצמה, ולכן המספרים אומרים את האמת על מה יישאל ומתי.
//
// מי שאפשר ללחוץ עליו: שאלות שנענו בלבד. קדימה קופצים רק בתשובה או בכפתור "דלג" - הכרעת
// אלעד 26.8. השומר האמיתי יושב ב-reducer (case "revisit") ולא רק ב-disabled כאן, כדי שיהיה
// מקור אמת אחד למי שמותר לפתוח.
function PlanList({
  plan, answers, currentKey, revisitKey, skippedKeys, locked, onPick,
}: {
  plan: PlanItem[];
  /** התשובה השמורה לכל פריט, באותו סדר (answersOf); null למי שלא נענה */
  answers: (string | null)[];
  currentKey: string | null;
  revisitKey: string | null;
  skippedKeys: string[];
  locked: boolean;
  onPick: (key: string) => void;
}) {
  const answered = plan.filter((p) => p.answered).length;
  return (
    <div className="iv-plan shell rv d1">
      <div className="core card-pad">
        <h2 className="side-h4">שאלות הראיון</h2>
        <ol className="iv-list step-list">
          {plan.map((item, i) => {
            const editing = item.key === revisitKey;
            // "הנוכחית" מושהית בזמן עריכה: שתי שאלות מודגשות בו זמנית היו אומרות למשתמש
            // שהוא נמצא בשתיהן
            const now = revisitKey == null && item.key === currentKey;
            const skipped = !item.answered && skippedKeys.includes(item.key);
            const mark = editing ? "is-edit" : now ? "is-now" : item.answered ? "is-done" : skipped ? "is-skip" : "";
            const ans = answers[i] ?? null;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`step-row ${mark}`.trim()}
                  // השאלה הנוכחית גם היא מנוטרלת - כבר נמצאים עליה, ולחיצה עליה לא עושה כלום
                  disabled={!item.answered || locked}
                  onClick={() => onPick(item.key)}
                  aria-current={now ? "step" : undefined}
                  // הניסוח המלא זמין בריחוף. התווית היא הנושא, לא השאלה עצמה
                  title={item.text}
                >
                  <span className="sc-avatar mini" aria-hidden="true">{i + 1}</span>
                  <span className="lb">
                    {item.label}
                    {/* התשובה כלשונה מתחת לתווית - הרשימה היא סיכום של מה שנאמר, לא רק
                        תוכן עניינים. שורה אחת עם קיצור, והמלא בריחוף */}
                    {ans != null && <small className="ans" title={ans}>{ans}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed" style={{ borderColor: "var(--row-line)", color: "var(--dim)" }}>
          {answered > 0 ? "אפשר ללחוץ על שאלה שנענתה ולשנות את התשובה." : "השאלות נפתחות אחת אחרי השנייה."}
        </p>
      </div>
    </div>
  );
}

// שורת הפעולות מתחת לשאלה. הייתה משוכפלת בפאנל הצ'יפים ובפאנל השאלה הפשוטה, ומצב העריכה
// היה מוסיף לה ענף שלישי - שלושה עותקים של אותה שורה זה בדיוק מה שנוטה להתפצל
function QuestionActions({
  revisiting, canSkip, canFinish, onSkip, onFreeText, onCancelRevisit, onFinish, className = "",
}: {
  revisiting: boolean;
  canSkip: boolean;
  canFinish: boolean;
  onSkip: () => void;
  onFreeText: () => void;
  onCancelRevisit: () => void;
  onFinish: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`.trim()}>
      {revisiting ? (
        <button type="button" className="btn-quiet" onClick={onCancelRevisit}>
          חזרה לשאלה הנוכחית
        </button>
      ) : (
        <>
          <button type="button" className="btn-quiet" disabled={!canSkip} onClick={onSkip}>
            דלג
          </button>
          <button type="button" className="btn-quiet" disabled={!canSkip} onClick={onFreeText}>
            כתיבה חופשית
          </button>
        </>
      )}
      <button type="button" className={GHOST_BTN} disabled={!canFinish} onClick={onFinish}>
        סיום הראיון
      </button>
    </div>
  );
}

export function DefaultInterview({
  diagnosisId, initial, businessName, facts, isAdmin = false, userEmail = null,
}: {
  diagnosisId: string;
  initial: InterviewSnapshot;
  businessName?: string;
  /** שורת העובדות בסרגל, אותה אחת כמו בדוח. נגזרת בעמוד (RSC) ומגיעה מוכנה */
  facts?: BusinessFactsProps;
  isAdmin?: boolean;
  userEmail?: string | null;
}) {
  const {
    messages, busy, starting, finishing, input, freeText, freeTextIntent, visible,
    askedCount, maxQuestions, ledger, plan, answers, revisitKey, skippedKeys, previousAnswer,
    error, closed, canSend, canFinish, canSkip, canAnswer, canConfirmOptions,
    selectedOptions, customInputOpen,
    send, skip, revisit, cancelRevisit, finish, selectOption, confirmOptions, toggleOption,
    openCustomInput, setInput, setFreeText,
  } = useInterviewChat(diagnosisId, initial);

  const revisiting = revisitKey != null;
  // המספר של השאלה המוצגת, מתוך אותה רשימה עצמה - כדי שהכותרת והרשימה לא יסתרו זו את זו
  const stepNo = visible != null ? plan.findIndex((p) => p.key === visible.key) + 1 : 0;
  // המונה מוצג רק על שאלה חיה. askedCount סופר את מה שכבר נשאל, ולכן הנוכחית היא הבאה
  // בתור; "לכל היותר" כי ראיון יכול להסתיים מוקדם כשכל הסקציות כוסו - הבטחת מספר מדויק
  // הייתה נשברת בדיוק אצל מי שענה הכי טוב
  const counterLine = revisiting
    ? `חוזרים לשאלה ${stepNo}`
    : `שאלה ${askedCount + 1} מתוך ${maxQuestions} לכל היותר`;
  // כל השאלות מוצו בלי שהמשתמש בחר בעצמו כתיבה חופשית - זה סיום, לא עוד תיבת טקסט
  // (דיווח מסמך ההמרה 20.8: מי שסיים 13 תשובות קיבל תיבה ריקה בלי הסבר)
  const questionsDone = visible == null && !freeTextIntent && askedCount > 0;

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // קבוצת התשובות נקראת בשם השאלה עצמה ולא בתווית גנרית
  const promptId = useId();
  const inputDisabled = busy || starting || finishing || closed;
  // השאלה הנוכחית מציעה צ'יפים ועדיין לא נלחץ "אחר" - פאנל הצ'יפים מוצג במקום תיבת הטקסט
  // המשותפת (אפיון מחדש-ראיון, החלטה D). בלי אפשרויות (כמו שאלת הסיכום) - נשאר בדיוק כמו היום.
  const showChips = !freeText && visible != null && (visible.options?.length ?? 0) > 0 && !customInputOpen;
  const showTextInput = !showChips;

  useEffect(() => {
    // גלילה אוטומטית היא אפקט ויזואלי גרידא, לכן חיה כאן ולא ב-hook (ראו use-scan-stream.ts
    // להערת ה-scroll המקבילה במסך הסריקה). scrollTop על המכל עצמו ולא scrollIntoView: האחרון
    // גולל גם את הדף כשהוא צריך, וזו בדיוק התזוזה שהפריסה הזו באה לבטל
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
  function handleCancelRevisit() {
    cancelRevisit();
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
    <AppShell
      active="interview"
      diagnosisId={diagnosisId}
      userLabel={userEmail}
      isAdmin={isAdmin}
      business={businessName ? { name: businessName, missing: missingCount(ledger) } : undefined}
      ledger={ledger}
    >
      {/* שורת הזהות: על איזה עסק הראיון הזה. היה חסר כאן בלבד, וכשיש כמה אבחונים אי אפשר
          היה לדעת עם מי מדברים (דיווח מייסד 20.8). אותו מבנה בדיוק כמו בדוח וב-Roadmap */}
      {/* השורה מרונדרת תמיד - בלי שם עסק המשתמש עדיין צריך את תפריט המשתמש ואת
          חיפוש ההתחזות; רק שורת הזהות עצמה מותנית (ממצא סקירה 26.8) */}
      <header className="topbar">
        {/* שם העסק והעובדות במרכז - אותו בלוק כמו בדוח, בלי תווית מסך (בקשת אלעד 26.8).
            בלי facts (רשומת העסק לא נטענה) נשאר לפחות השם, כשיש */}
        {facts != null
          ? <BusinessFacts name={businessName} {...facts} />
          : businessName != null && businessName !== "" && (
            <BusinessFacts name={businessName} city={null} website={null} scannedAt={null} reviewCount={null} rating={null} pagesCrawled={null} />
          )}
        <div className="side">
          {isAdmin && <ImpersonateSearch />}
          <UserMenu email={userEmail} isAdmin={isAdmin} />
        </div>
      </header>
      {/* הכותרת מעל הרשת ולא בתוך העמודה הראשית: העמודה הראשית היא השמאלית, ולכן
          כותרת בתוכה מתרחקת מהסיידבר. מעל הרשת היא מתחילה בקצה ההתחלה של התוכן -
          צמודה לסיידבר, כמו בתוכנית העבודה (הנחיית מייסד 20.8) */}
      <div className="page-w">
        <header className="page-head rv">
          <h1>ראיון קצר על העסק</h1>
          <p>כמה שאלות ממוקדות שיעזרו לדייק את ההמלצות. אפשר לדלג, לעבור לכתיבה חופשית ולסיים מתי שרוצים.</p>
        </header>
      </div>

      <main className="repC iv" aria-busy={starting || busy || finishing}>
        {/* רשימת השאלות ראשונה ב-DOM, כלומר הימנית - צמודה לניווט, במקום שהפנקס פינה
            כשעבר לרצועה (הכרעת אלעד 26.8). סדר הקריאה זהה לסדר שרואים */}
        {plan.length > 0 && (
          <PlanList
            plan={plan}
            answers={answers}
            currentKey={visible?.key ?? null}
            revisitKey={revisitKey}
            skippedKeys={skippedKeys}
            locked={!canAnswer}
            onPick={revisit}
          />
        )}

        {/* הפאנל האמצעי: השאלה הנוכחית לבדה, נמתחת לגובה השכנים; שורת הפעולות נעוצה לתחתיתו */}
        <div className="rep-main">
          {/* העטיפה כאן סטטית (תמיד מרונדרת) - רק התוכן הפנימי מתחלף בין המצבים, כך שהחלפת
              פאנל לא מריצה שוב את אנימציית הכניסה */}
          <div className="rv d2">
            {freeText ? (
              <div className="shell">
                <div className="core card-pad">
                  {questionsDone ? (
                    <div className="flex items-center gap-4">
                      {/* רגע ההצלחה מקבל את פוזת האגודל (להב, 26.8) - הדמות חוגגת עם המשתמש.
                          72 ולא 82: הכרטיס כאן מרופד צפוף יותר ואין גלילת דף שתבלע את ההפרש */}
                      <img
                        src="/brand/thumbs-up.webp"
                        alt=""
                        aria-hidden="true"
                        width={72}
                        className="shrink-0 max-sm:hidden"
                        style={{ pointerEvents: "none" }}
                      />
                      <div className="min-w-0">
                        <p className="text-[16.5px] font-bold leading-snug tracking-[-.01em]">עברנו על כל השאלות - תודה!</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--mut)]">
                          כל תשובה כבר עדכנה את הדוח. אפשר להוסיף פרטים בתיבת השיחה, או לעבור אליו.
                        </p>
                        <div className="mt-3">
                          <button type="button" className="btn sm" disabled={!canFinish} onClick={() => void finish()}>
                            לדוח המעודכן
                            <CapArrow />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[16.5px] font-bold leading-snug tracking-[-.01em]">ספרו לי על העסק במילים שלכם</p>
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
                    </>
                  )}
                </div>
              </div>
            ) : (
              visible && (
                <div className="shell">
                  <div className="core card-pad">
                    <p className="text-[10.5px] font-bold tracking-[.14em] text-[color:var(--dim)]">{counterLine}</p>
                    <p id={promptId} className="mt-1.5 text-[16.5px] font-bold leading-snug tracking-[-.01em]">{visible.text}</p>
                    {/* מה שנענה קודם, כלשונו. בלעדיו עריכה מתחילה מדף ריק והמשתמש לא יודע
                        מה הוא בא לשנות */}
                    {revisiting && previousAnswer != null && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--mut)" }}>
                        התשובה הקודמת שלכם: <b style={{ color: "var(--txt)" }}>{previousAnswer}</b>
                      </p>
                    )}
                    {visible.options != null && customInputOpen && (
                      <p className="mt-1 text-[12.5px] text-[color:var(--mut)]">אפשר לכתוב את התשובה בתיבת השיחה</p>
                    )}
                    {showChips && visible.options && (
                      <>
                        {/* תיבת התשובות המשותפת (ui/answer-options.tsx) - אותה תיבה משרתת גם את
                            ההדגמה בדף הנחיתה. key על מפתח השאלה: תיבה חדשה לכל שאלה, אחרת סימון
                            ה"נבחר" של התשובה הקודמת נגרר לשאלה הבאה */}
                        <div className="mt-3">
                          <AnswerOptions
                            key={visible.key}
                            options={visible.options}
                            // בעריכה מסמנים גם בבחירה בודדת: זו התשובה השמורה, לא בחירה רגעית
                            selected={visible.multiSelect || revisiting ? selectedOptions : []}
                            multiSelect={visible.multiSelect}
                            disabled={!canAnswer}
                            onPick={(label) => (visible.multiSelect ? toggleOption(label) : selectOption(label))}
                            onOther={openCustomInput}
                            labelledBy={promptId}
                            // הגרסה המצומצמת של אותה תיבה: חמש שורות בגובה מלא לקחו כמעט מחצית
                            // מגובה המסך, וכל פיקסל כאן נגרע מהשיחה (דיווח אלעד 26.8)
                            compact
                          />
                        </div>
                        {visible.multiSelect && (
                          <div className="mt-3">
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
                      </>
                    )}
                    <QuestionActions
                      revisiting={revisiting}
                      canSkip={canSkip}
                      canFinish={canFinish}
                      onSkip={handleSkip}
                      onFreeText={() => handleSetFreeText(true)}
                      onCancelRevisit={handleCancelRevisit}
                      onFinish={() => void finish()}
                      className={showChips ? "iv-acts border-t border-dashed border-[color:var(--hair)] pt-3" : "iv-acts"}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* השיחה בפאנל משלה, השמאלי: היסטוריה למעלה ותיבת כתיבה נעוצה למטה, כמו בכל
            אפליקציית הודעות (הכרעת אלעד 26.8). התיבה כאן ולא מתחת לשאלה: מי שכותב חופשי
            כותב לתוך השיחה, והשאלה באמצע נשארת מה שעונים עליו */}
        <section className="iv-chat shell rv d3" aria-label="השיחה">
          <div className="core card-pad">
            <h2 className="side-h4">השיחה</h2>
            {/* iv-thread נושא את פריסת הבועות; המכל שסביבו אחראי רק לגלילה */}
            <div aria-live="polite" className="iv-scroll" ref={scrollRef}>
              <div className="iv-thread">
                {messages.map((m) => (
                  <Bubble key={m.id} message={m} />
                ))}
                {(busy || starting) && <TypingDots />}
              </div>
            </div>

            {error && (
              <p className="form-error mt-2" role="alert">
                {error}
              </p>
            )}

            {showTextInput && (
              <div className="mt-2 flex items-end gap-3">
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
        </section>
      </main>
    </AppShell>
  );
}
