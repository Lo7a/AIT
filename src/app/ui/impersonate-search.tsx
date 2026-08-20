"use client";

import { useEffect, useId, useRef, useState } from "react";

// חיפוש משתמש והתחזות, מהסרגל העליון, לאדמין בלבד (בקשת מייסד 20.8).
//
// הרכיב מרונדר רק כשהשרת אמר שהצופה הוא אדמין - הוא לא מסתיר את עצמו בצד לקוח.
// המסלול שמאחוריו בודק את ההרשאה שוב בעצמו, כי לקוח לעולם אינו השער.
//
// ההתחזות עצמה נשלחת כטופס POST רגיל ולא ב-fetch: היא מחליפה עוגייה ואז צריך רענון
// מלא כדי שכל המסכים יטענו מחדש בזהות החדשה. טופס עושה בדיוק את זה בלי קוד.

interface Suggestion {
  id: string;
  email: string | null;
  role: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;

export function ImpersonateSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // מיקום המקלדת ברשימה. -1 = אף הצעה לא נבחרה, והקלדה חוזרת לשם
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }
    // כל הקלדה מבטלת את הבקשה הקודמת: בלי זה תשובה איטית של חיפוש ישן דורסת חדשה
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = (await res.json()) as { users?: Suggestion[] };
        setItems(data.users ?? []);
        setCursor(-1);
      } catch {
        // ביטול או כשל רשת - הרשימה פשוט לא מתעדכנת, בלי הודעת שגיאה על הקלדה
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  // לחיצה מחוץ לרכיב סוגרת. בלי זה הרשימה נשארת פתוחה מעל התוכן
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? items.length - 1 : c - 1));
    } else if (e.key === "Enter" && cursor >= 0) {
      // שליחה של הטופס המתאים - כך אין כפילות בין מקלדת לעכבר
      e.preventDefault();
      const form = boxRef.current?.querySelector<HTMLFormElement>(`form[data-i="${cursor}"]`);
      form?.requestSubmit();
    }
  }

  const term = q.trim();
  const showList = open && term.length >= MIN_CHARS;

  return (
    <div className="imp" ref={boxRef}>
      <label className="sr-only" htmlFor={`${listId}-in`}>חיפוש משתמש להתחזות</label>
      <input
        id={`${listId}-in`}
        type="search"
        className="imp-in"
        placeholder="התחזות: חיפוש משתמש"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        dir="ltr"
      />

      {showList && (
        <div className="imp-pop" id={listId} role="listbox">
          {loading && items.length === 0 && <p className="imp-note">מחפשים...</p>}
          {!loading && items.length === 0 && <p className="imp-note">אין משתמש שמתאים</p>}
          {items.map((u, i) => (
            <form
              key={u.id}
              data-i={i}
              action="/api/admin/impersonate"
              method="post"
              role="option"
              aria-selected={i === cursor}
            >
              <input type="hidden" name="action" value="start" />
              <input type="hidden" name="userId" value={u.id} />
              <button type="submit" className={i === cursor ? "imp-row on" : "imp-row"}>
                <span className="imp-mail" dir="ltr">{u.email ?? "ללא אימייל"}</span>
                {u.role === "admin" && <span className="imp-role">אדמין</span>}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
