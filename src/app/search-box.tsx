"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksLikeUrl } from "./url-detect";
import type { BusinessCandidate } from "../pipeline/types";

export function SearchBox() {
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
    goToScan(new URLSearchParams({ placeId: c.placeId, name: c.name }));
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
      });
      const data = (await res.json().catch(() => null)) as { candidates?: BusinessCandidate[]; error?: string } | null;
      if (!res.ok || !data?.candidates) {
        if (res.status === 502) {
          // שגיאת צד-ספק עוברת ללוג בלבד — הטקסט הגולמי עלול להכיל פרטי תשתית (סקירת משימה 7)
          console.error("search upstream error:", data?.error);
          setError("החיפוש נכשל, נסו שוב בעוד רגע");
        } else {
          setError(data?.error ?? "החיפוש נכשל, נסו שוב");
        }
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
      setError("החיפוש נכשל, נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שם העסק או כתובת האתר"
          className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-teal-700 focus:outline-none"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="עיר (לא חובה)"
          className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-teal-700 focus:outline-none sm:w-40"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-700 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "מחפשים..." : "אבחן את העסק שלי"}
        </button>
      </form>

      {error && <p className="mt-3 text-red-600">{error}</p>}

      {candidates && (
        <ul className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white shadow-sm">
          {candidates.map((c) => (
            <li key={c.placeId}>
              <button
                type="button"
                onClick={() => chooseCandidate(c)}
                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-stone-50"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-sm text-stone-500">{c.address}</span>
                </span>
                {c.rating != null && (
                  <span className="text-sm text-stone-600">{c.rating} ★ ({c.reviewCount ?? 0})</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
