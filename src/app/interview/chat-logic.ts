import type { InterviewSnapshot, TurnResult } from "../../server/run-interview";
import { INTERVIEW_SECTIONS } from "../../pipeline/interview/questions";

// לוגיקה טהורה של מסך הראיון (משימה 11): בלי React ובלי fetch, כך שגרסת עיצוב עתידית תחליף
// רק JSX/CSS בלי לגעת כאן. use-interview-chat.ts הוא השכבה היחידה שקוראת ל-API ומתרגמת
// תשובות שרת לפעולות על ה-reducer הזה.

export type ChatRole = "user" | "assistant";

// גרסת תצוגה מצומצמת של הודעת שרת - בלי createdAt/questionKey שהתצוגה לא צריכה
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface NextQuestion {
  key: string;
  section: string;
  text: string;
}

// דילוג הוא מצב לקוח בלבד ואף פעם לא נשמר בשרת (ראו cli-interview.ts - אותו דפוס בדיוק):
// השרת ממשיך לחשב את אותה השאלה הבאה הדטרמיניסטית כי הוא לא יודע על הדילוג, אז כל מקום
// שמציג "מה השאלה הבאה" חייב לסנן דרך הפונקציה הזו ולא לקרוא ל-next הגולמי ישירות
export function visibleNext(next: NextQuestion | null, skippedKeys: string[]): NextQuestion | null {
  if (next == null || skippedKeys.includes(next.key)) return null;
  return next;
}

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean; // תור בתהליך (בקשת message באוויר)
  starting: boolean; // בקשת start באוויר (רק סביב ה-mount)
  finishing: boolean; // בקשת finish באוויר
  input: string;
  freeText: boolean; // מצב תצוגה נוכחי - מונחה מול חופשי
  skippedKeys: string[];
  next: NextQuestion | null; // ההצעה הגולמית מהשרת - יש לסנן דרך visibleNext לפני תצוגה
  completenessPct: number;
  credits: Record<string, number>;
  askedCount: number;
  maxQuestions: number;
  error: string | null;
  closed: boolean; // הראיון הסתיים בהצלחה וממתינים לניווט לדוח
}

function toChatMessage(m: { id: string; role: ChatRole; content: string }): ChatMessage {
  return { id: m.id, role: m.role, content: m.content };
}

// אתחול ה-state מתוך ה-snapshot שה-RSC כבר טען (ראו page.tsx) - זה גם נתיב ה-resume: היסטוריה
// מלאה כבר נמצאת ב-initial.messages, בלי טיפול מיוחד
export function initialChatState(initial: InterviewSnapshot): ChatState {
  const skippedKeys: string[] = [];
  return {
    messages: initial.messages.map(toChatMessage),
    busy: false,
    starting: initial.status !== "interviewing",
    finishing: false,
    input: "",
    freeText: initial.recommendFreeText || visibleNext(initial.nextQuestion, skippedKeys) == null,
    skippedKeys,
    next: initial.nextQuestion,
    completenessPct: initial.completenessPct,
    credits: initial.credits,
    askedCount: initial.askedCount,
    maxQuestions: initial.maxQuestions,
    error: null,
    closed: false,
  };
}

export type ChatAction =
  | { type: "snapshot"; payload: InterviewSnapshot }
  | { type: "send" }
  | { type: "turnOk"; payload: TurnResult }
  | { type: "turnFail"; error: string }
  | { type: "skip" }
  | { type: "setFreeText"; value: boolean }
  | { type: "setInput"; value: string }
  | { type: "finishStart" }
  | { type: "finishOk" }
  | { type: "finishFail"; error: string }
  | { type: "startFail"; error: string };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    // snapshot מחליף הודעות/התקדמות/next במלואם - נתיב mount, נתיב פישור 409 (מירוץ מקביל
    // שכבר הזיז את הראיון), ונתיב רענון אחרי שגיאת "הראיון לא פעיל". לא נוגע ב-skippedKeys:
    // הדילוגים הם מצב לקוח בלבד שהשרת לא יודע עליו, אז snapshot לא אמור למחוק אותם
    case "snapshot":
      return {
        ...state,
        messages: action.payload.messages.map(toChatMessage),
        completenessPct: action.payload.completenessPct,
        credits: action.payload.credits,
        askedCount: action.payload.askedCount,
        maxQuestions: action.payload.maxQuestions,
        next: action.payload.nextQuestion,
        freeText: action.payload.recommendFreeText
          || visibleNext(action.payload.nextQuestion, state.skippedKeys) == null,
        starting: false,
        busy: false,
        error: null,
      };

    // הגנת double-submit הראשית: שליחה בזמן busy או עם קלט ריק היא no-op שקט. זו רק שכבת
    // ההגנה הראשונה - הכפתור בתצוגה גם מנוטרל, אבל השרת עצמו סימטרי (last-write-wins,
    // שום הודעה לא הולכת לאיבוד) כך שההגנה כאן היא נוחות ולא נחיצות קריטית
    case "send": {
      if (state.busy || state.input.trim().length === 0) return state;
      const content = state.input.trim();
      const message: ChatMessage = { id: `local-${state.messages.length}`, role: "user", content };
      return { ...state, messages: [...state.messages, message], input: "", busy: true, error: null };
    }

    // freeText מחושב מחדש לפי אותו חוק בכל תור (מראה את דפוס ה-CLI המאושר): אם יש שאלה הבאה
    // גלויה (לא דולגה) - חוזרים אוטומטית למצב מונחה, גם אם המשתמש בחר "כתיבה חופשית" לתשובה
    // הקודמת בלבד. בחירת "כתיבה חופשית" היא לא נעילה קבועה של המצב.
    case "turnOk": {
      const reply: ChatMessage = { id: `local-${state.messages.length}`, role: "assistant", content: action.payload.reply };
      return {
        ...state,
        messages: [...state.messages, reply],
        completenessPct: action.payload.completenessPct,
        credits: action.payload.credits,
        askedCount: action.payload.askedCount,
        next: action.payload.nextQuestion,
        freeText: visibleNext(action.payload.nextQuestion, state.skippedKeys) == null,
        busy: false,
        error: null,
      };
    }

    // כישלון תור: ההודעה האופטימית שנוספה ב-send מוסרת, והטקסט שלה חוזר בדיוק לתיבת הקלט -
    // המשתמש לא מאבד את מה שכתב ויכול לנסות שוב בלי להקליד מחדש
    case "turnFail": {
      const last = state.messages[state.messages.length - 1];
      const isOptimistic = last?.role === "user";
      return {
        ...state,
        messages: isOptimistic ? state.messages.slice(0, -1) : state.messages,
        input: isOptimistic ? last.content : state.input,
        busy: false,
        error: action.error,
      };
    }

    // דילוג: מוסיפים ל-skippedKeys בלבד, אף פעם לא לשרת. אחרי הדילוג השאלה הנוכחית תמיד
    // מסתתרת (זה בדיוק מה שדולג עכשיו), אז freeText הופך ל-true עד שהשרת יציע שאלה אחרת
    case "skip": {
      const visible = visibleNext(state.next, state.skippedKeys);
      if (!visible) return state; // אין שאלה גלויה לדלג עליה כרגע
      return { ...state, skippedKeys: [...state.skippedKeys, visible.key], freeText: true };
    }

    case "setFreeText":
      return { ...state, freeText: action.value };

    case "setInput":
      return { ...state, input: action.value };

    case "finishStart":
      return { ...state, finishing: true, error: null };

    case "finishOk":
      return { ...state, finishing: false, closed: true };

    case "finishFail":
      return { ...state, finishing: false, error: action.error };

    case "startFail":
      return { ...state, starting: false, error: action.error };

    default:
      return state;
  }
}

export interface SectionProgressItem {
  key: string;
  label: string;
  state: "full" | "partial" | "none";
}

// תשע הסקציות המרואיינות (INTERVIEW_SECTIONS) בסדר קבוע - "pains" לא ביניהן בכוונה (ראו questions.ts)
export function sectionProgress(credits: Record<string, number>): SectionProgressItem[] {
  return INTERVIEW_SECTIONS.map(({ key, label }) => {
    const credit = credits[key] ?? 0;
    const state: SectionProgressItem["state"] = credit >= 1 ? "full" : credit >= 0.5 ? "partial" : "none";
    return { key, label, state };
  });
}
