"use client";

import { useEffect, useRef, useState } from "react";
import { useBusinessSearch } from "./use-business-search";
import { popPendingSearch } from "./landing-logic";

const LISTBOX_ID = "candidate-listbox";
const optionId = (placeId: string) => `candidate-option-${placeId}`;

// אייקונים קטנים לשדות ולכפתור - תצוגה בלבד, בשפת העיצוב הנבחרת (כהה פרמיום, סגול וברקת)
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function CapArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
    </svg>
  );
}

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

  // כוונת חיפוש שנשמרה בדף הנחיתה לפני ההתחברות (landing-logic.ts) - ממלאת את השדה פעם
  // אחת אחרי הכניסה; שליפה חד-פעמית, רענון לא ימלא שוב. setInput יציב (useState setter)
  useEffect(() => {
    const pending = popPendingSearch(window.sessionStorage);
    if (pending != null) setInput(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="fieldrow">
          <label className="field">
            <input
              ref={nameInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שם העסק או כתובת האתר"
              aria-label="שם העסק או כתובת האתר"
            />
            <SearchIcon />
          </label>
          <label className="field">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="עיר (לא חובה)"
              aria-label="עיר (לא חובה)"
            />
            <PinIcon />
          </label>
        </div>
        <button type="submit" disabled={busy} className="btn self-start">
          {busy ? "מחפשים..." : "אבחן את העסק שלי"}
          <span className="cap"><CapArrow /></span>
        </button>
      </form>

      {error && (
        <p role="alert" className="form-error mt-3">
          <AlertIcon />
          {error}
        </p>
      )}

      {candidates && (
        <div className="mt-5">
          {siteOnlyTarget && (
            <p className="mb-2 text-sm font-semibold" style={{ color: "var(--acc2-soft)" }}>
              מצאנו את העסק גם בגוגל מפות
            </p>
          )}

          <label className="field">
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
            />
            <SearchIcon />
          </label>

          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-live="polite"
            className="mt-2 overflow-hidden rounded-2xl border"
            style={{ borderColor: "var(--hair-soft)", background: "var(--surface-1)" }}
          >
            {visibleCandidates.map((c, i) => (
              <li
                key={c.placeId}
                id={optionId(c.placeId)}
                role="option"
                aria-selected={i === activeIndex}
                className="border-t first:border-t-0"
                style={{ borderColor: "var(--row-line)" }}
              >
                <button
                  type="button"
                  onClick={() => chooseCandidate(c)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-[rgba(var(--acc-rgb),0.06)]"
                  style={i === activeIndex ? { background: "rgba(var(--acc-rgb),.12)" } : undefined}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--mut)" }}>{c.address}</span>
                  </span>
                  {c.rating != null && (
                    <span className="num shrink-0 text-xs" style={{ color: "var(--dim)" }}>
                      {c.rating} ★ ({c.reviewCount ?? 0})
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => researchWithFilter()} className="ghost-act">
              חפשו שוב עם הטקסט הזה
            </button>
            {siteOnlyTarget && (
              <button type="button" onClick={scanSiteOnly} className="ghost-act">
                סריקת האתר בלבד
              </button>
            )}
          </div>
        </div>
      )}

      {socialHint && (
        <div
          className="mt-5 rounded-2xl border p-4"
          style={{ borderColor: "var(--hair-soft)", background: "var(--surface-1)" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{socialHint.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setInput("");
                nameInputRef.current?.focus();
              }}
              className="pill"
            >
              אכתוב את שם העסק
            </button>
            <button type="button" onClick={scanSiteOnly} className="ghost-act">
              סריקת האתר בלבד
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
