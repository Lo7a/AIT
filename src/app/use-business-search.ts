"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksLikeUrl } from "./url-detect";
import type { BusinessCandidate } from "../pipeline/types";

export interface BusinessSearchState {
  input: string;
  setInput: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  candidates: BusinessCandidate[] | null;
  busy: boolean;
  error: string | null;
  submit: (e: React.FormEvent) => void;
  chooseCandidate: (c: BusinessCandidate) => void;
}

// הוק משותף לכל גרסאות העיצוב: כל הלוגיקה הלא-ויזואלית של תיבת החיפוש (fetch, timeout,
// ניקוי שגיאות 502, זיהוי URL וניווט) חיה כאן במקום אחד. כל גרסה בונה תצוגה משלה
// (input/כפתור/רשימת מועמדים) על גבי ה-state הזה בלי לגעת בלוגיקה עצמה.
export function useBusinessSearch(): BusinessSearchState {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [city, setCity] = useState("");
  const [candidates, setCandidates] = useState<BusinessCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToScan(params: URLSearchParams) {
    router.push(`/scan?${params.toString()}`);
  }

  function chooseCandidate(c: BusinessCandidate) {
    const params = new URLSearchParams({ placeId: c.placeId, name: c.name });
    if (city.trim()) params.set("city", city.trim());
    goToScan(params);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidates(null);
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setError("יש להזין שם עסק או כתובת אתר");
      return;
    }
    if (looksLikeUrl(trimmed)) {
      goToScan(new URLSearchParams({ url: trimmed }));
      return;
    }
    setBusy(true);
    try {
      const query = city.trim() ? `${trimmed} ${city.trim()}` : trimmed;
      const res = await fetch("/api/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as { candidates?: BusinessCandidate[]; error?: string } | null;
      if (!res.ok || !data?.candidates) {
        // מחרוזת שרת גולמית מוצגת רק כשמדובר ב-400 (שגיאות עברית שלנו); כל השאר גנרי -
        // הודעת 502 הגולמית עוברת ללוג בצד שרת בלבד (ראו search-handler.ts)
        setError(res.status === 400 && data?.error ? data.error : "החיפוש נכשל, נסו שוב");
        return;
      }
      if (data.candidates.length === 0) {
        setError("לא נמצא עסק מתאים. נסו לנסח אחרת או להוסיף עיר.");
        return;
      }
      if (data.candidates.length === 1) {
        chooseCandidate(data.candidates[0]);
        return;
      }
      setCandidates(data.candidates);
    } catch {
      // כולל AbortError מ-AbortSignal.timeout - נופל לאותה הודעה גנרית, לא קורס
      setError("החיפוש נכשל, נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  return { input, setInput, city, setCity, candidates, busy, error, submit, chooseCandidate };
}
