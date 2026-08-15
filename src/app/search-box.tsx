"use client";

import { useEffect, useRef, useState } from "react";
import { useBusinessSearch } from "./use-business-search";

const LISTBOX_ID = "candidate-listbox";
const optionId = (placeId: string) => `candidate-option-${placeId}`;

export function SearchBox() {
  const {
    input, setInput, city, setCity, candidates, busy, error, submit, chooseCandidate,
    filterText, setFilterText, visibleCandidates, researchWithFilter,
    siteOnlyTarget, scanSiteOnly, socialHint,
  } = useBusinessSearch();

  // מוקד לשדה השם הראשי - כשההוק מציג socialHint, כפתור "אכתוב את שם העסק" מחזיר את המשתמש
  // לשדה הזה בפועל (פוקוס הוא DOM גרידא, נשאר בתצוגה בכוונה, ראו ההערה למטה)
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ניהול הפוקוס/הדגשה בתוך הרשימה הוא תלוי-DOM גרידא (איזו שורה מודגשת בזמן ניווט בחצים) -
  // נשאר בתצוגה בכוונה, כמו ב-use-interview-chat.ts. כל שאר ההחלטות (מה מסונן, מתי מחפשים
  // שוב, לאן מנווטים) כבר מגיעות מוכנות מההוק
  const [activeIndex, setActiveIndex] = useState(-1);

  // רשימת מועמדים חדשה מהשרת (חיפוש/חיפוש חוזר) - ההדגשה הקודמת כבר לא רלוונטית
  useEffect(() => {
    setActiveIndex(-1);
  }, [candidates]);

  function onFilterChange(v: string) {
    setFilterText(v);
    setActiveIndex(-1);
  }

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (visibleCandidates.length > 0) {
        setActiveIndex((i) => Math.min(i + 1, visibleCandidates.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visibleCandidates.length > 0) {
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (visibleCandidates.length === 0) {
        researchWithFilter();
        return;
      }
      const active = visibleCandidates[activeIndex];
      if (active) chooseCandidate(active);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setFilterText("");
      setActiveIndex(-1);
    }
  }

  return (
    <div className="mt-8 animate-fade-up" style={{ animationDelay: "160ms" }}>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={nameInputRef}
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
        <div className="mt-4">
          {siteOnlyTarget && (
            <p className="mb-2 text-sm font-medium text-[#111111]">
              מצאנו את העסק גם בגוגל מפות
            </p>
          )}

          <input
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            onKeyDown={onFilterKeyDown}
            placeholder="סננו לפי רחוב, עיר או שם"
            aria-label="סננו את רשימת התוצאות"
            role="combobox"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 && visibleCandidates[activeIndex]
                ? optionId(visibleCandidates[activeIndex].placeId)
                : undefined
            }
            className="w-full rounded-md border border-black/[0.06] bg-white px-4 py-3 focus:border-[#111111] focus:outline-none focus:ring-1 focus:ring-[#111111]"
          />

          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-live="polite"
            className="mt-2 divide-y divide-black/[0.06] rounded-lg border border-black/[0.06] bg-white"
          >
            {visibleCandidates.map((c, i) => (
              <li
                key={c.placeId}
                id={optionId(c.placeId)}
                role="option"
                aria-selected={i === activeIndex}
                className={`animate-fade-up ${i === activeIndex ? "bg-black/[0.02]" : ""}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
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

          <button
            type="button"
            onClick={() => researchWithFilter()}
            className="mt-2 text-sm font-medium text-[#111111] underline decoration-black/20 underline-offset-2 hover:decoration-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
          >
            חפשו שוב עם הטקסט הזה
          </button>

          {siteOnlyTarget && (
            <button
              type="button"
              onClick={scanSiteOnly}
              className="mt-2 block text-sm text-[#6F6E6A] underline decoration-black/10 underline-offset-2 hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            >
              סריקת האתר בלבד
            </button>
          )}
        </div>
      )}

      {socialHint && (
        <div className="mt-4 rounded-lg border border-black/[0.06] bg-white p-4">
          <p className="text-[#6F6E6A]">{socialHint.message}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => {
                setInput("");
                nameInputRef.current?.focus();
              }}
              className="text-sm font-medium text-[#111111] underline decoration-black/20 underline-offset-2 hover:decoration-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            >
              אכתוב את שם העסק
            </button>
            <button
              type="button"
              onClick={scanSiteOnly}
              className="text-sm text-[#6F6E6A] underline decoration-black/10 underline-offset-2 hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            >
              סריקת האתר בלבד
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
