"use client";
// דף הנחיתה לאנונימיים (הכרעת מייסד 16.8): המבקר מתרשם ממה שהמערכת נותנת, ולחיצה על
// "אבחן את העסק שלי" מובילה לכניסה/הרשמה - הסריקה עצמה תמיד מאחורי התחברות (כל סריקה
// עולה כסף וכל עסק נקשר לבעליו). העיצוב הוא הגרסה הנבחרת (18.8): כהה פרמיום, סגול
// וברקת, Rubik. הירו בשתי עמודות כמו בספק: הטופס מימין, ומשמאל הדמיית תהליך הסריקה
// (הכרעת מייסד: הנחיתה מדמה את התהליך ללקוח) - שלבי הסריקה האמיתיים בלופ, מסומנת
// כהדגמה. אפס מספרים מומצאים: אין ציונים, אין עסקים לדוגמה, אין תוצאות מפוברקות.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

// שלבי ההדגמה = השלבים האמיתיים של צינור הסריקה (Places, ביקורות, crawler, PSI, אותות)
const SIM_STEPS = [
  "מאתרים את הפרופיל העסקי בגוגל",
  "קוראים את הביקורות האחרונות",
  "סורקים את עמודי האתר",
  "מודדים מהירות טעינה במובייל",
  "בודקים ערוצי פנייה ומענה",
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

function CheckIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// הדמיית הסריקה: השלבים נדלקים בזה אחר זה, "הדוח מוכן" בסוף, והלופ מתחיל מחדש.
// מסומנת כהדגמה (כנות לפני רושם); reduced motion = הכל מסומן כהושלם, בלי תנועה.
function ScanSimPanel() {
  const total = SIM_STEPS.length;
  // stage = כמה שלבים הושלמו; מעבר ל-total יש שתי פעימות "מוכן" לפני האיפוס
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(total);
      return;
    }
    const id = window.setInterval(() => {
      setStage((s) => (s >= total + 2 ? 0 : s + 1));
    }, 1100);
    return () => window.clearInterval(id);
  }, [total]);

  const ready = stage >= total;

  return (
    <div className="shell rv d4">
      <div className="core" style={{ padding: "18px 22px 14px" }}>
        <div className="card-title">מה נבדק בסריקה</div>
        <ul>
          {SIM_STEPS.map((label, i) => {
            const cls = i < stage ? "sl done" : i === stage && !ready ? "sl act" : "sl idle-st";
            return (
              <li key={label} className={cls}>
                <span className="st">
                  <span className="idle" aria-hidden="true" />
                  <span className="spin" aria-hidden="true"><i /></span>
                  <span className="chk" aria-hidden="true">
                    <span>
                      <svg
                        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  </span>
                </span>
                <span className="tx"><span className="main-lb">{label}</span></span>
              </li>
            );
          })}
        </ul>
        <div
          className="flex items-center justify-between gap-3"
          style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--hair)" }}
        >
          <span style={{ fontSize: 11.5, color: "var(--dim)" }}>הדגמה - ככה נראית סריקה אמיתית</span>
          <span
            className="live-tag"
            style={{ opacity: ready ? 1 : 0, transition: "opacity .4s var(--ease-out)" }}
            aria-hidden={!ready}
          >
            <span className="dot" aria-hidden="true" />
            הדוח מוכן
          </span>
        </div>
      </div>
    </div>
  );
}

// שתי שאלות אמיתיות מבנק הראיון (questions.ts) - ההדגמה לא ממציאה שאלות או תשובות,
// היא מראה בדיוק את האינטראקציה שקיימת במוצר. picked = הצ'יפ שההדגמה "בוחרת".
const DEMO_QA: { q: string; chips: string[]; picked: number }[] = [
  {
    q: "איך מגיעות אליכם פניות חדשות (טלפון, וואטסאפ, פייסבוק), ומי מטפל בהן?",
    chips: ["בעיקר טלפון", "וואטסאפ", "טופס באתר", "פייסבוק/אינסטגרם"],
    picked: 1,
  },
  {
    q: "קורה שפנייה הולכת לאיבוד או נענית באיחור? איפה זה קורה הכי הרבה?",
    chips: [
      "כן, קורה שפנייה מתפספסת",
      "עונים באיחור לפעמים, אבל בסוף מטפלים בהכל",
      "בעיקר מחוץ לשעות הפעילות",
      "לא, אנחנו עונים כמעט תמיד מיד",
    ],
    picked: 2,
  },
];

// רגע היועץ: הישות הזוהרת + חלון שיחה שמדגים את הראיון החי. מכונת פאזות פשוטה -
// הקלדה, שאלה, צ'יפים, בחירה, תשובה, "הדוח התעדכן" - ואז השאלה הבאה, בלופ.
// reduced motion = מצב סופי סטטי של השאלה הראשונה.
function AdvisorDemo() {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const CYCLE = 7; // פאזות 0-5 + פעימת החזקה לפני איפוס
  const qi = reduced ? 0 : Math.floor(tick / CYCLE) % DEMO_QA.length;
  const phase = reduced ? 5 : tick % CYCLE;
  const qa = DEMO_QA[qi];

  return (
    <section className="advisor-sec rv d5">
      <div>
        <div className="sec-label" style={{ marginBottom: 14 }}>הראיון</div>
        <h2 style={{ fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.3, letterSpacing: "-.012em" }}>
          ראיון קצר שמדייק את התמונה
        </h2>
        <p style={{ fontSize: 14, color: "var(--mut)", marginTop: 10, maxWidth: "46ch" }}>
          {STEPS[1].body}
        </p>
        <div className="orb-being" style={{ marginTop: 34 }} aria-hidden="true">
          <span className="orb-halo" />
          <span className="orb-ring" />
          <span className="orb-ring b" />
          <span className="orb-core" />
        </div>
        <p className="orb-cap">היועץ הדיגיטלי של AIT</p>
      </div>

      <div className="shell">
        <div className="core chat-demo" key={qi}>
          <div className="cd-ai-row">
            <span className="cd-mini-orb" aria-hidden="true" />
            <div className="cd-msg ai show">
              {phase < 1
                ? <span className="cd-typing" aria-label="היועץ מקליד"><i /><i /><i /></span>
                : qa.q}
            </div>
          </div>
          <div className={phase >= 2 ? "cd-chips show" : "cd-chips"}>
            {qa.chips.map((chip, i) => (
              <span key={chip} className={phase >= 3 && i === qa.picked ? "cd-chip picked" : "cd-chip"}>
                {chip}
              </span>
            ))}
          </div>
          <div className={phase >= 4 ? "cd-msg user show" : "cd-msg user"}>
            {qa.chips[qa.picked]}
          </div>
          <div className={phase >= 5 ? "cd-update show" : "cd-update"}>
            <span className="live-tag">
              <span className="dot" aria-hidden="true" />
              הדוח התעדכן
            </span>
          </div>
          <div className="cd-note">הדגמה - השאלות מגיעות מהראיון האמיתי של המערכת</div>
        </div>
      </div>
    </section>
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
        {/* הירו בשתי עמודות: הטופס הוא העוגן, לצדו הדמיית התהליך */}
        <section className="hero-grid">
          <div>
            <span className="eyebrow rv d1">
              <span className="pulse" aria-hidden="true" />
              אבחון דיגיטלי לעסקים
            </span>
            <h1 className="hero-h1 rv d2" style={{ margin: "20px 0 14px" }}>
              כמה שווה <span className="hl2">הנוכחות הדיגיטלית</span> של העסק שלך?
            </h1>
            <p className="hero-sub rv d3" style={{ marginBottom: 26 }}>
              יועץ דיגיטלי לעסקים: סריקה מקיפה, שיחה קצרה על העסק, ותוכנית עבודה
              מסודרת - <b>הכול במקום אחד.</b>
            </p>

            <form onSubmit={(e) => { e.preventDefault(); startDiagnosis(); }}>
              <div className="shell rv d4">
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
                  {/* שורת האמון מהספק - הטענות מגובות במוצר: האבחון הראשוני לא עולה כסף,
                      אין התחייבות, והסריקה אורכת בערך דקה (כמו בתיאור המערכת) */}
                  <div className="trust" style={{ marginTop: 13 }}>
                    <span><CheckIcon />אבחון ראשוני חינם</span>
                    <span><CheckIcon />בלי התחייבות</span>
                    <span>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 7.5V12l3 2" />
                      </svg>
                      תוך דקה
                    </span>
                  </div>
                </div>
              </div>
              <p className="rv d5" style={{ marginTop: 12, fontSize: 13, color: "var(--mut)" }}>
                האבחון דורש חשבון - נכניס אותך ברגע, בלי סיסמה, והחיפוש שהקלדת מחכה לך בפנים.
              </p>
            </form>
          </div>

          <ScanSimPanel />
        </section>

        {/* רגע היועץ: הדגמת השיחה החיה */}
        <AdvisorDemo />

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
