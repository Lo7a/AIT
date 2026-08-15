"use client";

import { useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import type { InterviewSnapshot, TurnResult } from "../../server/run-interview";
import {
  chatReducer, initialChatState, visibleNext, sectionProgress,
} from "./chat-logic";

const GENERIC_ERROR = "משהו השתבש, נסו שוב בעוד רגע";
// המחרוזת הזו חייבת להיות זהה בדיוק להודעה שזורקת runInterviewTurn (run-interview.ts) -
// זה הסימן היחיד שהראיון כבר לא פעיל אצל טאב אחר, ומצדיק רענון snapshot במקום סתם הצגת שגיאה
const NOT_ACTIVE_ERROR = "הראיון לא פעיל, יש להתחיל אותו קודם";
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

  const visible = visibleNext(state.next, state.skippedKeys);
  const sections = sectionProgress(state.credits);

  // בוליאנים נגזרים חשופים מההוק ולא מחושבים שוב בתצוגה: כלל "מתי מותר לשלוח/לסיים/לדלג"
  // הוא חוק לוגי, לא פרט ויזואלי - גרסת עיצוב עתידית שמחליפה את default-interview.tsx לא
  // אמורה לגזור אותו בעצמה ולסכן פער בין הגרסאות
  const canSend = !state.busy && !state.starting && !state.finishing && !state.closed && state.input.trim().length > 0;
  const canFinish = !state.finishing && !state.starting;
  const canSkip = !state.busy && !state.starting && visible != null;

  async function send() {
    if (state.busy || state.input.trim().length === 0 || sendingRef.current) return;
    sendingRef.current = true;
    try {
      const content = state.input.trim();
      const freeText = state.freeText;
      const questionKey = freeText ? undefined : (visible?.key);
      dispatch({ type: "send" });
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
        if (error === NOT_ACTIVE_ERROR) {
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

  function skip() {
    dispatch({ type: "skip" });
  }

  async function finish() {
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
  }

  return {
    ...state,
    visible,
    sections,
    canSend,
    canFinish,
    canSkip,
    send,
    skip,
    finish,
    setInput: (value: string) => dispatch({ type: "setInput", value }),
    setFreeText: (value: boolean) => dispatch({ type: "setFreeText", value }),
  };
}
