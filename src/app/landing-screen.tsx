"use client";
// דף הנחיתה לאנונימיים (הכרעת מייסד 16.8): המבקר מתרשם ממה שהמערכת נותנת, ולחיצה על
// "אבחן את העסק שלי" מובילה לכניסה/הרשמה - הסריקה עצמה תמיד מאחורי התחברות (כל סריקה
// עולה כסף וכל עסק נקשר לבעליו). העיצוב כאן הוא הגרסה הנבחרת (הכרעת מייסד 18.8): כהה
// פרמיום, סגול וברקת, Rubik - נשען על מערכת העיצוב ב-globals.css; הרקע (orbs) והמתג
// כהה/בהיר כבר מגיעים גלובלית מ-layout. אפס מספרים: הצעת הערך מנוסחת בלי אף נתון מומצא,
// ובלי פאנל "נסרקו לאחרונה" - אין לנו נתונים אמיתיים להראות לאנונימי.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stashPendingSearch } from "./landing-logic";

const STEPS: { title: string; body: string }[] = [
  {
    title: "דוח אמת על הנוכחות הדיגיטלית",
    body: "סורקים את האתר, הפרופיל העסקי בגוגל והביקורות. מקבלים תמונה כנה: מה עובד, מה חסר, ומה זה עולה לעסק - וכל מה שלא נבדק מסומן ככזה, בלי ניחושים.",
  },
  {
    title: "ראיון קצר שמדייק את התמונה",
    body: "כמה שאלות ממוקדות על איך העסק באמת עובד - בקצב שלך, עם אפשרות לספר במילים שלך. הדוח מתעדכן אחרי כל תשובה.",
  },
  {
    title: "תוכנית עבודה לפי הצרכים של העסק",
    body: "צעדים מדורגים לפי מה שמשפיע באמת על העסק שלך, עם טווחי מחיר ממקורות גלויים בשוק הישראלי - לא הערכות באוויר.",
  },
];

// חץ הפעולה בעיגול של כפתור הגלולה (בכיוון RTL החץ מצביע שמאלה - קדימה)
function CapArrow() {
  return (
    <span className="cap">
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </span>
  );
}

export function LandingScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // הקלדה היא לא חובה - הכפתור עובד גם ריק; מה שהוקלד נשמר ומחכה אחרי ההתחברות
  function startDiagnosis() {
    stashPendingSearch(window.sessionStorage, query);
    router.push("/login");
  }

  return (
    <>
      {/* ניווט דביק: מותג מימין, כניסה משמאל */}
      <nav className="land-nav">
        <a className="brand" href="/">
          <span className="brand-mark">AIT</span>
          <span className="brand-txt">
            <small>יועץ דיגיטלי לעסקים</small>
            <b>AIT</b>
          </span>
        </a>
        <div className="side">
          <a className="btn-quiet" href="/login">כניסה</a>
        </div>
      </nav>

      <main className="land-wrap">
        {/* הירו בעמודה אחת ממורכזת - טופס החיפוש הוא העוגן, בלי פאנל נתונים מומצאים */}
        <section className="flex flex-col items-center gap-5 pt-16 pb-12 text-center">
          <span className="eyebrow rv d1">
            <span className="pulse" aria-hidden="true" />
            אבחון דיגיטלי לעסקים
          </span>
          <h1 className="hero-h1 rv d2">
            כמה שווה <span className="hl2">הנוכחות הדיגיטלית</span> של העסק שלך?
          </h1>
          <p className="hero-sub rv d3">
            יועץ דיגיטלי לעסקים: סריקה מקיפה, שיחה קצרה על העסק, ותוכנית עבודה
            מסודרת - <b>הכול במקום אחד.</b>
          </p>

          <form
            className="w-full"
            style={{ maxWidth: 640 }}
            onSubmit={(e) => { e.preventDefault(); startDiagnosis(); }}
          >
            <div className="shell rv d4 text-start">
              <div className="core" style={{ padding: 14 }}>
                <label htmlFor="landing-query" className="field-lb">שם העסק או כתובת האתר</label>
                {/* נערם לשתי שורות במובייל (הכלל הקבוע: כל מסך מותאם טלפון) - .fieldrow מטפל בזה */}
                <div className="fieldrow">
                  <span className="field">
                    <svg
                      width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.2-3.2" />
                    </svg>
                    <input
                      id="landing-query"
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="למשל: מסעדת השף חיפה, או www.example.co.il"
                    />
                  </span>
                  <button type="submit" className="btn wide">
                    אבחן את העסק שלי
                    <CapArrow />
                  </button>
                </div>
              </div>
            </div>
            <p className="rv d5" style={{ marginTop: 12, fontSize: 13, color: "var(--mut)" }}>
              האבחון דורש חשבון - נכניס אותך ברגע, בלי סיסמה, והחיפוש שהקלדת מחכה לך בפנים.
            </p>
          </form>
        </section>

        {/* שלושת השלבים - הטקסטים המאושרים כמו שהם */}
        <section className="rv d6 pb-6">
          <div className="how-head"><h2>איך זה עובד</h2></div>
          <ol className="how-grid">
            {STEPS.map((step, i) => (
              <li key={step.title} className="shell">
                <div className="core how-step">
                  <span className="n num">{String(i + 1).padStart(2, "0")}</span>
                  <b>{step.title}</b>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* רצועת סגירה - חוזרת על הכותרת ותת-הכותרת המאושרות, בלי טקסט שיווקי חדש */}
        <section className="py-10">
          <div className="shell">
            <div className="core cta-core">
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 style={{
                  fontSize: "clamp(20px,2.4vw,28px)", lineHeight: 1.35,
                  letterSpacing: "-.01em", maxWidth: "24ch", fontWeight: 800,
                }}>
                  כמה שווה הנוכחות הדיגיטלית של העסק שלך?
                </h2>
                <p style={{ fontSize: 13, color: "var(--mut)", marginTop: 7, maxWidth: "50ch" }}>
                  סריקה מקיפה, שיחה קצרה על העסק, ותוכנית עבודה מסודרת - הכול במקום אחד.
                </p>
              </div>
              <button type="button" className="btn-invert" onClick={startDiagnosis}>
                אבחן את העסק שלי
                <span className="cap">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    <path d="M19 12H5" />
                    <path d="m12 19-7-7 7-7" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
