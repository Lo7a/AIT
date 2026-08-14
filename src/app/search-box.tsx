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

  return (
    <div className="mt-8 animate-fade-up" style={{ animationDelay: "160ms" }}>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שם העסק או כתובת האתר"
          aria-label="שם העסק או כתובת האתר"
          className="flex-1 rounded-md border border-black/[0.06] bg-white px-4 py-3 text-lg focus:border-[#111111] focus:outline-none focus:ring-1 focus:ring-[#111111]"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="עיר (לא חובה)"
          aria-label="עיר (לא חובה)"
          className="rounded-md border border-black/[0.06] bg-white px-4 py-3 text-lg focus:border-[#111111] focus:outline-none focus:ring-1 focus:ring-[#111111] sm:w-40"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#111111] px-6 py-3 text-lg font-semibold text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          {busy ? "מחפשים..." : "אבחן את העסק שלי"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-[#9F2F2D]">
          {error}
        </p>
      )}

      {candidates && (
        <ul
          aria-live="polite"
          className="mt-4 divide-y divide-black/[0.06] rounded-lg border border-black/[0.06] bg-white"
        >
          {candidates.map((c, i) => (
            <li key={c.placeId} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <button
                type="button"
                onClick={() => chooseCandidate(c)}
                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-black/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-sm text-[#6F6E6A]">{c.address}</span>
                </span>
                {c.rating != null && (
                  <span className="tabular-nums text-sm text-[#6F6E6A]">
                    {c.rating} ★ ({c.reviewCount ?? 0})
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
