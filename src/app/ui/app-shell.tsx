"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// מעטפת המערכת למשתמש מחובר: סיידבר בסגנון CRM שנפתח ונסגר. במצב סגור נשארים
// האייקונים (רוחב 74px) - אף פעם לא נעלם לגמרי. הבחירה נשמרת בדפדפן. במובייל
// הסיידבר מוחלף בשורת טאבים אופקית (m-tabs ב-globals).
//
// שני מדורים באותה מעטפת (20.8): מרכז העסק וניהול. הניהול היה קודם שורת גלולות מעל
// התוכן, וזה שבר את השפה - כל שאר המערכת מנווטת מהסיידבר. מעטפת אחת ולא שתיים, כי
// סיידבר שני היה מתפצל בתחזוקה מהראשון (כלל השימוש החוזר ב-CLAUDE.md).

const RAIL_KEY = "ait-rail";

export type ShellNavKey =
  | "home" | "report" | "interview" | "roadmap" | "newscan"
  | "admin" | "admin_catalog" | "admin_users" | "admin_diagnoses" | "admin_usage" | "admin_activity";

export type ShellSection = "business" | "admin";

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
  newscan: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" /><path d="M11 8.4v5.2M8.4 11h5.2" />
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.2 4.6 6.3v5c0 4.3 3 8.1 7.4 9.5 4.4-1.4 7.4-5.2 7.4-9.5v-5z" />
      <path d="m9.3 11.8 1.9 1.9 3.5-3.6" />
    </svg>
  ),
  admin_catalog: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.4A1.4 1.4 0 0 1 5.4 4h3.2A1.4 1.4 0 0 1 10 5.4v13.2A1.4 1.4 0 0 1 8.6 20H5.4A1.4 1.4 0 0 1 4 18.6z" />
      <path d="M13 5.4A1.4 1.4 0 0 1 14.4 4h1.2A1.4 1.4 0 0 1 17 5.4v13.2A1.4 1.4 0 0 1 15.6 20h-1.2A1.4 1.4 0 0 1 13 18.6z" />
      <path d="m19.2 6.3 1.7 12.1" />
    </svg>
  ),
  admin_users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" /><path d="M3.4 19.4a5.9 5.9 0 0 1 11.2 0" />
      <path d="M16.2 5.3a3.2 3.2 0 0 1 0 5.5M17.6 14.2a5.9 5.9 0 0 1 3 5.2" />
    </svg>
  ),
  admin_diagnoses: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.4 4H6.6A1.6 1.6 0 0 0 5 5.6v13.8A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.6-1.6V5.6A1.6 1.6 0 0 0 17.4 4h-1.8" />
      <path d="M9.2 3h5.6v3H9.2z" /><path d="M8.8 11.4h6.4M8.8 15.4h4.2" />
    </svg>
  ),
  admin_usage: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" /><path d="M7 20v-6M12 20V6M17 20v-9" />
    </svg>
  ),
  admin_activity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" /><path d="M12 7.4V12l3 1.8" />
    </svg>
  ),
};

export const NAV_LABEL: Record<ShellNavKey, string> = {
  home: "מרכז העסק",
  report: "הדוח המלא",
  interview: "הראיון",
  roadmap: "תוכנית העבודה",
  newscan: "אבחון לעסק נוסף",
  admin: "ניהול",
  admin_catalog: "ספריית השירותים",
  admin_users: "משתמשים",
  admin_diagnoses: "אבחונים",
  admin_usage: "שימוש ומגבלות",
  admin_activity: "יומן",
};

// מסכי הניהול. הסדר הוא סדר העבודה: מה קורה עכשיו, מי המשתמשים, מה נסרק, כמה זה עולה,
// ומה קרה. "/admin" נבדק בהתאמה מדויקת - אחרת הוא היה דולק בכל תת-עמוד
export const ADMIN_ITEMS: { key: ShellNavKey; href: string }[] = [
  { key: "admin", href: "/admin" },
  { key: "admin_catalog", href: "/admin/catalog" },
  { key: "admin_users", href: "/admin/users" },
  { key: "admin_diagnoses", href: "/admin/diagnoses" },
  { key: "admin_usage", href: "/admin/usage" },
  { key: "admin_activity", href: "/admin/activity" },
];

export function AppShell({
  active, diagnosisId, userLabel, badge, section = "business", isAdmin = false, children,
}: {
  // במדור הניהול הפריט הפעיל נגזר מהנתיב, ולכן אין צורך להעביר אותו מכל עמוד
  active?: ShellNavKey;
  // בלי אבחון פתוח (מסך הבית לפני בחירת עסק) - הקישורים התלויים באבחון מוסתרים
  diagnosisId?: string;
  // מזהה קצר להצגה בתחתית הסיידבר (אימייל המשתמש או שם העסק)
  userLabel?: string | null;
  // מונה קטן ליד "הראיון" (שאלות פתוחות) - אופציונלי
  badge?: number;
  section?: ShellSection;
  // מציג את הכניסה ל"ניהול" בתחתית הסיידבר. רק אדמין - למשתמש רגיל הקישור לא קיים כלל
  // ולא רק מוסתר, כי הסיידבר מרונדר בצד השרת עם הערך הזה
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const [mini, setMini] = useState(false);
  const pathname = usePathname();

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

  // "אבחון לעסק נוסף" קבוע ולא תלוי באבחון פתוח: סריקת עסק אחר היא פעולה זמינה תמיד,
  // וזו גם נקודת הכניסה העתידית להשוואת מתחרים
  const items: { key: ShellNavKey; href: string }[] =
    section === "admin"
      ? ADMIN_ITEMS
      : [
          { key: "home", href: "/hub" },
          ...(diagnosisId != null
            ? ([
                { key: "report" as const, href: `/report/${diagnosisId}` },
                { key: "interview" as const, href: `/interview/${diagnosisId}` },
                { key: "roadmap" as const, href: `/roadmap/${diagnosisId}` },
              ])
            : []),
          { key: "newscan", href: "/hub#new" },
        ];

  // במדור הניהול הפריט הפעיל נגזר מהנתיב: "/admin" רק בהתאמה מדויקת, השאר לפי קידומת
  const activeKey: ShellNavKey | undefined =
    section === "admin"
      ? ADMIN_ITEMS.filter(({ href }) => (href === "/admin" ? pathname === href : pathname.startsWith(href)))
          .at(-1)?.key
      : active;

  const brandLabel = section === "admin" ? "ניהול" : "מרכז העסק";

  return (
    <div className="app">
      <aside className={mini ? "side-nav mini" : "side-nav"}>
        <div className="head">
          <span className="brand">
            <span className="brand-mark">AIT</span>
            <span className="brand-txt"><small>יועץ דיגיטלי</small><b>{brandLabel}</b></span>
          </span>
        </div>

        {items.map(({ key, href }) => (
          <Link
            key={key}
            href={href}
            className={key === activeKey ? "nav-item on" : "nav-item"}
            title={NAV_LABEL[key]}
            aria-current={key === activeKey ? "page" : undefined}
          >
            {NAV_ICONS[key]}
            <span className="lbl">{NAV_LABEL[key]}</span>
            {key === "interview" && badge != null && badge > 0 && (
              <span className="bdg num">{badge}</span>
            )}
          </Link>
        ))}

        {/* הכניסה לניהול, לאדמין בלבד. יושבת בתחתית ומופרדת בקו - היא לא עוד מסך של
            בעל העסק אלא מעבר למדור אחר, ואותו קו מסמן את זה בלי מילה נוספת */}
        {section === "business" && isAdmin && (
          <Link href="/admin" className="nav-item admin-gate" title={NAV_LABEL.admin}>
            {NAV_ICONS.admin}
            <span className="lbl">{NAV_LABEL.admin}</span>
          </Link>
        )}

        {/* חזרה ממדור הניהול למוצר עצמו - אותו תפקיד בכיוון ההפוך */}
        {section === "admin" && (
          <Link href="/hub" className="nav-item admin-gate" title={NAV_LABEL.home}>
            {NAV_ICONS.home}
            <span className="lbl">{NAV_LABEL.home}</span>
          </Link>
        )}

        {userLabel != null && userLabel !== "" && (
          <div className="foot">
            <span className="avatar">{userLabel.slice(0, 2)}</span>
            <span className="who"><b>{userLabel}</b></span>
          </div>
        )}
      </aside>

      {/* כפתור הכיווץ יושב על קצה הסיידבר וממורכז לגובה (הנחיית מייסד 20.8). הוא אח של
          הסיידבר ולא ילד שלו: ל-.side-nav יש overflow-x:hidden בשביל הגלילה הפנימית,
          וכפתור שחורג מהקצה היה נחתך בדיוק בחצי */}
      <button
        type="button"
        className="rail-tgl"
        onClick={toggle}
        aria-label={mini ? "פתיחת התפריט" : "כיווץ התפריט לאייקונים"}
        aria-expanded={!mini}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="c1" d="m11 17-5-5 5-5" /><path className="c2" d="m18 17-5-5 5-5" />
        </svg>
      </button>

      <div className="main-col">
        <nav className="m-tabs" aria-label="ניווט">
          {items.map(({ key, href }) => (
            <Link key={key} href={href} className={key === activeKey ? "m-tab on" : "m-tab"}>
              {NAV_LABEL[key]}
            </Link>
          ))}
          {section === "business" && isAdmin && (
            <Link href="/admin" className="m-tab">{NAV_LABEL.admin}</Link>
          )}
          {section === "admin" && <Link href="/hub" className="m-tab">{NAV_LABEL.home}</Link>}
        </nav>
        {children}
      </div>
    </div>
  );
}
