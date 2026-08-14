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

async function readServerError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? GENERIC_ERROR;
}

async function fetchSnapshot(diagnosisId: string): Promise<InterviewSnapshot | null> {
  const res = await fetch(`/api/interview/${diagnosisId}`).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as InterviewSnapshot;
}

// הוק משותף לכל גרסאות העיצוב (כמו use-scan-stream.ts / use-business-search.ts): כל קריאות
// ה-API והתיאום איתן חיים כאן; ה-reducer עצמו (chat-logic.ts) טהור לגמרי ונבדק בלי React.
// כל גרסת עיצוב בונה תצוגה משלה על גבי מה שההוק מחזיר, בלי לגעת בלוגיקה.
export function useInterviewChat(diagnosisId: string, initial: InterviewSnapshot) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chatReducer, initial, initialChatState);
  // reactStrictMode כבוי (next.config.ts) אבל שומרים על המנעול בכל זאת - ראו use-scan-stream.ts:
  // בלי זה כל רימאונט (או StrictMode עתידי) היה שולח POST /start כפול
  const guardedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (guardedRef.current) return;
    guardedRef.current = true;
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
      dispatch({ type: "snapshot", payload: (await res.json()) as InterviewSnapshot });
    })();
    // דיפ-רשימה מכוונת ל-diagnosisId/initial.status בלבד: זה אפקט חד-פעמי לפי guardedRef,
    // לא אמור לרוץ שוב אם initial משתנה רפרנס בלי שה-mount עצמו השתנה
  }, [diagnosisId, initial.status]);

  const visible = visibleNext(state.next, state.skippedKeys);
  const sections = sectionProgress(state.credits);

  async function send() {
    if (state.busy || state.input.trim().length === 0) return;
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
      inputRef.current?.focus();
      return;
    }
    if (!res.ok) {
      const error = await readServerError(res);
      dispatch({ type: "turnFail", error });
      inputRef.current?.focus();
      // "הראיון לא פעיל" אומר שטאב אחר כבר סיים/שינה את הראיון - מרעננים את המצב האמיתי
      // כדי שהמסך יתיישר איתו, במקום להישאר תקוע על מצב מקומי שכבר לא נכון
      if (error === NOT_ACTIVE_ERROR) {
        const snap = await fetchSnapshot(diagnosisId);
        if (snap) dispatch({ type: "snapshot", payload: snap });
      }
      return;
    }
    const payload = (await res.json()) as TurnResult;
    dispatch({ type: "turnOk", payload });
    inputRef.current?.focus();
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
      const snap = await fetchSnapshot(diagnosisId);
      dispatch(snap ? { type: "snapshot", payload: snap } : { type: "finishFail", error: GENERIC_ERROR });
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
    inputRef,
    send,
    skip,
    finish,
    setInput: (value: string) => dispatch({ type: "setInput", value }),
    setFreeText: (value: boolean) => dispatch({ type: "setFreeText", value }),
  };
}
