import type { InterviewSnapshot, TurnResult, QuestionView, PlanItem } from "../../server/run-interview";
import { INTERVIEW_SECTIONS, answerLabels } from "../../pipeline/interview/questions";
import type { LedgerEntry } from "../../pipeline/model/ledger";

// לוגיקה טהורה של מסך הראיון (משימה 11): בלי React ובלי fetch, כך שגרסת עיצוב עתידית תחליף
// רק JSX/CSS בלי לגעת כאן. use-interview-chat.ts הוא השכבה היחידה שקוראת ל-API ומתרגמת
// תשובות שרת לפעולות על ה-reducer הזה.

export type ChatRole = "user" | "assistant";

// גרסת תצוגה מצומצמת של הודעת שרת - בלי createdAt/questionKey שהתצוגה לא צריכה
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  // מפתח השאלה שההודעה עונה עליה (null בהודעות הסוכן ובכתיבה חופשית). דרוש כדי שחזרה לשאלה
  // שנענתה תוכל להציג את התשובה הקודמת מסומנת - הוא כבר נשמר על ההודעה במסד (interview-repo)
  questionKey: string | null;
}

// השם נשמר כי הוא מדויק בהקשר של "השאלה הבאה", אבל ההגדרה היא זו של השרת ולא עותק שני שלה:
// זה בדיוק הטיפוס ש-nextQuestion ופריטי התוכנית נושאים, ושתי הגדרות היו יכולות להתפצל
export type NextQuestion = QuestionView;

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
  freeText: boolean; // מצב תצוגה בפועל (מחושב) - מונחה מול חופשי, ראו freeTextIntent למקור
  // כוונה מפורשת של המשתמש ("כתיבה חופשית") - נבדלת מ-freeText המחושב: דילוג/מיצוי שאלות
  // מייצרים חופשי זמני (computed) שחוזר אוטומטית למונחה ברגע ששאלה לא-דולגה זמינה, אבל
  // בחירה מפורשת של המשתמש היא "דביקה" ונשארת עד שהוא עצמו לוחץ "חזרה לשאלות"
  freeTextIntent: boolean;
  skippedKeys: string[];
  next: NextQuestion | null; // ההצעה הגולמית מהשרת - יש לסנן דרך visibleNext לפני תצוגה
  // מצב צ'יפים של השאלה הנוכחית (אפיון מחדש-ראיון, החלטה D): תוויות שנבחרו בבחירה מרובה (טרם
  // אושרו בכפתור "שליחה"), ו"אחר" - שהוא רק גילוי תיבת הטקסט הקיימת, לא שינוי ל-freeText הגלובלי.
  // שני השדות מתאפסים בכל מעבר לשאלה חדשה (turnOk/snapshot) ובכל יציאה מההקשר הנוכחי (skip/setFreeText/send)
  selectedOptions: string[];
  customInputOpen: boolean;
  completenessPct: number;
  // תוכנית הראיון (עיצוב הראיון 26.8): הרשימה הממוספרת. מגיעה מהשרת בכל snapshot ובכל תור
  plan: PlanItem[];
  // השאלה שנענתה שהמשתמש חזר אליה לעריכה, אם יש. כשהיא מוגדרת היא גוברת על השאלה הבאה
  // בתצוגה ובשליחה. נפתחת בלחיצה ברשימה, ונסגרת מעצמה ברגע שנשלחה תשובה (turnOk)
  revisitKey: string | null;
  // פנקס החוסרים (משימה 19): מגיע מכל snapshot ומכל תור, ולכן הכרטיס מתעדכן חי בזמן הראיון
  ledger: LedgerEntry[];
  credits: Record<string, number>;
  askedCount: number;
  maxQuestions: number;
  error: string | null;
  closed: boolean; // הראיון הסתיים בהצלחה וממתינים לניווט לדוח
}

function toChatMessage(m: { id: string; role: ChatRole; content: string; questionKey?: string | null }): ChatMessage {
  return { id: m.id, role: m.role, content: m.content, questionKey: m.questionKey ?? null };
}

/** התשובה האחרונה שנשמרה לשאלה מסוימת. "האחרונה" ולא "הראשונה": חזרה לשאלה ועריכה שלה
    מוסיפה הודעה חדשה עם אותו מפתח, והרלוונטית היא זו שגוברת גם במודל */
export function answerFor(messages: ChatMessage[], key: string | null): string | null {
  if (key == null) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.questionKey === key) return m.content;
  }
  return null;
}

// המצב ה"מחושב" (לא הדביק) של חופשי/מונחה - אותו חוק תמיד: אין שאלה גלויה (או שהשרת ממליץ
// חופשי) => חופשי. משמש הן לאתחול (עם recommendFreeText) והן לכל תור/snapshot (בלעדיו)
function computedFreeText(next: NextQuestion | null, skippedKeys: string[], recommend = false): boolean {
  return recommend || visibleNext(next, skippedKeys) == null;
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
    freeText: computedFreeText(initial.nextQuestion, skippedKeys, initial.recommendFreeText),
    freeTextIntent: false,
    skippedKeys,
    next: initial.nextQuestion,
    selectedOptions: [],
    customInputOpen: false,
    completenessPct: initial.completenessPct,
    plan: initial.plan,
    revisitKey: null,
    ledger: initial.ledger,
    credits: initial.credits,
    askedCount: initial.askedCount,
    maxQuestions: initial.maxQuestions,
    error: null,
    closed: false,
  };
}

export type ChatAction =
  // keepError: נתיב פישור אחרי שגיאה (למשל "הראיון לא פעיל") - השגיאה כבר הוצגה במפורש
  // ואנחנו לא רוצים ש-snapshot ימחק אותה תוך כדי רענון המצב האמיתי מהשרת
  | { type: "snapshot"; payload: InterviewSnapshot; keepError?: boolean }
  // content אופציונלי (אפיון מחדש-ראיון, החלטה D): צ'יפים שולחים תוכן משלהם (תווית בודדת, או
  // תוויות מרובות מחוברות) בלי לעבור דרך state.input - נמנעים מבעיית ה-state סגור-ישן
  // (setInput ואז send מיד היה עדיין קורא state.input הישן מהרינדור הנוכחי). בלי content -
  // בדיוק ההתנהגות הישנה (state.input כמו תמיד)
  | { type: "send"; content?: string; questionKey?: string }
  | { type: "turnOk"; payload: TurnResult }
  | { type: "turnFail"; error: string }
  | { type: "skip" }
  | { type: "revisit"; key: string }
  | { type: "cancelRevisit" }
  | { type: "setFreeText"; value: boolean }
  | { type: "setInput"; value: string }
  | { type: "toggleOption"; label: string }
  | { type: "openCustomInput" }
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
        plan: action.payload.plan,
        // מצב השרת הרענן גובר על עריכה פתוחה: הראיון כבר במקום אחר ממה שהעריכה הניחה
        revisitKey: null,
        ledger: action.payload.ledger,
        credits: action.payload.credits,
        askedCount: action.payload.askedCount,
        maxQuestions: action.payload.maxQuestions,
        next: action.payload.nextQuestion,
        freeText: state.freeTextIntent
          || computedFreeText(action.payload.nextQuestion, state.skippedKeys, action.payload.recommendFreeText),
        // שאלה (חדשה או לא) הגיעה מהשרת - מצב הצ'יפים של ה"שאלה הקודמת" כבר לא רלוונטי
        selectedOptions: [],
        customInputOpen: false,
        starting: false,
        busy: false,
        error: action.keepError ? state.error : null,
        // סטטוס אמיתי מהשרת קובע אם הראיון עדיין פעיל - בלי זה שני טאבים פתוחים על אותו ראיון:
        // טאב א' מסיים, טאב ב' מקבל snapshot מרוענן (למשל אחרי 409) עם status=report_ready אבל
        // ה-UI שלו עדיין מציג תיבת קלט פעילה ("משקר" למשתמש שהראיון עדיין בעיצומו)
        closed: action.payload.status !== "interviewing",
      };

    // הגנת double-submit הראשית: שליחה בזמן busy או עם קלט ריק היא no-op שקט. זו רק שכבת
    // ההגנה הראשונה - הכפתור בתצוגה גם מנוטרל, אבל השרת עצמו סימטרי (last-write-wins,
    // שום הודעה לא הולכת לאיבוד) כך שההגנה כאן היא נוחות ולא נחיצות קריטית
    case "send": {
      // content מפורש (שליחת צ'יפ) עוקף את state.input; בלעדיו - בדיוק ההתנהגות הישנה
      const content = (action.content ?? state.input).trim();
      if (state.busy || content.length === 0) return state;
      const message: ChatMessage = {
        id: `local-${state.messages.length}`, role: "user", content,
        questionKey: action.questionKey ?? null,
      };
      return {
        ...state, messages: [...state.messages, message], input: "", busy: true, error: null,
        selectedOptions: [], customInputOpen: false,
      };
    }

    // freeText מחושב מחדש לפי אותו חוק בכל תור (מראה את דפוס ה-CLI המאושר), אלא אם המשתמש
    // בעצמו נעל כוונה מפורשת (freeTextIntent) - במקרה כזה נשארים בחופשי גם כשיש שאלה זמינה
    case "turnOk": {
      const reply: ChatMessage = {
        id: `local-${state.messages.length}`, role: "assistant", content: action.payload.reply, questionKey: null,
      };
      return {
        ...state,
        messages: [...state.messages, reply],
        completenessPct: action.payload.completenessPct,
        plan: action.payload.plan,
        // התשובה נשלחה - העריכה נסגרה מעצמה והתצוגה חוזרת לשאלה הנוכחית
        revisitKey: null,
        ledger: action.payload.ledger,
        credits: action.payload.credits,
        askedCount: action.payload.askedCount,
        next: action.payload.nextQuestion,
        freeText: state.freeTextIntent || computedFreeText(action.payload.nextQuestion, state.skippedKeys),
        // שאלה הבאה כבר הגיעה - מצב הצ'יפים של השאלה שזה עתה נענתה לא אמור לדלוף לשאלה הבאה
        selectedOptions: [],
        customInputOpen: false,
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

    // דילוג: מוסיפים ל-skippedKeys בלבד, אף פעם לא לשרת. לא נוגע ב-freeTextIntent בכוונה -
    // זה חופשי "מחושב" זמני (השאלה שדולגה כרגע היא בהכרח היחידה שהייתה גלויה), לא בחירה של
    // המשתמש, אז ברגע שהשרת יציע שאלה אחרת לא-דולגה חוזרים אוטומטית למונחה (turnOk למעלה)
    case "skip": {
      // בזמן עריכה של שאלה שנענתה אין מה לדלג: הכפתור מוחלף ב"חזרה לשאלה הנוכחית", וללא
      // השומר הזה דילוג היה מסמן דווקא את השאלה הנוכחית - זו שלא מוצגת כרגע
      if (state.revisitKey != null) return state;
      const visible = visibleNext(state.next, state.skippedKeys);
      if (!visible) return state; // אין שאלה גלויה לדלג עליה כרגע
      return {
        ...state, skippedKeys: [...state.skippedKeys, visible.key], freeText: true,
        selectedOptions: [], customInputOpen: false, // יוצאים מהקשר השאלה שדולגה
      };
    }

    // "כתיבה חופשית" נועלת כוונה מפורשת (דביקה עד "חזרה לשאלות"); "חזרה לשאלות" משחררת אותה
    // וחוזרת למה שהמצב המחושב אומר באותו רגע (יכול עדיין להיות חופשי אם באמת אין שאלה גלויה)
    case "setFreeText": {
      // בשני הכיוונים יוצאים מהקשר צ'יפים - "כתיבה חופשית" נוטשת את פאנל הצ'יפים, ו"חזרה
      // לשאלות" חוזרת אליו נקי בלי בחירות שדבקו משאלה קודמת
      if (action.value) return { ...state, freeText: true, freeTextIntent: true, selectedOptions: [], customInputOpen: false };
      return {
        ...state, freeText: computedFreeText(state.next, state.skippedKeys), freeTextIntent: false,
        selectedOptions: [], customInputOpen: false,
      };
    }

    // חזרה לשאלה שכבר נענתה (הכרעת אלעד 26.8). רק שאלה שנענתה - קדימה אי אפשר לקפוץ, וזו
    // בדיוק הסיבה שהשומר כאן ולא רק ב-disabled של הכפתור: מקור אמת אחד למי שמותר לפתוח.
    // הבחירה הקודמת נטענת מסומנת, כדי שהמשתמש יראה מה הוא ענה ולא יתחיל מדף ריק
    case "revisit": {
      if (state.busy) return state;
      const item = state.plan.find((p) => p.key === action.key);
      if (item == null || !item.answered) return state;
      const previous = answerFor(state.messages, action.key) ?? "";
      return {
        ...state,
        revisitKey: action.key,
        // עריכת שאלה מונחית היא מונחה בהגדרה, גם אם המשתמש היה בכתיבה חופשית לפני הלחיצה.
        // freeTextIntent לא נמחק בכוונה - "חזרה לשאלה הנוכחית" תחזיר אותו לחופשי כפי שביקש
        freeText: false,
        selectedOptions: item.options ? answerLabels(item.options, previous, item.multiSelect === true) : [],
        customInputOpen: false,
        error: null,
      };
    }

    case "cancelRevisit":
      return {
        ...state,
        revisitKey: null,
        freeText: state.freeTextIntent || computedFreeText(state.next, state.skippedKeys),
        selectedOptions: [],
        customInputOpen: false,
      };

    case "setInput":
      return { ...state, input: action.value };

    // בחירה מרובה: הופך תווית בפנים/בחוץ ל-selectedOptions. ננעל בזמן busy (תור באוויר) - אותו
    // עיקרון נעילה כמו send/skip, כדי שלא ייערכו בחירות על שאלה שכבר בדרך להישלח
    case "toggleOption": {
      if (state.busy) return state;
      const selectedOptions = state.selectedOptions.includes(action.label)
        ? state.selectedOptions.filter((l) => l !== action.label)
        : [...state.selectedOptions, action.label];
      return { ...state, selectedOptions };
    }

    // "אחר": חושף את תיבת הטקסט הקיימת עבור השאלה הנוכחית - לא שינוי ל-freeText הגלובלי (זה
    // עדיין תשובה לאותה שאלה מונחית, רק מוקלדת ולא נבחרת מצ'יפ)
    case "openCustomInput":
      if (state.busy) return state;
      return { ...state, customInputOpen: true };

    case "finishStart":
      return { ...state, finishing: true, error: null };

    case "finishOk":
      return { ...state, finishing: false, closed: true };

    case "finishFail":
      return { ...state, finishing: false, error: action.error };

    // כישלון start אומר שהראיון אף פעם לא הפך ל-interviewing - שליחת הודעה מובטחת להיכשל
    // (הראיון לא פעיל) אם ננסה בכל זאת, אז נועלים closed מיד במקום לחכות שהמשתמש ינסה לשלוח
    // ויגלה את זה רק אז. רענון העמוד הוא הדרך הנכונה לנסות start שוב.
    case "startFail":
      return { ...state, starting: false, error: action.error, closed: true };

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
