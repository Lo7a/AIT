"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksLikeUrl } from "./url-detect";
import { filterCandidates } from "./candidate-filter";
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
  // סינון תת-מחרוזת חי מעל candidates (ראו candidate-filter.ts) - לא נוגע ב-candidates עצמם,
  // כך שחיפוש חוזר תמיד מתחיל מהרשימה המלאה האחרונה שחזרה מהשרת
  filterText: string;
  setFilterText: (v: string) => void;
  visibleCandidates: BusinessCandidate[];
  // מריץ חיפוש Places מחודש עם input+filterText(+city) המורחבים - ל"לא מצאתי את הסניף ברשימה"
  researchWithFilter: () => void;
  // לא-null כשהרשימה המוצגת הגיעה מבדיקת מפות אוטומטית על כתובת אתר שהוקלדה (לא מחיפוש שם).
  // הערך הוא ה-URL המקורי כמו שהוקלד, כדי שאפשר תמיד לחזור למסלול "סריקת האתר בלבד" הישן
  siteOnlyTarget: string | null;
  scanSiteOnly: () => void;
}

const TOO_SHORT_ERROR = "יש להזין שם עסק או כתובת אתר";
const SEARCH_FAILED_ERROR = "החיפוש נכשל, נסו שוב";
const NO_MATCH_ERROR = "לא נמצא עסק מתאים. נסו לנסח אחרת או להוסיף עיר.";

// שאילתת מפות מתוך URL: מסירים פרוטוקול, www. ואת כל מה שאחרי ה-host (נתיב/שאילתה/עוגן) -
// נשאר רק הדומיין עצמו, זו שאילתת החיפוש הכי סבירה. לדוגמה "https://www.gentleman.co.il/store"
// -> "gentleman.co.il"
function domainQueryOf(url: string): string {
  return url.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
}

type SearchResult =
  | { ok: true; candidates: BusinessCandidate[] }
  | { ok: false; status: number; error?: string };

// הוק משותף לכל גרסאות העיצוב: כל הלוגיקה הלא-ויזואלית של תיבת החיפוש (fetch, timeout,
// ניקוי שגיאות 502, זיהוי URL וניווט) חיה כאן במקום אחד. כל גרסה בונה תצוגה משלה על גבי
// ה-state הזה בלי לגעת בלוגיקה עצמה.
export function useBusinessSearch(): BusinessSearchState {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [city, setCity] = useState("");
  const [candidates, setCandidates] = useState<BusinessCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [siteOnlyTarget, setSiteOnlyTarget] = useState<string | null>(null);

  function goToScan(params: URLSearchParams) {
    router.push(`/scan?${params.toString()}`);
  }

  function chooseCandidate(c: BusinessCandidate) {
    const params = new URLSearchParams({ placeId: c.placeId, name: c.name });
    if (city.trim()) params.set("city", city.trim());
    goToScan(params);
  }

  function scanSiteOnly() {
    // מוגן: הכפתור מוצג רק כש-siteOnlyTarget קיים, אבל שומר על חוזה בטוח גם אם נקרא בלעדיו
    if (siteOnlyTarget) goToScan(new URLSearchParams({ url: siteOnlyTarget }));
  }

  // קריאת Places גולמית בלבד - כל קורא כאן מחליט בעצמו מה לעשות עם ok:false (חלק שקטים
  // ונופלים חזרה למסלול הישן, חלק מציגים שגיאה ללקוח), אז אין כאן setError/ניווט
  async function fetchCandidates(query: string): Promise<SearchResult> {
    try {
      const res = await fetch("/api/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as { candidates?: BusinessCandidate[]; error?: string } | null;
      if (!res.ok || !data?.candidates) {
        return { ok: false, status: res.status, error: data?.error };
      }
      return { ok: true, candidates: data.candidates };
    } catch {
      // כולל AbortError מ-AbortSignal.timeout - נופל לאותה הודעה גנרית, לא קורס
      return { ok: false, status: 0 };
    }
  }

  // תוצאת חיפוש "רגילה" (שם עסק, כולל חיפוש חוזר עם טקסט מסונן): מציג שגיאה/בוחר/מציג רשימה.
  // זהה בדיוק להתנהגות ההיסטורית של submit על מועמד יחיד ומחרוזות השגיאה
  function applySearchResult(result: SearchResult) {
    if (!result.ok) {
      // מחרוזת שרת גולמית מוצגת רק כשמדובר ב-400 (שגיאות עברית שלנו); כל השאר גנרי -
      // הודעת 502 הגולמית עוברת ללוג בצד שרת בלבד (ראו search-handler.ts)
      setError(result.status === 400 && result.error ? result.error : SEARCH_FAILED_ERROR);
      return;
    }
    if (result.candidates.length === 0) {
      setError(NO_MATCH_ERROR);
      return;
    }
    if (result.candidates.length === 1) {
      chooseCandidate(result.candidates[0]);
      return;
    }
    setCandidates(result.candidates);
    setFilterText("");
  }

  // דרישת מייסד (א): הקלדת URL כבר לא עוקפת מפות בשקט - קודם בודקים אם העסק קיים שם, ורק
  // אם אין תוצאות (או שהבדיקה עצמה נכשלה) חוזרים למסלול הישן של סריקת אתר ישירה. הבדיקה הזו
  // לעולם לא חוסמת את המשתמש בשגיאה משלה - כשל כאן שקוף לגמרי, ה-fallback הוא הניווט הרגיל
  async function searchFromUrl(url: string) {
    setBusy(true);
    try {
      const result = await fetchCandidates(domainQueryOf(url));
      if (result.ok && result.candidates.length > 0) {
        setSiteOnlyTarget(url);
        setCandidates(result.candidates);
        setFilterText("");
        return;
      }
      goToScan(new URLSearchParams({ url }));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidates(null);
    setSiteOnlyTarget(null);
    setFilterText("");
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setError(TOO_SHORT_ERROR);
      return;
    }
    if (looksLikeUrl(trimmed)) {
      await searchFromUrl(trimmed);
      return;
    }
    setBusy(true);
    try {
      const query = city.trim() ? `${trimmed} ${city.trim()}` : trimmed;
      applySearchResult(await fetchCandidates(query));
    } finally {
      setBusy(false);
    }
  }

  // קומבו-בוקס סניפים: "לא מצאתי את הסניף ברשימה" - מרחיבים את השאילתה עם טקסט הסינון
  // (ולעיר, אם הוזנה) ומריצים חיפוש Places חדש. עובד גם כשהרשימה הנוכחית הגיעה ממסלול URL
  // (siteOnlyTarget נשאר כמות שהוא - עדיין אפשר לבחור "סריקת האתר בלבד" אחרי חיפוש חוזר)
  async function researchWithFilter() {
    const trimmed = input.trim();
    if (trimmed.length < 2) return;
    setError(null);
    setBusy(true);
    try {
      const withFilter = filterText.trim() ? `${trimmed} ${filterText.trim()}` : trimmed;
      const query = city.trim() ? `${withFilter} ${city.trim()}` : withFilter;
      applySearchResult(await fetchCandidates(query));
    } finally {
      setBusy(false);
    }
  }

  const visibleCandidates = candidates ? filterCandidates(candidates, filterText) : [];

  return {
    input, setInput, city, setCity, candidates, busy, error, submit, chooseCandidate,
    filterText, setFilterText, visibleCandidates, researchWithFilter,
    siteOnlyTarget, scanSiteOnly,
  };
}
