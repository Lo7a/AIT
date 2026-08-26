"use client";
// דף הנחיתה לאנונימיים (הכרעת מייסד 16.8): המבקר מתרשם ממה שהמערכת נותנת, ולחיצה על
// "אבחן את העסק שלי" מובילה לכניסה/הרשמה - הסריקה עצמה תמיד מאחורי התחברות (כל סריקה
// עולה כסף וכל עסק נקשר לבעליו). העיצוב הוא הגרסה הנבחרת (18.8): כהה פרמיום, סגול
// וברקת, Rubik.
//
// המבנה: הדף בנוי כטיעון ולא כסיור במוצר - קודם הוא מזהה את עצמו (המצב היום), אז
// מבין איך זה עובד (מסלול השלבים עם תצוגה חיה לכל שלב), אז יודע מה יקבל (תוכן
// העניינים), אז למה לסמוך (כל טענה לצד חתיכה אמיתית מהמוצר), ואז נתונים ומי אנחנו.
//
// קנה המידה: הוקטן פעמיים ואז הורחב חזרה - התלונה על "הכל ענקי" נבעה מזום בדפדפן
// ולא מהדף עצמו. הרוחב נדיב בכוונה; אל תקטין אותו בלי שנמדד על מסך בזום 100 אחוז.
//
// מספרים: כל מספר בסקשן הנתונים מגיע ממדידה שלנו או ממקור חיצוני נקוב שמופיע לצדו.
// הדוח לדוגמה הוא החריג המתועד ב-CLAUDE.md, וגם בו רק העסק והציונים בדויים.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { stashPendingSearch } from "./landing-logic";
import { AnswerOptions } from "./ui/answer-options";
import { CountUp } from "./ui/motion";
import { BrandFace, BrandName } from "./ui/brand";

const STEPS: { title: string; body: string }[] = [
  {
    title: "דוח אמת על הנוכחות הדיגיטלית",
    body: "סורקים את האתר, את הפרופיל בגוגל ואת הביקורות, ואומרים בכנות מה עובד, מה חסר ומה זה עולה לך. מה שלא נבדק - מסומן שלא נבדק.",
  },
  {
    title: "ראיון קצר שמדייק את התמונה",
    body: "כמה שאלות על איך העסק עובד באמת, בקצב שלך ובמילים שלך. הדוח מתעדכן אחרי כל תשובה.",
  },
  {
    title: "תוכנית עבודה לפי הצרכים של העסק",
    body: "מה עושים קודם ומה אחר כך, עם טווחי מחיר אמיתיים מהשוק הישראלי - לא הערכות באוויר.",
  },
];

// שלבי ההדגמה = הבדיקות האמיתיות של צינור הסריקה (Places, ביקורות, crawler, PSI,
// אותות, ניקוד, נרטיב). בלי שורות תוצאה - תוצאה בהדגמה היא מספר מומצא
const SCAN_CHECKS = [
  "מאתרים את הפרופיל העסקי בגוגל",
  "קוראים את הביקורות האחרונות",
  "סורקים את עמודי האתר",
  "מודדים מהירות טעינה במובייל",
  "בודקים ערוצי פנייה ומענה",
  "מחשבים ציונים ומודל עסק",
  "כותבים את הדוח",
];

// ===== דוח לדוגמה =====
// החריג המתועד ב-CLAUDE.md (הכרעת מייסד 18.8): דף השיווק רשאי להציג דוח עם נתוני עסק
// בדויים, בתנאי ששם העסק מכריז שהוא בדוי, שתגית "דוגמה" היא חלק מהרכיב, שהרכיב לא
// מרונדר בשום מסך אבחון אמיתי, ושכל מה שאפשר לקחת מהמוצר האמיתי נלקח משם.
// בהתאם: כל שורות הממצא, הצעדים והתובנה למטה הן המחרוזות האמיתיות מהקוד
// (score/dimensions.ts, roadmap/insights.ts, roadmap/quick-wins.ts), וטווח המחיר הוא
// הטווח הנחקר מהקטלוג (prisma/seed.ts). מה שבדוי הוא רק העסק והציונים שלו.
const SAMPLE_BUSINESS = { name: "מספרה לדוגמה", meta: "תל אביב · נתוני הדגמה" };

const SAMPLE_DIMENSIONS: { lb: string; sc: number | null }[] = [
  { lb: "נגישות ללקוח", sc: 55 },
  { lb: "נראות דיגיטלית", sc: 72 },
  { lb: "מוניטין וביקורות", sc: 91 },
  { lb: "תשתית דיגיטלית", sc: 40 },
  // ממד בלי מספיק מידע נשאר בלי ציון גם בהדגמה - זה בדיוק מה שהדוגמה אמורה להראות
  { lb: "בשלות תהליכים", sc: null },
];

// מקטעי הדוח האמיתיים בשמות שהמסך באמת מציג, כל אחד עם שורה אמיתית מתוך המוצר
const REPORT_SECTIONS: { id: string; label: string; tone: "acc" | "bad" | "good"; lines: string[] }[] = [
  {
    id: "insights", label: "מה הבנתי על העסק שלך", tone: "acc",
    lines: ["לעסק יש דלת אחת בלבד, והיא הטלפון", "הלקוחות מרוצים, וכמעט אף אחד לא רואה את זה"],
  },
  {
    id: "highlights", label: "עיקרי הדוח", tone: "bad",
    lines: ["אין קביעת תור אונליין, כל תיאום דורש טלפון בשעות הפעילות"],
  },
  {
    id: "gaps", label: "הפערים המובילים", tone: "bad",
    lines: ["אין קישור וואטסאפ באתר, הערוץ שלקוחות ישראלים מצפים לו", "אין Google Analytics, העסק עיוור לתנועה באתר שלו"],
  },
  {
    id: "wins", label: "מה אפשר לעשות כבר עכשיו", tone: "good",
    lines: ["להוסיף כפתור וואטסאפ לאתר", "לבקש ביקורות מלקוחות מרוצים"],
  },
];

// פריטים אמיתיים מהקטלוג (prisma/seed.ts). מוצגים בלי מחיר: טווח מחיר מוצג רק בתוכנית
// אמיתית של עסק אמיתי, מתוך הקטלוג
const PLAN_EXAMPLES = [
  "קביעת תורים אונליין",
  "חיבור וואטסאפ לאתר",
  "התקנת מדידה (Analytics + פיקסל)",
];

const STAGE_MS = 6000;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// חץ הפעולה בעיגול של כפתור הגלולה (בכיוון RTL החץ מצביע שמאלה - קדימה)
function CapArrow({ size = 14 }: { size?: number }) {
  return (
    <span className="cap">
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </span>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// "נכנס למסך": בסיס אחד לכל מה שמתעורר בגלילה - החשיפה, ציור הפסים, ספירת המספר
// וההדגמות המתמשכות.
// once=true (ברירת המחדל): נדלק פעם אחת ולא כבה - זה מה שחשיפה בגלילה צריכה.
// once=false: עוקב אחרי הנראות בפועל, וגם אחרי לשונית שירדה לרקע. ההרחבה הזאת נוספה
// אחרי מדידה שהראתה שההדגמות ממשיכות לרוץ בעלות מלאה גם כשהן מחוץ למסך לגמרי (18.8)
function useInView<T extends HTMLElement>(once = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el == null) return;
    if (once && prefersReducedMotion()) {
      setInView(true);
      return;
    }
    let onScreen = false;
    const apply = () => setInView(onScreen && !document.hidden);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (once) {
          if (!onScreen) return;
          setInView(true);
          observer.disconnect();
          return;
        }
        apply();
      },
      { rootMargin: once ? "0px 0px -10% 0px" : "160px" },
    );
    observer.observe(el);
    if (once) return () => observer.disconnect();

    document.addEventListener("visibilitychange", apply);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [once]);

  return [ref, inView];
}

// חשיפה בגלילה: מה שנמצא מתחת לקיפול עולה כשמגיעים אליו, פעם אחת
function Reveal({
  children, delay = 0, className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, shown] = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(18px)",
        filter: shown ? "none" : "blur(6px)",
        transition: "opacity .8s var(--ease-out), transform .8s var(--ease-out), filter .8s var(--ease-out)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// עומק בגלילה: האלמנט זז מעט לאט יותר מהעמוד. עדין בכוונה - פרלקס חזק נראה זול,
// והמטרה כאן היא שירגישו שיש שכבות, לא שיראו את האפקט
function Parallax({ children, strength = 20 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (el == null || prefersReducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // מיקום מרכז האלמנט ביחס למרכז המסך, מנורמל ל-1- עד 1
      const p = (rect.top + rect.height / 2 - vh / 2) / vh;
      setY(Math.max(-1, Math.min(1, p)) * strength);
    };
    const onScroll = () => { if (raf === 0) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [strength]);

  return (
    <div ref={ref} style={{ transform: `translate3d(0,${y}px,0)`, willChange: "transform" }}>
      {children}
    </div>
  );
}

// הטיה תלת-ממדית קלה בעקבות הסמן, עד ארבע מעלות. מספיק כדי שירגיש חומר, לא מספיק
// כדי להיראות גימיק. רק עם עכבר אמיתי - במגע זה היה נתקע במצב מוטה
function Tilt({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0 });

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const el = ref.current;
    if (el == null) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    setRot({ x: -dy * max * 2, y: dx * max * 2 });
  }

  return (
    <div style={{ perspective: 1100 }}>
      <div
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={() => setRot({ x: 0, y: 0 })}
        style={{
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
          transition: "transform .45s var(--ease-out)",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// מסוף הסריקה - פריסה 1 מהמפרט: סרגל כתובת, פס התקדמות ורשימת הבדיקות שנדלקות
// אחת אחרי השנייה. שורות הבדיקה משתמשות באותן מחלקות .sl של מסך הסריקה האמיתי
function ScanTerminal() {
  const total = SCAN_CHECKS.length;
  // stage = כמה בדיקות הושלמו; אחרי הסיום יש שתי פעימות החזקה לפני האיפוס
  const [stage, setStage] = useState(0);
  // ההדגמה רצה רק כשרואים אותה. בלי זה היא ממשיכה לעלות מעבד גם בתחתית העמוד
  const [liveRef, live] = useInView<HTMLDivElement>(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setStage(total);
      return;
    }
    if (!live) return;
    const id = window.setInterval(() => {
      setStage((s) => (s >= total + 2 ? 0 : s + 1));
    }, 900);
    return () => window.clearInterval(id);
  }, [total, live]);

  const done = Math.min(stage, total);
  const ready = stage >= total;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="scan-peek">
      {/* הדמות בפינה השמאלית-עליונה של החלון, מהופכת - פונה ימינה אל התוכן */}
      <img src="/brand/inspecting.webp" alt="" aria-hidden="true" className="scan-buddy" />
    <div className="shell term rv d4" ref={liveRef}>
      <div className="core">
        {/* בלי שלוש נקודות הצבע של חלון - קישוט טהור שרק מוסיף רעש לסרגל */}
        <div className="term-bar">
          <span className="addr" dir="ltr">bedek-esek.scan</span>
          <span className="pct num">{pct}%</span>
        </div>
        <div className="pbar" aria-hidden="true">
          <i style={{ transform: `scaleX(${done / total})` }} />
        </div>

        <div className="term-body">
          {!ready && <span className="term-beam" aria-hidden="true" />}
          <ul>
            {SCAN_CHECKS.map((label, i) => {
              const cls = i < stage ? "sl done" : i === stage && !ready ? "sl act" : "sl idle-st";
              return (
                <li key={label} className={cls}>
                  <span className="st">
                    <span className="idle" aria-hidden="true" />
                    <span className="spin" aria-hidden="true"><i /></span>
                    <span className="chk" aria-hidden="true">
                      <span><CheckIcon size={11} /></span>
                    </span>
                  </span>
                  <span className="tx">
                    <span className="main-lb">
                      {label}
                      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="term-foot">
          <span>{total} בדיקות · גוגל, האתר, PageSpeed</span>
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
    </div>
  );
}

// תצוגת הדוח: המבנה האמיתי (פריסה 3 - עמודת זהות דביקה + עמודת תוכן) עם שורת
// ניווט העוגן שעוברת בין המקטעים. זו הדגמת מבנה וניווט, לכן אין בה נתונים
// enabled מגיע ממסלול השלבים: הפאנלים חיים תמיד בשביל הגובה הקבוע, אבל טיימר של
// פאנל מוסתר לא רץ - בלי זה שלוש ההדגמות היו מתקתקות לנצח מאחורי opacity:0
function ReportPreview({ enabled = true }: { enabled?: boolean }) {
  const [active, setActive] = useState(0);
  const [liveRef, live] = useInView<HTMLDivElement>(false);

  useEffect(() => {
    if (prefersReducedMotion() || !live || !enabled) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % REPORT_SECTIONS.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, [live, enabled]);

  return (
    <div ref={liveRef}>
      <nav className="anch mini" aria-label="מקטעי הדוח">
        {REPORT_SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={i === active ? "on" : undefined}
            aria-pressed={i === active}
            onClick={() => setActive(i)}
          >
            <span className="n num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="repC mini sample">
        {/* התגית היא חלק מהרכיב ולא פרופ - אי אפשר לכבות אותה בטעות */}
        <span className="demo-flag" aria-label="דוח לדוגמה">דוגמה</span>

        <div className="rep-side">
          <div className="shell">
            <div className="core">
              <div className="who-h">
                <b>{SAMPLE_BUSINESS.name}</b>
                <i>{SAMPLE_BUSINESS.meta}</i>
              </div>
              <div className="samp-score">
                <span className="v num">68</span>
                <span className="of num">/ 100</span>
              </div>
              <div className="mini-meta">
                <span><b className="num">64</b> ביקורות</span>
                <span>דירוג <b className="num">4.8</b></span>
              </div>
            </div>
          </div>
          <div className="shell">
            <div className="core">
              <div className="side-h4">ציון לפי תחומים</div>
              {SAMPLE_DIMENSIONS.map((d) => (
                <div key={d.lb} className="dim-row">
                  <span className="lb">{d.lb}</span>
                  {d.sc == null ? (
                    <span className="sc na">לא נבדק</span>
                  ) : (
                    <>
                      <span className="fill-bar" aria-hidden="true">
                        <i style={{ width: `${d.sc}%`, transform: "scaleX(1)" }} />
                      </span>
                      <span className="sc num">{d.sc}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rep-main">
          {REPORT_SECTIONS.map((s, i) => (
            <div key={s.id} className="shell">
              <div className={i === active ? "core on" : "core"}>
                <div className="mini-h">
                  <span className={s.tone === "acc" ? "ic" : `ic ${s.tone}`} aria-hidden="true">
                    <CheckIcon size={10} />
                  </span>
                  {s.label}
                </div>
                {s.lines.map((line) => (
                  <p key={line} className="samp-line">{line}</p>
                ))}
                {s.id === "wins" && i === active && (
                  <p className="samp-line src-line">
                    ובתוכנית: קביעת תורים אונליין, <b>₪100-500 לחודש</b>
                    <span> (טווח מהקטלוג הנחקר, לא מספר לדוגמה)</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="demo-note">
        דוח לדוגמה. העסק והציונים בדויים; ניסוחי הממצאים, הצעדים וטווח המחיר לקוחים
        מהמוצר עצמו.
      </p>
    </div>
  );
}

// שתי שאלות אמיתיות מבנק הראיון (questions.ts) - ההדגמה לא ממציאה שאלות או תשובות,
// היא מראה בדיוק את האינטראקציה שקיימת במוצר. picked = הצ'יפ שההדגמה "בוחרת"
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

// הראיון: הישות הזוהרת + חלון שיחה חי. מכונת פאזות פשוטה - הקלדה, שאלה, צ'יפים,
// בחירה, תשובה, "הדוח התעדכן" - ואז השאלה הבאה, בלופ
function InterviewPreview({ enabled = true }: { enabled?: boolean }) {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [liveRef, live] = useInView<HTMLDivElement>(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true);
      return;
    }
    if (!live || !enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [live, enabled]);

  const CYCLE = 7; // פאזות 0-5 + פעימת החזקה לפני איפוס
  const qi = reduced ? 0 : Math.floor(tick / CYCLE) % DEMO_QA.length;
  const phase = reduced ? 5 : tick % CYCLE;
  const qa = DEMO_QA[qi];

  return (
    <div ref={liveRef}>
      <div className="flex items-center gap-4">
        {/* הפנים של הדמות במקום האורב הגנרי (מייסד 26.8) - היועץ הוא מישהו */}
        <BrandFace size={64} />
        <div>
          <b className="block text-sm font-bold">היועץ הדיגיטלי של בדק עסק</b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            הראיון הוא בחירה שלך, לא שלב חובה
          </span>
        </div>
      </div>

      <div className="chat-demo" key={qi} style={{ padding: "14px 0 0", minHeight: 232 }}>
        <div className="cd-ai-row">
          <span className="cd-mini-orb" aria-hidden="true" />
          <div className="cd-msg ai show">
            {phase < 1
              ? <span className="cd-typing" aria-label="היועץ מקליד"><i /><i /><i /></span>
              : qa.q}
          </div>
        </div>
        {/* אותה תיבת תשובות של הראיון האמיתי (ui/answer-options.tsx), בגרסה מוקטנת ובלי
            handlers - מה שרואים כאן הוא בדיוק מה שמקבלים בפנים */}
        <div className={phase >= 2 ? "cd-ans show" : "cd-ans"}>
          <AnswerOptions
            compact
            options={qa.chips}
            selected={phase >= 3 ? [qa.chips[qa.picked]] : []}
          />
        </div>
        <div className={phase >= 5 ? "cd-update show" : "cd-update"}>
          <span className="live-tag">
            <span className="dot" aria-hidden="true" />
            הדוח התעדכן
          </span>
        </div>
      </div>

      <p className="demo-note">הדגמה - השאלות מגיעות מהראיון האמיתי של המערכת</p>
    </div>
  );
}

// תוכנית העבודה: מבנה הכרטיס כמו במסך האמיתי, עם פריטים מהקטלוג ובלי מחירים.
// טווח מחיר נקוב שייך לתוכנית של עסק אמיתי, מתוך הקטלוג הנחקר
// enabled מתקבל לאחידות החתימה מול שני האחים; אין כאן טיימר שצריך לעצור
function PlanPreview(_props: { enabled?: boolean }) {
  return (
    <>
      <div className="mini-h" style={{ fontSize: 10.5 }}>
        <span className="ic" aria-hidden="true"><CheckIcon size={10} /></span>
        תוכנית העבודה
      </div>
      {PLAN_EXAMPLES.map((title, i) => (
        <div key={title} className="plan-row">
          <span className="n num" aria-hidden="true">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <b>{title}</b>
            <div className="meta">
              <span>למה זה עכשיו</span>
              <span>טווח מחיר ממקור גלוי</span>
              <span>מה זה משנה לעסק</span>
            </div>
          </div>
        </div>
      ))}
      <p className="demo-note">
        הדגמה - הצעדים והסדר שלהם נקבעים לפי הממצאים של העסק שלך, מתוך קטלוג נחקר עם מקורות
      </p>
    </>
  );
}

// המצב היום: הרגע שבו בעל העסק מזהה את עצמו, לפני שמראים לו מכונה. שלוש אמירות מצב
// בלי מספרים ובלי הבטחות - אלה לא ציטוטים של לקוחות אמיתיים ולא מוצגים ככאלה.
// המילה המודגשת בכל שורה היא הנקודה שהמוצר נוגע בה
// דוגמאות החיפוש שבצ'יפים - סוג עסק ועיר, לא עסקים אמיתיים, כמו בפלייסהולדר המקורי
const SEARCH_EXAMPLES = ["מסעדת השף חיפה", "מספרה ברמת גן", "מוסך בבאר שבע"];

// נוסח מדובר (הנחיית מייסד 26.8): משפטים קצרים שבעל עסק היה אומר בעצמו,
// לא עברית של מכונה. מקצועי אבל קליל
const SITUATION: { before: string; hl: string; after: string }[] = [
  { before: "פניות נכנסות מהטלפון, מוואטסאפ ומאינסטגרם - ", hl: "מה שלא נענה בזמן, הולך למתחרה", after: "." },
  { before: "כל שבוע מוכרים לך משהו חדש. ", hl: "בלי בדיקה, איך תדע מה באמת חסר?", after: "" },
  { before: "אתה משלם על אתר ועל פרסום, ", hl: "בלי לדעת מה מהם באמת מכניס", after: "." },
];

// שלושת המצבים שממצא יכול להיות בהם. המצב השלישי הוא כל ההבדל: "לא נבדק" הוא לא פער
const FINDING_STATES: { t: string; s: "ok" | "no" | "un" }[] = [
  { t: "וואטסאפ זמין באתר", s: "ok" },
  { t: "אין קישור וואטסאפ באתר", s: "no" },
  { t: "האתר בנוי בצד הלקוח, לא הצלחנו לקרוא את הסימנים", s: "un" },
];

// סימוני המצב בתוך חתיכות המוצר
function StateDot({ s }: { s: "ok" | "no" | "un" }) {
  return (
    <span className={`art-dot ${s}`} aria-hidden="true">
      {s === "ok" && <CheckIcon size={10} />}
      {s === "no" && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      )}
      {s === "un" && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M12 8v1M12 15v1" />
        </svg>
      )}
    </span>
  );
}

// משקלי הממדים במנוע הניקוד (score/dimensions.ts) - סכום 100 אחוז
const WEIGHTS = [
  { t: "נגישות ללקוח", w: 25, c: "var(--acc-rgb)", a: 1 },
  { t: "נראות דיגיטלית", w: 20, c: "var(--acc-rgb)", a: 0.72 },
  { t: "מוניטין וביקורות", w: 20, c: "var(--acc2-rgb)", a: 0.62 },
  { t: "בשלות תהליכים", w: 20, c: "var(--acc2-rgb)", a: 0.9 },
  { t: "תשתית דיגיטלית", w: 15, c: "var(--acc-rgb)", a: 0.42 },
];

// המספר נספר כשהוא מגיע למסך. CountUp הקיים (ui/motion.tsx) הורחב לתמוך בשבר עשרוני
function SearchShare() {
  const [ref, inView] = useInView<HTMLParagraphElement>();
  return (
    <p ref={ref} className="bigstat num" style={{ marginTop: 18 }}>
      {inView ? <CountUp to={98.17} decimals={2} duration={1600} /> : "0.00"}
      <small>%</small>
    </p>
  );
}

// רצועת ההוכחות (קיצור מייסד 26.8): טענה אחת + חתיכת מוצר אמיתית בכל כרטיס, בלי
// פסקאות. ירשה ארבעה סקשנים טקסטואליים: מה יש בדוח, איך אנחנו עובדים, נתונים ומי אנחנו
function ProofSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>למה אפשר לסמוך על זה</h2></div>
      </Reveal>
      <Reveal delay={50}>
        <p className="proof-say">
          בנינו את בדק עסק כי בעל עסק מקבל הצעות לפני שמישהו בדק מה באמת חסר לו.
          אז קודם בודקים - <em>ובשקיפות מלאה:</em>
        </p>
      </Reveal>
      <Reveal delay={110}>
        <div className="proof-grid">

          <div className="shell">
            <div className="core card-pad">
              <p className="data-t">מה שלא נבדק - כתוב שלא נבדק</p>
              <div className="art" style={{ marginTop: 12 }}>
                <div className="art-h">
                  <span>ממצא באתר</span>
                  <span>מצב</span>
                </div>
                {FINDING_STATES.map((f) => (
                  <div key={f.t} className={f.s === "un" ? "art-row un" : "art-row"}>
                    <StateDot s={f.s} />
                    <span className="g">{f.t}</span>
                    {f.s === "un" && <span className="chip">לא נבדק</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="shell">
            <div className="core card-pad">
              <p className="data-t">הציון בנוי ממשקלים גלויים</p>
              {/* הצבעים הם דרגות של שני צבעי המותג, לא חמישה צבעים חדשים */}
              <div className="wstack" style={{ marginTop: 16 }} aria-hidden="true">
                {WEIGHTS.map((w) => (
                  <i key={w.t} style={{ flex: w.w, background: `rgba(${w.c}, ${w.a})` }} />
                ))}
              </div>
              <div className="wlegend">
                {WEIGHTS.map((w) => (
                  <span key={w.t}>
                    <i style={{ background: `rgba(${w.c}, ${w.a})` }} aria-hidden="true" />
                    {w.t} <b className="num">{w.w}%</b>
                  </span>
                ))}
              </div>
              <p className="src">משקלי הממדים במנוע הניקוד של בדק עסק.</p>
            </div>
          </div>

          <div className="shell">
            <div className="core card-pad">
              <p className="data-t">כמעט כל חיפוש בישראל עובר בגוגל</p>
              <SearchShare />
              <p className="src">Statcounter, יולי 2026. לכן הפרופיל בגוגל הוא הדבר הראשון שהסריקה בודקת.</p>
            </div>
          </div>

        </div>
      </Reveal>
    </section>
  );
}

// מסלול השלבים: לחיצה בוחרת שלב, ובלי לחיצה הוא מתקדם לבד. כל שלב מציג תצוגה חיה
// משלו במקום להסתפק בטקסט
function StageWalk() {
  const [stage, setStage] = useState(0);
  const [auto, setAuto] = useState(true);
  // עצירה כשהעכבר על התצוגה: לא מחליפים שלב מתחת לידיים של מי שקורא
  const [paused, setPaused] = useState(false);
  const [liveRef, live] = useInView<HTMLDivElement>(false);
  const running = auto && !paused && live;

  useEffect(() => {
    if (!running) return;
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % STEPS.length);
    }, STAGE_MS);
    return () => window.clearInterval(id);
  }, [running]);

  function pick(i: number) {
    setStage(i);
    setAuto(false); // המשתמש לקח שליטה - לא נמשוך לו את המסך מתחת לאצבע
  }

  return (
    <div
      ref={liveRef}
      className="stage-wrap"
      data-paused={paused ? "true" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* כל טאב שולט בפאנל שלו עצמו דרך מזהה יציב - לא במזהה נודד של הפאנל הפעיל
          (ממצא סקירה 26.8: הקישור הקודם שייך כל טאב לפאנל של מישהו אחר) */}
      {/* הכרטיסיות קודמות ב-DOM (סדר קריאה ומקלדת נכון במובייל, שם הן גם מעל);
          הפריסה בדסקטופ נקבעת ב-grid-template-areas ולא בסדר האלמנטים */}
      <div className="stage-list" role="tablist" aria-label="שלבי התהליך" aria-orientation="horizontal">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            type="button"
            role="tab"
            id={`stage-tab-${i}`}
            aria-selected={i === stage}
            aria-controls={`stage-panel-${i}`}
            className={i === stage ? "stage-btn on" : "stage-btn"}
            onClick={() => pick(i)}
          >
            <span className="n num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <b>{step.title}</b>
              <span className="sd">{step.body}</span>
            </span>
            {auto && i === stage && <span className="tick" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {/* התצוגה: הדמות מימין מצביעה על הפאנל. שלושת הפאנלים חיים תמיד בערימת גריד
          (גובה קבוע, אפס קפיצות); inert חוסם פוקוס לפאנל שקוף, enabled עוצר טיימרים */}
      <div className="stage-show">
        {/* בלי תנועה על הדמות כאן - מייסד 26.8: "זה סתם מציק" */}
        <img src="/brand/pointing-full.webp" alt="" aria-hidden="true" className="stage-guide" />
        <div className="stage-panel">
          {[ReportPreview, InterviewPreview, PlanPreview].map((Preview, i) => (
            <div
              key={i}
              className={i === stage ? "shell stage-card on" : "shell stage-card"}
              id={`stage-panel-${i}`}
              role="tabpanel"
              aria-labelledby={`stage-tab-${i}`}
              aria-hidden={i !== stage}
              {...(i !== stage ? { inert: true } : {})}
            >
              <div className="core" style={{ padding: "20px 20px 17px" }}>
                <Preview enabled={i === stage} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// הניווט מקבל זכוכית וקו רק אחרי שהעמוד זז, ומחזיק קו התקדמות קריאה.
//
// שני דברים כאן נעשים בכוונה ולא בדרך הקצרה, אחרי מדידה (18.8): ההתקדמות נכתבת ישירות
// על ה-DOM דרך ref ולא דרך state, כי state בכל פריים גלילה גרם לרינדור מחדש של כל
// העמוד (נמדד: 1.05 קומיטים של React לכל פריים, כ-6ms בטלפון) רק כדי להזיז פס של
// שני פיקסלים. וגובה המסמך נמדד בטעינה ובשינוי גודל בלבד, כי קריאה שלו בכל פריים
// כופה חישוב פריסה. scrolled כן נשאר ב-state - הוא בוליאני שמתהפך פעם אחת, ו-React
// לא מרנדר מחדש כשמציבים בו את אותו ערך
function useScrolled(progressRef: React.RefObject<HTMLSpanElement | null>, threshold = 12): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    let max = 0;
    const measure = () => { max = document.documentElement.scrollHeight - window.innerHeight; };
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > threshold);
      const el = progressRef.current;
      if (el != null) el.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    };
    const onScroll = () => { if (raf === 0) raf = requestAnimationFrame(update); };
    const onResize = () => { measure(); onScroll(); };
    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [threshold, progressRef]);

  return scrolled;
}

export function LandingScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const progressRef = useRef<HTMLSpanElement>(null);
  const scrolled = useScrolled(progressRef);

  // הקלדה היא לא חובה - הכפתור עובד גם ריק; מה שהוקלד נשמר ומחכה אחרי ההתחברות
  function startDiagnosis() {
    stashPendingSearch(window.sessionStorage, query);
    router.push("/login");
  }

  return (
    <>
      {/* ניווט דביק: מותג מימין, כניסה משמאל */}
      <nav className={scrolled ? "land-nav on" : "land-nav"}>
        <a className="brand" href="/">
          <BrandFace />
          <span className="brand-txt">
            <small>יועץ דיגיטלי לעסקים</small>
            <BrandName />
          </span>
        </a>
        <div className="side">
          <a className="btn-quiet" href="/login">כניסה</a>
        </div>
        {/* קו התקדמות קריאה - מידע אמיתי, לא קישוט. נכתב ישירות מה-rAF (ראו useScrolled) */}
        <span ref={progressRef} className="nav-prog" aria-hidden="true" />
      </nav>

      <main className="land-wrap">
        {/* ההירו לפי הסקיצה של להב (26.8): כותרת וסלוגן מימין למעלה, מתחתם חלון
            הסריקה עם הדמות, וטופס האבחון בעמודה השמאלית לצדו. שורת head משותפת
            ושתי עמודות בגריד עם אזורים - במובייל הטופס קודם לחלון */}
        {/* גרסה רביעית (משוב מייסד 26.8): כל הטקסט והטופס בעמודה הימנית - כותרת,
            סלוגן, טופס עם דוגמאות לחיצות, והמצב היום. החלון בעמודה השמאלית עם
            הדמות בפינה השמאלית-עליונה שלו, מהופכת כך שהיא פונה ימינה אל התוכן */}
        <section className="hero-grid hero-v4">
          <div className="hero-main">
          <header className="hero-head">
            {/* בלי תג "אבחון דיגיטלי לעסקים" - הניווט כבר אומר את זה מילה במילה */}
            {/* הכותרת נושאת את שם המותג עצמו כפעולה (תיקון מייסד 26.8: השם הוא
                בדק עסק, לא בדק בית); הביטוי המוכר עובר לסלוגן כגשר */}
            <h1 className="hero-h1 rv d1">
              עשית פעם <span className="hl2">בדק עסק</span>?
            </h1>
            <p className="hero-sub rv d2" style={{ marginTop: 10 }}>
              כמו בדק בית, רק לעסק שלך: תוך דקה תדע מה מצב הדיגיטל,
              <b> ומה שווה לתקן קודם.</b>
            </p>
          </header>

          {/* המצב היום עלה לכאן (מייסד 26.8): בין הסלוגן לכרטיס הבדיקה - קודם
              מזדהים עם הבעיה, ואז הפתרון במרחק שדה אחד */}
          <div className="hero-sit rv d3">
            <p className="sit-k">המצב היום</p>
            {SITUATION.map((line) => (
              <p key={line.hl} className="sit-say">
                {line.before}<em>{line.hl}</em>{line.after}
              </p>
            ))}
          </div>

          <div className="hero-form">
            <form onSubmit={(e) => { e.preventDefault(); startDiagnosis(); }}>
              {/* בלי קופסה (עיצוב מחדש 26.8): הטופס יושב ישירות בעמודה כמו הכותרת
                  והמצב היום מעליו, ברוחב מלא - שני הצדדים נגמרים באותו קו */}
              <div className="diag-card rv d3">
                  <p className="diag-t">בדוק את העסק שלך</p>
                  <div className="fieldrow">
                    <span className="field">
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.2-3.2" />
                      </svg>
                      <input
                        id="landing-query"
                        type="text"
                        aria-label="שם העסק או כתובת האתר"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="שם העסק והעיר, או כתובת האתר"
                      />
                    </span>
                    <button type="submit" className="btn wide">
                      אבחן את העסק שלי
                      <CapArrow />
                    </button>
                  </div>
                  {/* דוגמאות לחיצות (בקשת מייסד 26.8): נגיעה ממלאת את השדה - מראה
                      בשנייה מה מקלידים, בלי לקרוא פלייסהולדר */}
                  <div className="ex-chips" aria-label="דוגמאות לחיפוש">
                    <span className="ex-lb">למשל:</span>
                    {SEARCH_EXAMPLES.map((ex) => (
                      <button key={ex} type="button" className="ex-chip" onClick={() => setQuery(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                  {/* שורת האמון - הטענות מגובות במוצר: האבחון הראשוני לא עולה כסף,
                      אין התחייבות, והסריקה אורכת בערך דקה */}
                  <div className="trust" style={{ marginTop: 10 }}>
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
              {/* אותה מחלקה כמו הערת ההדגמה שמתחת לחלון - שתי השורות נגמרות באותו גובה */}
              <p className="demo-note rv d4">
                האבחון דורש חשבון - נכניס אותך ברגע, בלי סיסמה, והחיפוש שהקלדת מחכה לך בפנים.
              </p>
            </form>
          </div>

          </div>

          <div className="hero-demo">
            <Parallax strength={14}>
              <Tilt>
                <ScanTerminal />
              </Tilt>
            </Parallax>
            <p className="demo-note rv d5">
              הדגמה - זה מה שרץ אחרי שמזינים שם עסק, ולוקח פחות מדקה
            </p>
          </div>
        </section>

        {/* מסלול השלבים: כל שלב עם התצוגה החיה שלו. תופס עמוד מלא בדסקטופ */}
        <section id="stages" className="stage-sec pb-14">
          <Reveal>
            <div className="how-head"><h2>איך זה עובד</h2></div>
          </Reveal>
          <Reveal delay={90}>
            <StageWalk />
          </Reveal>
        </section>

        {/* רצועת הוכחות אחת במקום ארבעה סקשנים של טקסט (קיצור מייסד 26.8) */}
        <ProofSection />

        {/* רצועת סגירה: הכותרת המאושרת בלבד. תת-הכותרת ירדה - היא מופיעה מילה במילה
            בירו, וחזרה עליה כאן רק מעמיסה בלי להוסיף */}
        <section className="pb-16">
          {/* הלוקאפ המלא (אחרי ניקוי המשבצות) סוגר את העמוד כרגע מותג, לפני הקריאה האחרונה */}
          <Reveal>
            <div className="about-brand">
              <img src="/brand/lockup-dark.webp" alt="בדק עסק" className="only-dark" />
              <img src="/brand/lockup-light.webp" alt="בדק עסק" className="only-light" />
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="shell" style={{ position: "relative" }}>
              {/* הדמות מציגה את ההזמנה האחרונה בעמוד - כף יד פתוחה אל הכפתור */}
              <img src="/brand/presenting.webp" alt="" aria-hidden="true" className="cta-buddy" />
              <div className="core cta-core">
                <h2 className="cta-h">עשית פעם בדק עסק?</h2>
                <button type="button" className="btn-invert" onClick={startDiagnosis}>
                  אבחן את העסק שלי
                  <CapArrow />
                </button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* פוטר (בקשת מייסד 26.8): הלוקאפ המלא נבנה נייטיב - הדמות הנקייה לצד הוורדמארק
          החי - כי לקובצי הלוקאפ שנוצרו יש שאריות רקע בתוך האותיות. הדמות המצביעה
          בגוף מלא עומדת בקצה ומצביעה אל הקישורים */}
      <footer className="land-foot">
        <div className="land-wrap land-foot-in">
          <div className="foot-brand">
            <img src="/brand/inspecting.webp" alt="" aria-hidden="true" className="foot-face" />
            <div>
              <BrandName />
              <span className="foot-rule" aria-hidden="true" />
              <p className="foot-tag">יועץ דיגיטלי לעסקים קטנים בישראל</p>
            </div>
          </div>
          <nav className="foot-nav" aria-label="קישורי תחתית">
            <a href="#stages">איך זה עובד</a>
            <a href="/login">כניסה</a>
          </nav>
          <img src="/brand/pointing-full.webp" alt="" aria-hidden="true" className="foot-point" />
        </div>
        <p className="foot-line">בדק עסק - שני שותפים, נבנה בישראל לעסקים בישראל, מאז אוגוסט 2026</p>
      </footer>
    </>
  );
}
