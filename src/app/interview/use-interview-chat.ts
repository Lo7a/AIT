"use client";

import { useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import type { InterviewSnapshot, TurnResult } from "../../server/run-interview";
import { NOT_ACTIVE_MESSAGE } from "../../pipeline/interview/contract";
import {
  chatReducer, initialChatState, visibleNext, sectionProgress, answerFor,
} from "./chat-logic";

const GENERIC_ERROR = "משהו השתבש, נסו שוב בעוד רגע";
// הודעה קבועה בצד לקוח לאותו מקרה - לא מהדהדים את מחרוזת השרת (זו יותר "קוד שגיאה" פנימי
// מאשר טקסט שמיועד להיקרא), ומכוונים ישר לפעולת ההמשך הנכונה (סיום, שהוא אידמפוטנטי בצד שרת)
const NOT_ACTIVE_CLIENT_MESSAGE = "הראיון כבר נסגר. לחיצה על סיום הראיון תעביר לדוח המעודכן.";

async function readServerError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? GENERIC_ERROR;
}

// גם res.json() יכול להיכשל (חיבור נקטע באמצע גוף התשובה אחרי שה-fetch עצמו כבר הצליח) -
// בלי ה-catch כאן קריאה כושלת הייתה משאירה busy/starting/finishing תקוע true לצמיתות
// אצל כל קורא (ראו הערות ליד כל קריאה ל-fetchSnapshot למטה)
async function fetchSnapshot(diagnosisId: string): Promise<InterviewSnapshot | null> {
  const res = await fetch(`/api/interview/${diagnosisId}`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  return data as InterviewSnapshot | null;
}

// הוק משותף לכל גרסאות העיצוב (כמו use-scan-stream.ts / use-business-search.ts): כל קריאות
// ה-API והתיאום איתן חיים כאן; ה-reducer עצמו (chat-logic.ts) טהור לגמרי ונבדק בלי React.
// כל גרסת עיצוב בונה תצוגה משלה על גבי מה שההוק מחזיר, בלי לגעת בלוגיקה. ניהול פוקוס נשאר
// בתצוגה בכוונה (ראו default-interview.tsx) - זה תלוי-DOM/timing-רינדור, לא לוגיקת עסק.
export function useInterviewChat(diagnosisId: string, initial: InterviewSnapshot) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chatReducer, initial, initialChatState);
  // מנעול מפתח-לפי-diagnosisId (לא boolean גורף) - ראו use-scan-stream.ts guardedRef: אם
  // אותו מופע הוק אי-פעם משמש עבור diagnosisId אחר (למשל רה-שימוש ברכיב בין ניווטים בלי
  // רימאונט מלא), עדיין צריך לירות start עבור המזהה החדש ולא להישאר נעול על הישן
  const guardedRef = useRef<string | null>(null);
  // מנעול רשת אמיתי, בנוסף להגנת ה-busy שב-reducer: dispatch({type:"send"}) לא מעדכן את
  // ה-state באופן סינכרוני (React מריץ רינדור מחדש אחרי שהפונקציה הזו כבר ממשיכה), אז שתי
  // קריאות ל-send() באותו טיק היו עוברות את בדיקת state.busy הישנה ויורות שני POST בתשלום
  const sendingRef = useRef(false);
  // אותו מנעול רשת, לאותה סיבה בדיוק, על finish(): שתי לחיצות על "סיום הראיון" באותו טיק
  // עדיין רואות state.finishing=false (הרינדור עם finishing=true עוד לא קרה) ושתיהן היו יורות POST
  const finishingRef = useRef(false);

  useEffect(() => {
    if (guardedRef.current === diagnosisId) return;
    guardedRef.current = diagnosisId;
    // כבר interviewing (למשל resume אחרי רענון עמוד) - אין מה להתחיל, ה-snapshot ההתחלתי מספיק
    if (initial.status === "interviewing") return;

    (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/interview/${diagnosisId}/start`, { method: "POST" });
      } catch {
        dispatch({ type: "startFail", error: GENERIC_ERROR });
        return;
      }
      if (res.status === 409) {
        // מירוץ מקביל כבר הזיז את הסטטוס - זו לא שגיאה, רק צריך snapshot אמיתי מהשרת
        const snap = await fetchSnapshot(diagnosisId);
        dispatch(snap ? { type: "snapshot", payload: snap } : { type: "startFail", error: GENERIC_ERROR });
        return;
      }
      if (!res.ok) {
        dispatch({ type: "startFail", error: await readServerError(res) });
        return;
      }
      const snap = await res.json().catch(() => null);
      dispatch(snap ? { type: "snapshot", payload: snap as InterviewSnapshot } : { type: "startFail", error: GENERIC_ERROR });
    })();
    // דיפ-רשימה מכוונת ל-diagnosisId/initial.status בלבד: זה אפקט חד-פעמי לפי guardedRef,
    // לא אמור לרוץ שוב אם initial משתנה רפרנס בלי שה-mount עצמו השתנה
  }, [diagnosisId, initial.status]);

  // שאלה שהמשתמש חזר אליה גוברת על השאלה הבאה בכל מקום שקורא ל-visible - תצוגה, צ'יפים
  // ושליחה כאחד. כך עריכה עוברת באותו מסלול בדיוק כמו תשובה רגילה, בלי ענף שני
  const revisited = state.revisitKey != null
    ? state.plan.find((p) => p.key === state.revisitKey) ?? null
    : null;
  const visible = revisited ?? visibleNext(state.next, state.skippedKeys);
  // התשובה השמורה לשאלה שנערכת, כדי שהתצוגה תוכל להראות אותה. null כשלא עורכים
  const previousAnswer = answerFor(state.messages, state.revisitKey);
  // הערה (משימה 19): צ'יפי הסקציות ירדו מהמסך יחד עם אחוז השלמות, והכרטיס מציג עכשיו את
  // פנקס החוסרים. sectionProgress עצמו נשאר מיוצא ונבדק ב-chat-logic - הוא פונקציה טהורה
  // שעשויה לשמש מסך ניהול - אבל אין לו יותר צרכן בנתיב הריצה, ולכן הוא לא מחושב כאן לחינם

  // בוליאנים נגזרים חשופים מההוק ולא מחושבים שוב בתצוגה: כלל "מתי מותר לשלוח/לסיים/לדלג"
  // הוא חוק לוגי, לא פרט ויזואלי - גרסת עיצוב עתידית שמחליפה את default-interview.tsx לא
  // אמורה לגזור אותו בעצמה ולסכן פער בין הגרסאות
  // תנאי-הנעילה המלא של כל פעולת שליחה בפועל (טקסט חופשי/צ'יפ בודד/אישור בחירה מרובה) - busy
  // בזמן תור, starting לפני שהראיון בכלל פעיל, finishing כשסיום כבר בדרך, closed אחרי שנסגר.
  // דלג/כתיבה חופשית ממשיכים להשתמש ב-canSkip הקיים (לא כולל finishing/closed) - התנהגות
  // קיימת שלא נגעתי בה, לא חלק מהשינוי הזה
  const canAnswer = !state.busy && !state.starting && !state.finishing && !state.closed;
  const canSend = canAnswer && state.input.trim().length > 0;
  const canFinish = !state.finishing && !state.starting;
  // דילוג חל רק על השאלה הנוכחית. בזמן עריכה של שאלה שנענתה אין מה לדלג (ראו ה-reducer)
  const canSkip = !state.busy && !state.starting && visible != null && state.revisitKey == null;
  // בחירה מרובה: כפתור "שליחה" של אישור הצ'יפים פעיל רק כשנבחרה לפחות תווית אחת
  const canConfirmOptions = canAnswer && state.selectedOptions.length > 0;

  // ליבת השליחה המשותפת ל-send() (טקסט חופשי, קורא state.input) ול-selectOption/confirmOptions
  // (צ'יפים, מקבלים תוכן ישירות) - כדי שלא תהיה שתי מימושים כפולים של אותה שיחת רשת. content
  // מגיע כפרמטר מפורש (לא נקרא מ-state.input) כדי להימנע מבעיית ה-state הסגור-ישן: לו
  // selectOption היה עושה setInput(label) ואז קורא ל-send() הישן, send() עדיין היה קורא את
  // state.input מהרינדור הנוכחי (לפני שה-dispatch של setInput תפס) - reducer לא מתעדכן סינכרונית.
  async function submit(content: string, questionKey: string | undefined, freeText: boolean) {
    if (state.busy || content.trim().length === 0 || sendingRef.current) return;
    sendingRef.current = true;
    try {
      dispatch({ type: "send", content, questionKey });
      let res: Response;
      try {
        res = await fetch(`/api/interview/${diagnosisId}/message`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, questionKey, isFreeText: freeText }),
        });
      } catch {
        dispatch({ type: "turnFail", error: GENERIC_ERROR });
        return;
      }
      if (!res.ok) {
        const error = await readServerError(res);
        // "הראיון לא פעיל" אומר שטאב אחר כבר סיים/שינה את הראיון - מציגים הודעה קבועה
        // שמכוונת לפעולה הנכונה (לא מהדהדים את מחרוזת השרת), ואז מרעננים snapshot אמיתי
        // תוך שמירה על ההודעה הזו (keepError) כדי שלא תיעלם אחרי כמה מאות מילישניות
        if (error === NOT_ACTIVE_MESSAGE) {
          dispatch({ type: "turnFail", error: NOT_ACTIVE_CLIENT_MESSAGE });
          const snap = await fetchSnapshot(diagnosisId);
          if (snap) dispatch({ type: "snapshot", payload: snap, keepError: true });
          return;
        }
        dispatch({ type: "turnFail", error });
        return;
      }
      const payload = await res.json().catch(() => null);
      if (payload == null) {
        dispatch({ type: "turnFail", error: GENERIC_ERROR });
        return;
      }
      dispatch({ type: "turnOk", payload: payload as TurnResult });
    } finally {
      sendingRef.current = false;
    }
  }

  async function send() {
    const freeText = state.freeText;
    const questionKey = freeText ? undefined : (visible?.key);
    await submit(state.input, questionKey, freeText);
  }

  // בחירה בודדת: לחיצה על צ'יפ = שליחה מיידית (אפיון מחדש-ראיון, החלטה D). תמיד קשורה לשאלה
  // המונחית הנוכחית (questionKey=visible.key, isFreeText=false) - בדיוק כמו תשובה מוקלדת רגילה
  // לאותה שאלה, רק שהתוכן הוא תווית הצ'יפ במקום מה שהוקלד בתיבה
  function selectOption(label: string) {
    if (visible == null || visible.multiSelect) return;
    void submit(label, visible.key, false);
  }

  // בחירה מרובה: הצ'יפים רק מסמנים (toggleOption ב-reducer) - השליחה בפועל קורית רק בלחיצה על
  // כפתור האישור, עם כל התוויות שנבחרו מחוברות בפסיק (אותו פורמט טקסט כמו תשובה מוקלדת חופשית -
  // אין שינוי בחוזה החילוץ, ראו אפיון מחדש-ראיון החלטה C)
  function confirmOptions() {
    if (visible == null || !visible.multiSelect || state.selectedOptions.length === 0) return;
    void submit(state.selectedOptions.join(", "), visible.key, false);
  }

  function toggleOption(label: string) {
    dispatch({ type: "toggleOption", label });
  }

  function openCustomInput() {
    dispatch({ type: "openCustomInput" });
  }

  function skip() {
    dispatch({ type: "skip" });
  }

  function revisit(key: string) {
    dispatch({ type: "revisit", key });
  }

  function cancelRevisit() {
    dispatch({ type: "cancelRevisit" });
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      dispatch({ type: "finishStart" });
      let res: Response;
      try {
        res = await fetch(`/api/interview/${diagnosisId}/finish`, { method: "POST" });
      } catch {
        dispatch({ type: "finishFail", error: GENERIC_ERROR });
        return;
      }
      if (res.status === 409) {
        // 409 כאן אומר שמישהו אחר כבר סגר את הראיון במקביל - finish אידמפוטנטי בצד שרת אז
        // זה כבר הצליח בפועל; מרעננים אם אפשר, ותמיד מנווטים לדוח כמו בהצלחה רגילה - להישאר
        // על המסך הזה אחרי לחיצה על "סיום" ירגיש כמו שהכפתור לא עשה כלום
        const snap = await fetchSnapshot(diagnosisId);
        if (snap) dispatch({ type: "snapshot", payload: snap });
        router.push(`/report/${diagnosisId}`);
        return;
      }
      if (!res.ok) {
        dispatch({ type: "finishFail", error: await readServerError(res) });
        return;
      }
      dispatch({ type: "finishOk" });
      router.push(`/report/${diagnosisId}`);
    } finally {
      finishingRef.current = false;
    }
  }

  return {
    ...state,
    visible,
    previousAnswer,
    canSend,
    canFinish,
    canSkip,
    canAnswer,
    canConfirmOptions,
    send,
    skip,
    revisit,
    cancelRevisit,
    finish,
    selectOption,
    confirmOptions,
    toggleOption,
    openCustomInput,
    setInput: (value: string) => dispatch({ type: "setInput", value }),
    setFreeText: (value: boolean) => dispatch({ type: "setFreeText", value }),
  };
}
