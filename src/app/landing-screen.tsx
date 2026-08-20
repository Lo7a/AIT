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
    <div className="shell term rv d4" ref={liveRef}>
      <div className="core">
        {/* בלי שלוש נקודות הצבע של חלון - קישוט טהור שרק מוסיף רעש לסרגל */}
        <div className="term-bar">
          <span className="addr" dir="ltr">ait.scan</span>
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
  );
}

// קו מציין מקום: מייצג טקסט שיתמלא מהסריקה של העסק. ניטרלי בכוונה - טקסט לדוגמה
// בדוח לדוגמה הוא בדיוק המקום שבו נולדים מספרים מומצאים
function Ph({ w }: { w: string }) {
  return (
    <span
      className="mt-1.5 block rounded-full first:mt-0"
      style={{ width: w, height: 5, background: "var(--surface-2)" }}
      aria-hidden="true"
    />
  );
}

// תצוגת הדוח: המבנה האמיתי (פריסה 3 - עמודת זהות דביקה + עמודת תוכן) עם שורת
// ניווט העוגן שעוברת בין המקטעים. זו הדגמת מבנה וניווט, לכן אין בה נתונים
function ReportPreview() {
  const [active, setActive] = useState(0);
  const [liveRef, live] = useInView<HTMLDivElement>(false);

  useEffect(() => {
    if (prefersReducedMotion() || !live) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % REPORT_SECTIONS.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, [live]);

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
              <div
                className="core"
                style={i === active
                  ? { borderColor: "rgba(var(--acc-rgb),.45)", background: "rgba(var(--acc-rgb),.05)" }
                  : undefined}
              >
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
function InterviewPreview() {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [liveRef, live] = useInView<HTMLDivElement>(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true);
      return;
    }
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const CYCLE = 7; // פאזות 0-5 + פעימת החזקה לפני איפוס
  const qi = reduced ? 0 : Math.floor(tick / CYCLE) % DEMO_QA.length;
  const phase = reduced ? 5 : tick % CYCLE;
  const qa = DEMO_QA[qi];

  return (
    <div ref={liveRef}>
      <div className="flex items-center gap-4">
        <div className="orb-being" style={{ width: 74, height: 74, margin: 0 }} aria-hidden="true">
          <span className="orb-halo" />
          <span className="orb-ring" />
          <span className="orb-ring b" />
          <span className="orb-core" style={{ inset: 14 }} />
        </div>
        <div>
          <b className="block text-sm font-bold">היועץ הדיגיטלי של AIT</b>
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
function PlanPreview() {
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
const SITUATION: { before: string; hl: string; after: string }[] = [
  { before: "פניות מגיעות בטלפון, בוואטסאפ ובאינסטגרם, ו", hl: "אין דרך לדעת כמה מהן נשכחו", after: "." },
  { before: "כל כמה זמן מתקשר עוד ספק עם עוד הבטחה, ו", hl: "קשה לדעת מה מזה העסק באמת צריך", after: "." },
  { before: "משקיעים באתר, בפרסום ובמערכות, ", hl: "בלי לדעת מה מהם מחזיר ומה רק עולה", after: "." },
];

// חוקי הניקוד האמיתיים של ממד "נגישות ללקוח" עם המשקלים שלהם (score/dimensions.ts).
// פרסום הרובריקה עצמה הוא ההוכחה החזקה ביותר לכך שהציון לא נשלף מהאוויר
const RUBRIC = [
  { t: "קביעת תור אונליין", w: 30 },
  { t: "וואטסאפ באתר", w: 25 },
  { t: "טופס יצירת קשר", w: 15 },
  { t: "טלפון נגיש ללקוח", w: 15 },
];

// שלושת המצבים שממצא יכול להיות בהם. המצב השלישי הוא כל ההבדל: "לא נבדק" הוא לא פער
const FINDING_STATES: { t: string; s: "ok" | "no" | "un" }[] = [
  { t: "וואטסאפ זמין באתר", s: "ok" },
  { t: "אין קישור וואטסאפ באתר", s: "no" },
  { t: "האתר בנוי בצד הלקוח, לא הצלחנו לקרוא את הסימנים", s: "un" },
];

// מקטעי הדוח האמיתיים, בשמות שהמסך באמת מציג - לא רשימת הבטחות
const REPORT_TOC: { t: string; free?: boolean }[] = [
  { t: "מה הבנתי על העסק שלך" },
  { t: "עיקרי הדוח" },
  { t: "פירוט הציון לפי חמישה תחומים" },
  { t: "הפערים המובילים" },
  { t: "מה כבר עובד טוב" },
  { t: "מה אפשר לעשות כבר עכשיו", free: true },
  { t: "תוכנית עבודה עם טווחי מחיר ממקור" },
];

function SituationSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>המצב היום</h2></div>
      </Reveal>
      <div>
        {SITUATION.map((line, i) => (
          <Reveal key={line.hl} delay={i * 90}>
            <p className="sit-say">
              {line.before}<em>{line.hl}</em>{line.after}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ReportTocSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>מה יש בדוח</h2></div>
      </Reveal>
      <Reveal delay={70}>
        <div className="shell">
          <div className="core card-pad">
            {REPORT_TOC.map((row, i) => (
              <div key={row.t} className="toc-row">
                <span className="t">{row.t}</span>
                {row.free && <span className="free-tag">בלי תשלום</span>}
                <span className="lead" aria-hidden="true" />
                <span className="n num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

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

// כללי העבודה: כל טענה מוצגת לצד חתיכה אמיתית מהמוצר שמקיימת אותה. אין כאן אייקון,
// כותרת ופסקה - יש טענה והוכחה, והצדדים מתחלפים כדי שזה לא ייקרא כרשימה
function RulesSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>איך אנחנו עובדים</h2></div>
      </Reveal>
      <Reveal delay={70}>
        <div className="shell">
          <div className="core card-pad">

            <div className="zig-row">
              <div className="say">
                <span className="k">הרובריקה גלויה</span>
                <b>הציון לא נשלף מהאוויר</b>
                <p>
                  לכל חוק יש משקל קבוע וידוע מראש, וכל דוח מראה בדיוק אילו חוקים נבדקו
                  ומה כל אחד תרם. אפשר לחלוק עלינו, ואי אפשר להאשים אותנו בהמצאה.
                </p>
              </div>
              <div className="art">
                <div className="art-h">
                  <span>נגישות ללקוח</span>
                  <span>משקל</span>
                </div>
                {RUBRIC.map((r) => (
                  <div key={r.t} className="art-row">
                    <span className="g">{r.t}</span>
                    <span className="wt num">{r.w}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="zig-row">
              <div className="say">
                <span className="k">שלושה מצבים, לא שניים</span>
                <b>מה שלא נבדק כתוב שלא נבדק</b>
                <p>
                  לממצא יש שלושה מצבים אפשריים ולא שניים. אתר שלא הצלחנו לקרוא לא הופך
                  לרשימת בעיות. דוח שמנפח בעיות קל למכור, ואי אפשר לסמוך עליו.
                </p>
              </div>
              <div className="art">
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

            <div className="zig-row">
              <div className="say">
                <span className="k">סדר הצעדים</span>
                <b>מה שאפשר לתקן לבד מגיע קודם</b>
                <p>
                  הדוח פותח בצעדים שאפשר לעשות היום בלי לשלם לאף אחד. התוכנית בתשלום
                  מגיעה אחריהם, ורק על מה שבאמת נחוץ.
                </p>
              </div>
              <div className="art">
                <div className="art-h">
                  <span>סדר בדוח</span>
                  <span className="free-tag">בלי תשלום</span>
                </div>
                <div className="art-row">
                  <span className="g">להוסיף כפתור וואטסאפ לאתר</span>
                </div>
                <div className="art-row">
                  <span className="g">לבקש ביקורות מלקוחות מרוצים</span>
                </div>
                <div className="art-div" aria-hidden="true" />
                <div className="art-row off">
                  <span className="g">תוכנית עבודה בתשלום</span>
                  <span className="wt">אחרי</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </Reveal>
    </section>
  );
}

// מדידה אמיתית שלנו (18.8.2026): שלושה אתרים ישראליים שבהם בדיקת המהירות המדומה
// האשימה באיטיות בזמן שמדידת גוגל על גולשים אמיתיים באותם אתרים אמרה את ההפך.
// זו הסיבה שהמוצר מפסיק להציג ציון מדומה כפער כשיש מדידת שדה שסותרת אותו
const SPEED_CHECK = [
  { who: "אתר ישראלי א", lab: 8.0, real: 1.28 },
  { who: "אתר ישראלי ב", lab: 15.9, real: 1.58 },
  { who: "אתר ישראלי ג", lab: 53.4, real: 1.9 },
];

// משקלי הממדים במנוע הניקוד (score/dimensions.ts) - סכום 100 אחוז
const WEIGHTS = [
  { t: "נגישות ללקוח", w: 25, c: "var(--acc-rgb)", a: 1 },
  { t: "נראות דיגיטלית", w: 20, c: "var(--acc-rgb)", a: 0.72 },
  { t: "מוניטין וביקורות", w: 20, c: "var(--acc2-rgb)", a: 0.62 },
  { t: "בשלות תהליכים", w: 20, c: "var(--acc2-rgb)", a: 0.9 },
  { t: "תשתית דיגיטלית", w: 15, c: "var(--acc-rgb)", a: 0.42 },
];

// הפסים נמתחים כשהם נכנסים למסך, כך שההשוואה נבנית מול העין במקום להופיע גמורה
function SpeedBars() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} style={{ marginTop: 14 }}>
      {SPEED_CHECK.map((row) => (
        <div key={row.who} className="cmp-row">
          <span className="who">{row.who}</span>
          <div className="cmp-bar lab">
            <span className="t">בדיקה מדומה</span>
            <span className="track">
              <i style={{ width: "100%", transform: `scaleX(${inView ? 1 : 0})` }} />
            </span>
            <span className="v num">{row.lab.toFixed(1)} שניות</span>
          </div>
          <div className="cmp-bar real">
            <span className="t">גולשים אמיתיים</span>
            <span className="track">
              <i
                style={{
                  width: `${Math.max((row.real / row.lab) * 100, 3)}%`,
                  transform: `scaleX(${inView ? 1 : 0})`,
                  transitionDelay: ".25s",
                }}
              />
            </span>
            <span className="v num">{row.real.toFixed(2)} שניות</span>
          </div>
        </div>
      ))}
    </div>
  );
}

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

function DataSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>נתונים</h2></div>
      </Reveal>
      <Reveal delay={70}>
        <div className="data-grid">

          <div className="shell data-wide">
            <div className="core card-pad">
              <p className="data-t">בדיקת מהירות מדומה מול מה שהגולשים באמת חווים</p>
              <p className="data-p">
                בדקנו שלושה אתרים ישראליים בשתי הדרכים. הבדיקה המדומה, זו שכל כלי מציג,
                האשימה את שלושתם באיטיות. מדידת גוגל על הגולשים האמיתיים של אותם אתרים
                אמרה את ההפך. לכן דוח שמציג רק את הבדיקה המדומה מאשים עסקים בטעות.
              </p>
              <SpeedBars />
              <p className="src">
                נמדד ב-18 באוגוסט 2026 מול Google PageSpeed Insights ו-Chrome UX Report.
                אורך הפס יחסי לשורה שלו, והמספר המדויק מופיע לצדו.
              </p>
            </div>
          </div>

          <div className="shell">
            <div className="core card-pad">
              <p className="data-t">כך מחולק הציון</p>
              <p className="data-p">
                חמישה ממדים במשקלים קבועים. ממד שאין עליו מספיק מידע לא מקבל ציון ולא
                נכנס לחישוב, במקום לקבל אפס.
              </p>
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
              <p className="src">משקלי הממדים במנוע הניקוד של AIT.</p>
            </div>
          </div>

          <div className="shell">
            <div className="core card-pad">
              <p className="data-t">איפה מחפשים אותך</p>
              <p className="data-p">
                כמעט כל חיפוש בישראל עובר דרך גוגל. לכן הפרופיל העסקי בגוגל הוא הדבר
                הראשון שהסריקה בודקת.
              </p>
              <SearchShare />
              <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 7 }}>
                מנתח החיפושים בישראל שמגיע לגוגל
              </p>
              <p className="src">Statcounter, יולי 2026.</p>
            </div>
          </div>

        </div>
      </Reveal>
    </section>
  );
}

// מי אנחנו: רק מה שנכון ואפשר לעמוד מאחוריו. הסימוני "למילוי" הכתומים הוסרו אחרי
// שהתגלו חיים בפרודקשן - שלט "טיוטה" בדף שיווקי גרוע משורה אחת פחות.
// השמות והתפקידים ייכנסו כשהמייסד ייתן אותם; עד אז "שני שותפים" נכון ומספיק
function AboutSection() {
  return (
    <section className="pb-14">
      <Reveal>
        <div className="how-head"><h2>מי אנחנו</h2></div>
      </Reveal>
      <Reveal delay={70}>
        <div className="shell">
          <div className="core card-pad about">
            <div>
              <p className="say">
                בנינו את AIT כי בעל עסק מקבל הצעות לפני שמישהו טרח לבדוק מה באמת חסר לו.
                אנחנו מתחילים מהאבחון, ורק אחר כך מדברים על מה שווה לעשות.
              </p>
            </div>
            <div className="facts">
              <div className="f">
                <span className="k">איפה</span>
                <span className="v">נבנה בישראל, לעסקים בישראל</span>
              </div>
              <div className="f">
                <span className="k">מי</span>
                <span className="v">שני שותפים</span>
              </div>
              <div className="f">
                <span className="k">מאז</span>
                <span className="v">אוגוסט 2026</span>
              </div>
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
      <div className="stage-list" role="tablist" aria-label="שלבי התהליך">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            type="button"
            role="tab"
            id={`stage-tab-${i}`}
            aria-selected={i === stage}
            aria-controls="stage-panel"
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

      <div className="stage-panel">
        <div
          className="shell stage-fade"
          key={stage}
          id="stage-panel"
          role="tabpanel"
          aria-labelledby={`stage-tab-${stage}`}
        >
          <div className="core" style={{ padding: "16px 16px 14px" }}>
            {stage === 0 && <ReportPreview />}
            {stage === 1 && <InterviewPreview />}
            {stage === 2 && <PlanPreview />}
          </div>
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
          <span className="brand-mark">AIT</span>
          <span className="brand-txt">
            <small>יועץ דיגיטלי לעסקים</small>
            <b>AIT</b>
          </span>
        </a>
        <div className="side">
          <a className="btn-quiet" href="/login">כניסה</a>
        </div>
        {/* קו התקדמות קריאה - מידע אמיתי, לא קישוט. נכתב ישירות מה-rAF (ראו useScrolled) */}
        <span ref={progressRef} className="nav-prog" aria-hidden="true" />
      </nav>

      <main className="land-wrap">
        {/* הירו בשתי עמודות: הטופס הוא העוגן, לצדו הסריקה רצה */}
        <section className="hero-grid">
          <div>
            {/* בלי תג "אבחון דיגיטלי לעסקים" - הניווט כבר אומר את זה מילה במילה */}
            <h1 className="hero-h1 rv d1">
              כמה שווה <span className="hl2">הנוכחות הדיגיטלית</span> של העסק שלך?
            </h1>
            <p className="hero-sub rv d2" style={{ marginBottom: 16, marginTop: 10 }}>
              יועץ דיגיטלי לעסקים: סריקה מקיפה, שיחה קצרה על העסק, ותוכנית עבודה
              מסודרת - <b>הכול במקום אחד.</b>
            </p>

            <form onSubmit={(e) => { e.preventDefault(); startDiagnosis(); }}>
              <div className="shell rv d3">
                <div className="core" style={{ padding: 11 }}>
                  <label htmlFor="landing-query" className="field-lb">שם העסק או כתובת האתר</label>
                  {/* נערם לשתי שורות במובייל (הכלל הקבוע: כל מסך מותאם טלפון) - .fieldrow מטפל בזה */}
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
              </div>
              <p className="rv d4" style={{ marginTop: 9, fontSize: 11.5, color: "var(--mut)" }}>
                האבחון דורש חשבון - נכניס אותך ברגע, בלי סיסמה, והחיפוש שהקלדת מחכה לך בפנים.
              </p>
            </form>
          </div>

          {/* שלב הסריקה, רץ ומתואר. בלי כותרת מעליו - סרגל הכתובת ושורת הסיכום של המסוף
              כבר אומרים מה זה, וכותרת נוספת רק מוסיפה רעש */}
          <div>
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

        {/* לפני שמראים מכונה - הרגע שבו הוא מזהה את עצמו */}
        <SituationSection />

        {/* מסלול השלבים: כל שלב עם התצוגה החיה שלו */}
        <section id="stages" className="pb-14">
          <Reveal>
            <div className="how-head"><h2>איך זה עובד</h2></div>
          </Reveal>
          <Reveal delay={90}>
            <StageWalk />
          </Reveal>
        </section>

        {/* מה מקבלים בפועל, ואז למה לסמוך על זה, ואז מי עומד מאחורי זה */}
        <ReportTocSection />
        <RulesSection />
        <DataSection />
        <AboutSection />

        {/* רצועת סגירה: הכותרת המאושרת בלבד. תת-הכותרת ירדה - היא מופיעה מילה במילה
            בירו, וחזרה עליה כאן רק מעמיסה בלי להוסיף */}
        <section className="pb-16">
          <Reveal>
            <div className="shell">
              <div className="core cta-core">
                <h2 style={{
                  flex: 1, minWidth: 220,
                  fontSize: "clamp(16px,1.7vw,21px)", lineHeight: 1.4,
                  letterSpacing: "-.01em", maxWidth: "26ch", fontWeight: 700,
                  textWrap: "balance",
                }}>
                  כמה שווה הנוכחות הדיגיטלית של העסק שלך?
                </h2>
                <button type="button" className="btn-invert" onClick={startDiagnosis}>
                  אבחן את העסק שלי
                  <CapArrow />
                </button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
    </>
  );
}
