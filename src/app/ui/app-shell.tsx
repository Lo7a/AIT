"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

// מעטפת המערכת למשתמש מחובר: סיידבר בסגנון CRM שנפתח ונסגר. במצב סגור נשארים
// האייקונים (רוחב 74px) - אף פעם לא נעלם לגמרי. הבחירה נשמרת בדפדפן. במובייל
// הסיידבר מוחלף בשורת טאבים אופקית (m-tabs ב-globals).

const RAIL_KEY = "ait-rail";

export type ShellNavKey = "home" | "report" | "interview" | "roadmap";

const NAV_ICONS: Record<ShellNavKey, ReactNode> = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h6" />
    </svg>
  ),
  interview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H4l1.6-3.2A8 8 0 1 1 21 12z" />
    </svg>
  ),
  roadmap: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="5" r="2.2" />
      <path d="M8.2 19H15a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h6.8" />
    </svg>
  ),
};

const NAV_LABEL: Record<ShellNavKey, string> = {
  home: "מרכז העסק",
  report: "הדוח המלא",
  interview: "הראיון",
  roadmap: "תוכנית העבודה",
};

export function AppShell({ active, diagnosisId, userLabel, badge, children }: {
  active: ShellNavKey;
  // בלי אבחון פתוח (מסך הבית לפני בחירת עסק) - הקישורים התלויים באבחון מוסתרים
  diagnosisId?: string;
  // מזהה קצר להצגה בתחתית הסיידבר (אימייל המשתמש או שם העסק)
  userLabel?: string | null;
  // מונה קטן ליד "הראיון" (שאלות פתוחות) - אופציונלי
  badge?: number;
  children: ReactNode;
}) {
  const [mini, setMini] = useState(false);

  useEffect(() => {
    try { setMini(window.localStorage.getItem(RAIL_KEY) === "mini"); } catch { /* אחסון חסום - נשארים פתוחים */ }
  }, []);

  function toggle() {
    setMini((m) => {
      const next = !m;
      try { window.localStorage.setItem(RAIL_KEY, next ? "mini" : "open"); } catch { /* לא קריטי */ }
      return next;
    });
  }

  const items: { key: ShellNavKey; href: string }[] = [
    { key: "home", href: "/" },
    ...(diagnosisId != null
      ? ([
          { key: "report" as const, href: `/report/${diagnosisId}` },
          { key: "interview" as const, href: `/interview/${diagnosisId}` },
          { key: "roadmap" as const, href: `/roadmap/${diagnosisId}` },
        ])
      : []),
  ];

  return (
    <div className="app">
      <aside className={mini ? "side-nav mini" : "side-nav"}>
        <div className="head">
          <span className="brand">
            <span className="brand-mark">AIT</span>
            <span className="brand-txt"><small>יועץ דיגיטלי</small><b>מרכז העסק</b></span>
          </span>
          <button
            type="button"
            className="rail-tgl"
            onClick={toggle}
            aria-label={mini ? "פתיחת התפריט" : "כיווץ התפריט לאייקונים"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" />
            </svg>
          </button>
        </div>

        {items.map(({ key, href }) => (
          <Link
            key={key}
            href={href}
            className={key === active ? "nav-item on" : "nav-item"}
            title={NAV_LABEL[key]}
            aria-current={key === active ? "page" : undefined}
          >
            {NAV_ICONS[key]}
            <span className="lbl">{NAV_LABEL[key]}</span>
            {key === "interview" && badge != null && badge > 0 && (
              <span className="bdg num">{badge}</span>
            )}
          </Link>
        ))}

        {userLabel != null && userLabel !== "" && (
          <div className="foot">
            <span className="avatar">{userLabel.slice(0, 2)}</span>
            <span className="who"><b>{userLabel}</b></span>
          </div>
        )}
      </aside>

      <div className="main-col">
        <nav className="m-tabs" aria-label="ניווט">
          {items.map(({ key, href }) => (
            <Link key={key} href={href} className={key === active ? "m-tab on" : "m-tab"}>
              {NAV_LABEL[key]}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
