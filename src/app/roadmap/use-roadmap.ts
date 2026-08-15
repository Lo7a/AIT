"use client";

import { useEffect, useReducer, useRef } from "react";
import type { RoadmapView } from "../../server/roadmap-repo";
import {
  roadmapReducer, initialRoadmapState, groupByPhase,
} from "./roadmap-logic";

const GENERIC_ERROR = "משהו השתבש, נסו שוב בעוד רגע";

async function readServerError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? GENERIC_ERROR;
}

// אותו לקח כמו use-interview-chat.ts (fetchSnapshot): res.json() יכול להיכשל גם אחרי res.ok
// (חיבור נקטע באמצע גוף התשובה) - בלי ה-catch כאן קריאה כושלת הייתה משאירה buildPhase="building"
// תקוע לצמיתות
async function fetchRoadmap(diagnosisId: string): Promise<RoadmapView | null> {
  const res = await fetch(`/api/roadmap/${diagnosisId}`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  return data as RoadmapView | null;
}

// הוק משותף לכל גרסאות העיצוב (כמו use-interview-chat.ts): כל קריאות ה-API והתיאום איתן חיות
// כאן; roadmap-logic.ts עצמו טהור לגמרי ונבדק בלי React. כל גרסת עיצוב בונה תצוגה משלה על גבי
// מה שההוק מחזיר, בלי לגעת בלוגיקה.
export function useRoadmap(diagnosisId: string, initial: RoadmapView | null) {
  const [state, dispatch] = useReducer(roadmapReducer, initial, initialRoadmapState);

  // מנעול מפתח-לפי-diagnosisId (לא boolean גורף) - ראו use-interview-chat.ts guardedRef: מגן
  // מפני הרצה כפולה של אפקט ה-mount (StrictMode/רימאונט) בלי לנעול הוק שמשמש diagnosisId אחר
  const guardedRef = useRef<string | null>(null);
  // מנעול רשת אמיתי בנוסף להגנת ה-state: dispatch({type:"buildStart"}) לא מעדכן את ה-state
  // באופן סינכרוני, אז שתי קריאות ל-build() באותו טיק (למשל mount + לחיצה מהירה על "חישוב מחדש")
  // היו עוברות את בדיקת buildPhase הישנה ויורות שני POST בתשלום
  const buildingRef = useRef(false);
  // אותו מנעול רשת, לכל itemId בנפרד - שתי לחיצות מהירות על אותו כפתור "אני רוצה להטמיע"
  const sendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (guardedRef.current === diagnosisId) return;
    guardedRef.current = diagnosisId;
    // כבר יש Roadmap (מה-RSC, ראו page.tsx) - אין צורך בבנייה אוטומטית, "חישוב מחדש" הוא כפתור
    // מפורש בלבד. בנייה אוטומטית רק כש"אין עדיין Roadmap" (מסך "building" באפיון המשימה)
    if (initial) return;
    void build();
    // דיפ-רשימה מכוונת ל-diagnosisId בלבד - זה אפקט חד-פעמי לפי guardedRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  async function build() {
    if (buildingRef.current) return;
    buildingRef.current = true;
    dispatch({ type: "buildStart" });
    try {
      let res: Response;
      try {
        res = await fetch(`/api/roadmap/${diagnosisId}`, { method: "POST" });
      } catch {
        dispatch({ type: "buildFail", error: GENERIC_ERROR });
        return;
      }
      if (res.status === 409) {
        // מירוץ מקביל כבר בונה/בנה Roadmap - זו לא שגיאה, פשוט מרעננים GET (בקשת המשימה: 409 = refetch)
        const view = await fetchRoadmap(diagnosisId);
        dispatch(view ? { type: "buildOk", payload: view } : { type: "buildFail", error: GENERIC_ERROR });
        return;
      }
      if (!res.ok) {
        dispatch({ type: "buildFail", error: await readServerError(res) });
        return;
      }
      // ה-POST מחזיר { roadmapId } בלבד (ראו api/roadmap/[id]/route.ts) - צריך GET נוסף לתצוגה המלאה
      const payload = await res.json().catch(() => null);
      if (!payload) {
        dispatch({ type: "buildFail", error: GENERIC_ERROR });
        return;
      }
      const view = await fetchRoadmap(diagnosisId);
      dispatch(view ? { type: "buildOk", payload: view } : { type: "buildFail", error: GENERIC_ERROR });
    } finally {
      buildingRef.current = false;
    }
  }

  async function requestBrief(itemId: string) {
    if (sendingRef.current.has(itemId)) return;
    sendingRef.current.add(itemId);
    dispatch({ type: "itemSendStart", itemId });
    try {
      let res: Response;
      try {
        res = await fetch(`/api/brief/${itemId}`, { method: "POST" });
      } catch {
        dispatch({ type: "itemSendFail", itemId, error: GENERIC_ERROR });
        return;
      }
      if (!res.ok) {
        dispatch({ type: "itemSendFail", itemId, error: await readServerError(res) });
        return;
      }
      const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!payload?.ok) {
        dispatch({ type: "itemSendFail", itemId, error: GENERIC_ERROR });
        return;
      }
      dispatch({ type: "itemSendOk", itemId });
    } finally {
      sendingRef.current.delete(itemId);
    }
  }

  return {
    ...state,
    groups: state.roadmap ? groupByPhase(state.roadmap.items) : [],
    rebuild: build,
    requestBrief,
  };
}
