"use client";

import { useBusinessSearch } from "./use-business-search";

export function SearchBox() {
  const { input, setInput, city, setCity, candidates, busy, error, submit, chooseCandidate } =
    useBusinessSearch();

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
