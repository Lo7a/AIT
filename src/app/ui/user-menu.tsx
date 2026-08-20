"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// המשתמש המחובר בקצה הסרגל העליון (בקשת מייסד 20.8), ובלחיצה - מה שאפשר לעשות משם.
//
// **התפריט מכיל רק פעולות שקיימות.** "הפרופיל שלי" נשמע טבעי בתפריט כזה ואין לנו מסך
// כזה, ופריט שמוביל לשום מקום הוא בדיוק אותה הבטחה ריקה שאנחנו אוסרים בשאר המוצר.
// כשיהיה מסך פרופיל הוא ייכנס לכאן.
//
// ההתנתקות היא טופס POST ולא קישור: היא משנה מצב בשרת, ו-GET שמנתק אותך הוא בדיוק מה
// שמאפשר לתמונה בדף זר לנתק אותך בלי שנגעת בכלום.

function initials(email: string | null): string {
  if (email == null || email === "") return "??";
  const name = email.split("@")[0] ?? "";
  return (name.slice(0, 2) || "??").toUpperCase();
}

export function UserMenu({ email, isAdmin = false }: { email: string | null; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="umenu" ref={boxRef}>
      <button
        type="button"
        className="umenu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={email ?? "המשתמש המחובר"}
        title={email ?? undefined}
      >
        <span className="avatar" aria-hidden="true">{initials(email)}</span>
      </button>

      {open && (
        <div className="umenu-pop" role="menu">
          <p className="umenu-who">
            <span>מחובר בתור</span>
            <b dir="ltr">{email ?? "משתמש ללא אימייל"}</b>
          </p>
          <Link href="/hub" className="umenu-row" role="menuitem" onClick={() => setOpen(false)}>
            מרכז העסק
          </Link>
          {isAdmin && (
            <Link href="/admin" className="umenu-row" role="menuitem" onClick={() => setOpen(false)}>
              ניהול
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="umenu-row danger" role="menuitem">התנתקות</button>
          </form>
        </div>
      )}
    </div>
  );
}
