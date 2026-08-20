import Link from "next/link";
import { SearchBox } from "../search-box";
import { ScanRunner } from "../scan/scan-runner";
import type { Target } from "../scan/use-scan-stream";
import { DIAGNOSIS_STATUS_LABEL } from "../../pipeline/report/presenter";
import type { DiagnosisListItem, ReportView } from "../../server/diagnosis-read";
import {
  DATA_STATUS_LABEL, PARTIAL_FLAG_LABEL, ruleLabelHe, scoreTone, type ScoreToneKind,
} from "../../pipeline/report/presenter";
import type { DataStatus, RuleResult } from "../../pipeline/score/types";
import { HAS_REPORT_STATUSES } from "../../server/status";
import type { LossHighlight } from "../../pipeline/roadmap/loss-highlights";
import type { PersonalLossLine } from "../../pipeline/roadmap/loss-calc";
import type { QuickWin } from "../../pipeline/roadmap/quick-wins";
import type { Insight } from "../../pipeline/roadmap/insights";
import { healthFacts } from "../../pipeline/report/health-facts";
import type { HealthSignals } from "../../pipeline/types";
import { AppShell } from "../ui/app-shell";
import { AnchorNav, type AnchorItem } from "../ui/anchor-nav";
import { ScoreDial, MiniRing, SegRail, FillBar } from "../ui/motion";

// שלושת המסכים בשפת העיצוב הנבחרת (הכרעת מייסד 18.8): כהה פרמיום, סגול וברקת, Rubik.
// כל הקלאסים מ-globals.css (shell/core/board וכו'); מה שאין לו קלאס גלובלי מקבל סגנון
// מקומי על גבי טוקני ה-CSS - לא נוגעים בקבצים משותפים. אין כאן לוגיקה - רק תצוגה על
// גבי נתונים/הוקים משותפים. כל גרסה חדשה מתחילה בתור re-export של אלה
// (ראו variants/{modern,dark,vivid}/index.tsx) עד שהיא מוחלפת במימוש עצמאי משלה.

// שטיפות רקע ותגי צבע שאין להם קלאס גלובלי - על גבי הטוקנים, מכבדים גם מצב בהיר
const LOSS_WASH_STYLE = {
  background: "radial-gradient(460px 240px at 88% -10%, rgba(var(--accd-rgb),.13), transparent 65%), var(--core-bg)",
} as const;
const PLAN_WASH_STYLE = {
  background: "linear-gradient(135deg, rgba(var(--accd-rgb),.18), rgba(var(--acc2-rgb),.06) 62%), var(--core-bg)",
  borderColor: "rgba(var(--acc-rgb),.22)",
} as const;
const BAD_WASH_STYLE = {
  background: "linear-gradient(rgba(var(--bad-rgb),.07), rgba(var(--bad-rgb),.07)), var(--core-bg)",
  borderColor: "rgba(var(--bad-rgb),.3)",
} as const;
// שטיפת סקציית הפתיחה: אלכסון רך מפינת ההתחלה, גיאומטריה שונה מהרדיאלי של בלוק ההפסד
// שיושב מתחתיו - שתי הסקציות לא נראות כמו אותו כרטיס פעמיים
const INSIGHTS_WASH_STYLE = {
  background: "linear-gradient(158deg, rgba(var(--accd-rgb),.15), transparent 48%), var(--core-bg)",
  borderColor: "rgba(var(--acc-rgb),.2)",
} as const;
const WARN_STRIP_STYLE = {
  background: "rgba(var(--warn-rgb),.12)",
  borderBottom: "1px solid rgba(var(--warn-rgb),.4)",
  color: "var(--warn)",
} as const;

// תאריך הסריקה בשורת הזהות של הדוח. נבנה פעם אחת ברמת המודול - הפורמט זהה בכל קריאה,
// והמסך הוא RSC (אין רינדור חוזר בדפדפן שיכול לייצר טקסט אחר מזה שנשלח)
const SCAN_DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" });

// חץ הגלולה (btn .cap) - מצביע שמאלה, כיוון ההתקדמות ב-RTL
function CapArrow({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
    </svg>
  );
}

// ראשי תיבות לאווטאר שורת עסק: אות ראשונה משתי המילים הראשונות, או שתי הראשונות בשם קצר
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  return name.trim().slice(0, 2);
}

export function DefaultHome({
  recent, session, loginEnabled, isAdminUser, impersonating,
}: {
  recent: DiagnosisListItem[];
  session?: { email: string | null } | null;
  loginEnabled?: boolean;
  isAdminUser?: boolean;
  impersonating?: { email: string | null } | null;
}) {
  // האבחון הפעיל של המשתמש: הראשון ברשימה שכבר יש לו דוח. בלעדיו הסיידבר במסך הבית
  // היה מציג רק את "מרכז העסק" ומסתיר את הדוח, הראיון והתוכנית - כלומר הכניסה למסך
  // הבית "מחקה" למשתמש את שאר המערכת (ממצא מייסד 19.8)
  const openDiagnosisId = recent.find((d) => HAS_REPORT_STATUSES.includes(d.status))?.id;

  return (
    <AppShell active="home" diagnosisId={openDiagnosisId} userLabel={session?.email ?? null} isAdmin={isAdminUser === true}>
      {/* פס ההתחזות: בולט בכוונה - אדמין שצופה בתור משתמש חייב לראות את זה כל הזמן */}
      {impersonating != null && (
        <div
          className="relative z-4 flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm font-medium"
          style={WARN_STRIP_STYLE}
        >
          <span>
            מצב התחזות: אתה רואה את המערכת בתור <span className="font-bold" dir="ltr">{impersonating.email ?? "משתמש ללא אימייל"}</span>
          </span>
          <form action="/api/admin/impersonate" method="post">
            <input type="hidden" name="action" value="stop" />
            <button type="submit" className="cursor-pointer font-bold underline underline-offset-4">חזרה לעצמי</button>
          </form>
        </div>
      )}

      {/* שורת הסשן: מחובר => אימייל + התנתקות (POST - ראו auth-handlers); אנונימי בסביבה
          מוגדרת => קישור כניסה. בסביבה בלי מפתחות אין כלום - המסך נשאר כפי שהיה */}
      <header className="topbar">
        <span className="brand-txt"><small>יועץ דיגיטלי</small><b>מרכז העסק</b></span>
        <div className="side">
          {session != null ? (
            <>
              {/* קישור "ניהול" עבר לסיידבר (הנחיית מייסד 20.8) - ניווט למדור אחר הוא
                  ניווט, ומקומו איפה שכל שאר הניווט */}
              <span className="chip hidden sm:inline-block">
                מחובר בתור <span dir="ltr">{session.email ?? "משתמש ללא אימייל"}</span>
              </span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="ghost-act">התנתקות</button>
              </form>
            </>
          ) : loginEnabled ? (
            <Link href="/login" className="btn-quiet">כניסה</Link>
          ) : null}
        </div>
      </header>

      <main className="board">
        <section className="shell rv d1 c12">
          <div className="core card-pad" style={LOSS_WASH_STYLE}>
            <h1 className="max-w-[26ch] text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
              כמה שווה <span className="hl-accent">הנוכחות הדיגיטלית</span> של העסק שלך?
            </h1>
            <p className="mt-3 max-w-[56ch] text-sm sm:text-[15px]" style={{ color: "var(--mut)" }}>
              מכניסים שם עסק או כתובת אתר. תוך דקה מקבלים תמונה אמיתית: מה עובד, מה חסר ומה כדאי לתקן קודם.
            </p>
            <SearchBox />
          </div>
        </section>

        {recent.length > 0 && (
          <section className="shell rv d2 c12">
            <div className="core card-pad">
              <h2 className="card-title">אבחונים אחרונים</h2>
              {/* הרשימה מציגה את כל האבחונים - גובה קבוע וגלילה פנימית במקום חיתוך */}
              <ul className="max-h-96 overflow-y-auto overscroll-contain">
                {recent.map((d) => (
                  <li key={d.id} className="scan-row">
                    <span className="sc-avatar">{initialsOf(d.businessName)}</span>
                    <span className="who">
                      <b>{d.businessName}</b>
                      <i>{DIAGNOSIS_STATUS_LABEL[d.status]}</i>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {/* ראיון שהתחיל ולא הסתיים - קיצור ישיר להמשכתו; מסך הראיון כבר יודע
                          להתחדש מהנקודה שבה עצרו, כאן רק הכניסה */}
                      {d.status === "interviewing" && (
                        <Link href={`/interview/${d.id}`} className="pill">להשלמת הראיון</Link>
                      )}
                      {/* אבחון שכבר יש לו Roadmap - כניסה ישירה אליו מהרשימה (בקשת מייסד) */}
                      {d.status === "roadmap_ready" && (
                        <Link href={`/roadmap/${d.id}`} className="ghost-act">ל-Roadmap</Link>
                      )}
                      {HAS_REPORT_STATUSES.includes(d.status) && (
                        <Link href={`/report/${d.id}`} className="ghost-act">לדוח</Link>
                      )}
                      {/* טבעת ציון רק כשיש ציון אמיתי מהסריקה - שורה בלי ציון נשארת בלי טבעת */}
                      {d.overall != null && (
                        <MiniRing score={d.overall} tone={scoreTone(d.overall) === "low" ? "warn" : undefined} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}

export function DefaultScan({
  target, attach,
}: {
  target: Target;
  attach?: { diagnosisId: string; status: string };
}) {
  return <ScanRunner target={target} attach={attach} />;
}

// מיוצא (גם ל-default-roadmap.tsx - שם הסטטוסים תקין/חלש/חסר/אין מידע של ה-Business Map
// מתורגמים לאותה שפת צבע good/mid/low/unknown, כדי שכל המסכים ידברו את אותו קוד צבעים).
// הערכים על גבי טוקני העיצוב הכהה - עובדים גם במצב בהיר דרך המשתנים
export const TONE_TAG_CLASSES: Record<ScoreToneKind, string> = {
  good: "border border-[rgba(var(--acc2-rgb),0.3)] bg-[rgba(var(--acc2-rgb),0.08)] text-[color:var(--acc2-soft)]",
  mid: "border border-[rgba(var(--warn-rgb),0.35)] bg-[rgba(var(--warn-rgb),0.08)] text-[color:var(--warn)]",
  low: "border border-[rgba(var(--bad-rgb),0.35)] bg-[rgba(var(--bad-rgb),0.08)] text-[color:var(--bad)]",
  unknown: "border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] text-[color:var(--mut)]",
};

export const TONE_TEXT_CLASSES: Record<ScoreToneKind, string> = {
  good: "text-[color:var(--acc2-soft)]",
  mid: "text-[color:var(--warn)]",
  low: "text-[color:var(--bad)]",
  unknown: "text-[color:var(--mut)]",
};

const DATA_STATUS_TONE: Record<DataStatus, ScoreToneKind> = {
  full: "good",
  partial: "mid",
  none: "unknown",
};

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function RuleIcon({ rule }: { rule: RuleResult }) {
  if (!rule.known) return <span className="h-5 w-5 shrink-0" aria-hidden="true" />;
  if (rule.earned) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
        style={{ background: "rgba(var(--acc2-rgb),.14)", borderColor: "rgba(var(--acc2-rgb),.4)", color: "var(--acc2)" }}
        aria-hidden="true"
      >
        <CheckIcon />
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
      style={{ background: "rgba(var(--bad-rgb),.1)", borderColor: "rgba(var(--bad-rgb),.4)", color: "var(--bad)" }}
      aria-hidden="true"
    >
      <FailIcon />
    </span>
  );
}

function RuleLine({ rule }: { rule: RuleResult }) {
  if (!rule.known) {
    // שם עברי לבעל העסק, לעולם לא מפתח החוק הגולמי (דיווח מייסד). כשאין תווית - וזה קורה
    // בדוח שנשמר לפני ששם החוק השתנה - מוותרים על הסוגריים במקום להדפיס אנגלית באמצע
    // משפט בעברית. פחות מידע עדיף על מידע שנראה כמו תקלה
    const label = ruleLabelHe(rule.key);
    return (
      <span style={{ color: "var(--dim)" }}>
        {label != null ? `לא נבדק - אין מידע (${label})` : "לא נבדק - אין מידע"}
      </span>
    );
  }
  return <span>{rule.text}</span>;
}

// עיקרי הדוח (loss leads, score measures - שלב א', החלטת מייסד נעולה): בלוק משותף
// לדוח ולמסך ה-Roadmap - אותה שפה עיצובית בשני המקומות. highlights ריק וגם אין שורה אישית ->
// שום דבר לא מוצג (אף פעם לא בלוק ריק ומפחיד); הקורא כבר דואג שהמערך יגיע ריק כשאין התאמות
// אמיתיות (report-highlights.ts / roadmap-logic.ts).
// personal (מדרגה ב, loss-calc.ts): שורת החישוב האישי מתשובות הראיון - סיכון (אדום, מוביל את
// הבלוק) או פרגון לעסק שעונה מהר (ירוק). null כשאין שתי תשובות תואמות - הבלוק נראה כמו בשלב א'
export function LossHighlightsBlock({
  highlights, personal = null, className = "mt-10 animate-fade-up",
}: {
  highlights: LossHighlight[];
  personal?: PersonalLossLine | null;
  className?: string;
}) {
  if (highlights.length === 0 && !personal) return null;
  return (
    <section className={`shell ${className}`}>
      <div className="core card-pad" style={LOSS_WASH_STYLE}>
        {/* כותרת פונקציונלית פשוטה - המייסד פסל ניסוחים שיווקיים מומצאים (18.8) */}
        <h2 className="card-title">עיקרי הדוח</h2>
        {personal && (
          <div
            className="mb-4 rounded-xl border p-4"
            style={personal.kind === "praise"
              ? { background: "rgba(var(--acc2-rgb),.08)", borderColor: "rgba(var(--acc2-rgb),.3)" }
              : { background: "rgba(var(--bad-rgb),.07)", borderColor: "rgba(var(--bad-rgb),.3)" }}
          >
            <p
              className="font-bold leading-relaxed"
              style={{ color: personal.kind === "praise" ? "var(--acc2-soft)" : "var(--bad)" }}
            >
              {personal.lead}
            </p>
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{personal.anchor}</p>
          </div>
        )}
        {highlights.length > 0 && (
          <ul className="space-y-3">
            {highlights.map((h) => (
              <li key={`${h.itemName}-${h.text}`} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--bad)", boxShadow: "0 0 8px rgba(var(--bad-rgb),.6)" }}
                />
                <p className="leading-relaxed">
                  <span className="font-bold">{h.itemName}</span>
                  <span style={{ color: "var(--mut)" }}>{`: ${h.text}`}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// "מה הבנתי על העסק שלך" (insights.ts): פתיחת הדוח. כל שורה כאן היא מסקנה שמחברת כמה ממצאים
// מאומתים - זה מה שבעל העסק לא יכול להרכיב לבד מרשימת ממצאים. הפריסה בכוונה שונה מכל בלוק
// אחר בדוח: שתי עמודות אסימטריות (מסקנה מימין, הביסוס משמאל) מופרדות בקו שיער, בלי כרטיסים
// מקוננים ובלי מספור - כדי שלא ייקרא כמו "מה אפשר לעשות כבר עכשיו" שיושב בהמשך.
// מערך ריק -> שום דבר לא מוצג
function InsightsBlock({ items, className }: { items: Insight[]; className: string }) {
  if (items.length === 0) return null;
  return (
    <section className={`shell ${className}`}>
      <div className="core card-pad" style={INSIGHTS_WASH_STYLE}>
        <h2 className="card-title">מה הבנתי על העסק שלך</h2>
        <p className="-mt-2 mb-5 max-w-[64ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
          כל מסקנה כאן מחברת כמה ממצאים מהסריקה. הממצאים שהיא נשענת עליהם רשומים מתחתיה.
        </p>
        <div>
          {items.map((item) => (
            <article
              key={item.key}
              className="mt-6 border-t pt-6 first:mt-0 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[minmax(0,7fr)_minmax(0,10fr)] sm:gap-x-9"
              style={{ borderColor: "var(--row-line)" }}
            >
              <h3 className="max-w-[26ch] text-[17px] font-extrabold leading-snug tracking-tight sm:text-[19px]">
                {item.title}
              </h3>
              <div className="mt-4 sm:mt-0">
                <ul className="space-y-2">
                  {item.evidence.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--mut)" }}>
                      <span
                        aria-hidden="true"
                        className="mt-1.75 h-1 w-1 shrink-0 rounded-full"
                        style={{ background: "rgba(var(--acc-rgb),.6)" }}
                      />
                      <span className="max-w-[58ch]">{line}</span>
                    </li>
                  ))}
                </ul>
                {/* mut ולא dim: אלה שתי השורות שנושאות את המשמעות, לב הסקציה */}
                <p className="mt-4 max-w-[60ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
                  {item.soWhat}
                </p>
                <p className="mt-3 max-w-[60ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
                  {/* acc2-soft ולא acc2: טקסט צבעוני על משטח מרוכך יורד מתחת ליחס הניגודיות
                      בתצוגה הבהירה; הטוקן הרך מתהפך נכון בשני המצבים */}
                  <b className="font-bold" style={{ color: "var(--acc2-soft)" }}>הכיוון: </b>
                  {item.action}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// "מה אפשר לעשות כבר עכשיו" (quick-wins.ts): צעדים חינמיים שבעל העסק יכול לעשות לבד היום,
// נגזרים מחוקים שנבדקו בפועל ולא הושגו. מוצג אחרי הממצאים ולפני דלת התוכנית - הערך החינמי
// מגיע לפני ההצעה בתשלום. מערך ריק -> שום דבר לא מוצג (אף פעם לא בלוק ריק)
function QuickWinsBlock({ wins, className }: { wins: QuickWin[]; className: string }) {
  if (wins.length === 0) return null;
  return (
    <section className={`shell ${className}`}>
      <div className="core card-pad">
        <h2 className="card-title">
          <span>מה אפשר לעשות כבר עכשיו</span>
          <span className="chip" style={{ letterSpacing: "normal" }}>בלי תשלום</span>
        </h2>
        <p className="-mt-2 mb-4 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
          כל צעד כאן אפשר לעשות לבד, על בסיס מה שנמצא בסריקה של העסק.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {wins.map((win, i) => (
            <li
              key={win.key}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--hair-soft)", background: "var(--surface-1)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: "rgba(var(--acc2-rgb),.14)",
                    border: "1px solid rgba(var(--acc2-rgb),.35)",
                    // acc2-soft ולא acc2: זה טקסט (ספרה), ובתצוגה הבהירה acc2 על הרקע המרוכך
                    // יורד מתחת ליחס הניגודיות הנדרש. הטוקן הרך מתהפך נכון בשני המצבים
                    color: "var(--acc2-soft)",
                  }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-snug">{win.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{win.why}</p>
                  {/* mut ולא dim: זו הוראת הפעולה עצמה, לב הכרטיס. dim שמור לתוויות מטא זעירות
                      ולא עומד ביחס הניגודיות בגודל הזה - קו ההפרדה נושא את ההיררכיה במקומו */}
                  <p
                    className="mt-2.5 border-t pt-2.5 text-[13px] leading-relaxed"
                    style={{ borderColor: "var(--row-line)", color: "var(--mut)" }}
                  >
                    <b className="font-bold" style={{ color: "var(--acc-soft)" }}>איך מתחילים: </b>
                    {win.how}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// כרטיס הכותרת: נרטיב הסריקה (או הנוסח הדטרמיניסטי) + תג כנות כשהנרטיב נפל לתבנית
function HeadlineCard({
  headline, summary, usedFallback, className,
}: {
  headline: string;
  summary: string | null;
  usedFallback: boolean;
  className: string;
}) {
  return (
    <section className={`shell ${className}`}>
      <div className="core card-pad flex h-full flex-col justify-center">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{headline}</h1>
          {usedFallback && <span className="chip">נוסח אוטומטי</span>}
        </div>
        {summary && (
          <p className="mt-3 max-w-[62ch] leading-relaxed" style={{ color: "var(--mut)" }}>{summary}</p>
        )}
      </div>
    </section>
  );
}

// בדיקות התקינות: מה שנמדד מול רשם הדומיינים, רשומות ה-DNS וגוגל - נתונים שבעל העסק
// כמעט אף פעם לא ראה, ושאף אחד לא היה צריך לספר לו כדי שנדע אותם.
//
// המקטע מציג גם את מה שלא נבדק. זה נראה כמו ויתור, והוא ההפך: שורה שכתוב בה "לא נבדק"
// היא ההוכחה היחידה שהשורות האחרות נבדקו באמת
function HealthFactsBlock({ health, className }: { health: HealthSignals | undefined; className: string }) {
  const facts = healthFacts(health);
  if (facts.length === 0) return null;

  return (
    <section id="health" data-anchor className={`shell ${className}`}>
      <div className="core card-pad">
        <h2 className="card-title">הדומיין, הדואר והאבטחה</h2>
        <p className="-mt-2 mb-5 max-w-[64ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
          כל שורה כאן נמדדה ישירות: רשם הדומיינים, רשומות ה-DNS של הדומיין, קוד האתר
          ורשימת האתרים המסוכנים של גוגל.
        </p>
        <div className="facts wide">
          {facts.map((f) => (
            <div key={f.key} className={`f ${f.tone}`}>
              <span className="k">{f.label}</span>
              <span className="v">{f.value}</span>
              {f.why && <span className="why">{f.why}</span>}
              {f.note && <span className="note">{f.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DefaultReport({
  report, lossHighlights = [], personalLoss = null, quickWins = [], insights = [],
}: {
  report: ReportView;
  lossHighlights?: LossHighlight[];
  personalLoss?: PersonalLossLine | null;
  quickWins?: QuickWin[];
  insights?: Insight[];
}) {
  // הצעד הזה מבטיח מבחינת טיפוסים ש-report.scan אינו null: ה-RSC הקורא (report/[id]/page.tsx)
  // כבר מפעיל notFound() לפני שהוא מגיע לכאן כשאין סריקה, כך שזהו רק שער הגנה מקומי
  if (!report.scan) return null;

  const { business, model, nextStep } = report;
  const { findings, scores, narrative, apiCost, durationMs } = report.scan;

  const overall = scores?.overall ?? null;
  const dimensions = scores?.dimensions ?? [];
  const topGaps = scores?.topGaps ?? [];
  const topStrengths = scores?.topStrengths ?? [];

  const headline = narrative?.narrative.headline || `הציון הדיגיטלי של ${business.name}`;
  const summary = narrative?.narrative.summary ?? null;
  const usedFallback = narrative?.usedFallback === true;

  const hasNoGbp = findings.partial.includes("no_gbp");
  // "loss leads, score measures" (החלטת מייסד נעולה): כשיש מה להראות - בלוק עיקרי הדוח מוביל
  // והציון הוא מדד התקדמות בעמודת הזהות. אין כלום -> הכותרת מובילה, בלי בלוק ריק
  const hasHighlights = lossHighlights.length > 0 || personalLoss !== null;
  const hasPlan = model != null && nextStep != null;
  // עסק בלי אתר לא מריץ את הבדיקות האלה בכלל, ואז אין מקטע - לא מקטע של ארבע שורות
  // "לא נבדק" שרק מעמיס
  const hasHealth = findings.health != null;

  // שורת המטא בראש עמודת הזהות: רק שדות שבאמת קיימים על העסק ועל הסריקה הזו
  const identityMeta = [business.city, `נסרק ב-${SCAN_DATE_FMT.format(report.scan.createdAt)}`]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
  // צ'יפים: כל מספר כאן הוא ממצא שנאסף בפועל (findings.business מ-Places, pagesCrawled מהזחילה).
  // שדה שלא הגיע פשוט לא מקבל צ'יפ - עדיף פחות צ'יפים מאשר מספר שלא נמדד
  const pagesCrawled = findings.websiteSignals?.pagesCrawled ?? null;
  const hasMetaChips =
    findings.business.reviewCount != null || findings.business.rating != null ||
    (pagesCrawled != null && pagesCrawled > 0);

  // מקטעי הניווט נבנים מאותם תנאים בדיוק שמרנדרים את הסקציות עצמן - קישור לעוגן שלא קיים
  // בעמוד הוא באג, ולכן אין כאן רשימה קבועה אלא דחיפה מותנית אחת לאחת
  const anchors: AnchorItem[] = [];
  if (insights.length > 0) anchors.push({ id: "insights", label: "מה הבנתי על העסק שלך" });
  if (hasHighlights) anchors.push({ id: "highlights", label: "עיקרי הדוח" });
  if (dimensions.length > 0) anchors.push({ id: "score-detail", label: "פירוט הציון" });
  if (hasHealth) anchors.push({ id: "health", label: "הדומיין, הדואר והאבטחה" });
  if (topGaps.length > 0) anchors.push({ id: "gaps", label: "הפערים המובילים" });
  if (topStrengths.length > 0) anchors.push({ id: "strengths", label: "מה עובד טוב" });
  if (quickWins.length > 0) anchors.push({ id: "quick-wins", label: "מה אפשר לעשות כבר עכשיו" });
  if (hasPlan) anchors.push({ id: "plan", label: "תוכנית העבודה" });

  return (
    <AppShell active="report" diagnosisId={report.id} userLabel={business.name}>
      <header className="topbar">
        <span className="brand-txt"><small>הדוח המלא</small><b>{business.name}</b></span>
        <div className="side">
          {business.website && (
            <span
              className="chip hidden md:inline-block"
              dir="ltr"
              style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {business.website}
            </span>
          )}
          <span className="chip live"><span className="dot" />דוח חי</span>
        </div>
      </header>

      {/* שורת המעבר המהיר יושבת מתחת לסרגל העליון ונדבקת בגלילה - הדוח ארוך, והמייסד
          ביקש שאפשר יהיה לקפוץ בין המקטעים בלי לגלול חזרה */}
      <AnchorNav items={anchors} label="מקטעי הדוח" />

      <main className="repC">
        {/* עמודת הזהות: מי העסק, איפה הוא עומד ומה עוד חסר. דביקה בגלילה כדי שהתשובה
            "על מי מדובר ומה הציון" תישאר על המסך גם כשקוראים מקטע בעומק הדוח */}
        <aside className="rep-side">
          <section className="shell rv d1">
            <div className="core">
              <div className="who-h">
                <b>{business.name}</b>
                {identityMeta !== "" && <i>{identityMeta}</i>}
              </div>
              {/* הציון האמיתי בלבד. אין ציון (אין די מידע) - אומרים את זה ביושר, בלי חוגה
                  ריקה. הכיתוב נכון תמיד: כל תשובת ראיון מרעננת את scan.scores ("הדוח חי") */}
              <div className="score-core">
                {overall == null ? (
                  <p className="py-6 text-3xl font-extrabold" style={{ color: "var(--mut)" }}>אין די מידע</p>
                ) : (
                  <>
                    {/* הכיתוב יושב כאח של החוגה ולא כ-caption בתוכה: בתוך החוגה הוא גולש
                        מחוץ לריבוע הקבוע שלה ובעמודה הצרה היה נופל על שורת הצ'יפים */}
                    <ScoreDial score={overall} size={150} />
                    <span className="dial-cap">הציון מתעדכן עם כל תשובה</span>
                  </>
                )}
              </div>
              {hasMetaChips && (
                <div className="mini-meta">
                  {findings.business.reviewCount != null && (
                    <span><b className="num">{findings.business.reviewCount}</b> ביקורות</span>
                  )}
                  {findings.business.rating != null && (
                    <span>דירוג <b className="num">{findings.business.rating}</b></span>
                  )}
                  {/* "נסרקו" ולא "יש": זה מה שהזחילה עברה בפועל, לא מספר העמודים באתר */}
                  {pagesCrawled != null && pagesCrawled > 0 && (
                    <span><b className="num">{pagesCrawled}</b> עמודים נסרקו</span>
                  )}
                </div>
              )}
            </div>
          </section>

          {dimensions.length > 0 && (
            <section className="shell rv d2">
              <div className="core">
                <h2 className="side-h4">ציון לפי תחומים</h2>
                {dimensions.map((d) => (
                  <div key={d.key} className="dim-row">
                    <span className="lb">{d.label}</span>
                    {/* ממד בלי ציון לא מקבל פס בכלל: פס באורך אפס נקרא כמו "קיבל אפס"
                        ולא כמו "אין מידע". הגריד מקפל את שורת הפס כשאין פס (globals.css) */}
                    {d.score != null && <FillBar percent={d.score} />}
                    <span className={d.score == null ? "sc na" : "sc num"}>{d.score ?? "לא נבדק"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasPlan && (
            <section className="shell rv d3">
              <div className="core flex flex-col gap-3">
                <span className="live-tag"><span className="dot" />הדוח חי</span>
                <div className="flex items-baseline justify-between gap-3">
                  <b className="text-[15px] font-bold">שלמות האבחון</b>
                  <span className="num text-2xl font-extrabold tracking-tight" style={{ color: "var(--acc-soft)" }}>
                    {model.completenessPct}<small className="text-xs font-semibold" style={{ color: "var(--dim)" }}>%</small>
                  </span>
                </div>
                <SegRail percent={model.completenessPct} />
                <p className="text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{nextStep.reason}</p>
                {/* btn wide ולא הגלולה הצרה: ברוחב הרייל (318px) הכיתוב המלא נשבר לשתי
                    שורות, וכפתור במלוא הרוחב קורא נכון במקום גלולה עקומה */}
                <Link href={`/interview/${report.id}`} className="btn sm wide mt-1">
                  רוצה דיוק גבוה יותר? ראיון של 5 דקות
                  <span className="cap"><CapArrow /></span>
                </Link>
              </div>
            </section>
          )}
        </aside>

        <div className="rep-main">
          {/* האתר מוצג במובייל בגוף הדוח - הצ'יפ העליון מוסתר שם מקוצר מקום */}
          {business.website && (
            <p className="text-xs md:hidden" dir="ltr" style={{ color: "var(--dim)", textAlign: "right" }}>
              {business.website}
            </p>
          )}

          {/* פתיחת הדוח: מה שהבנו על העסק. יושב לפני ההפסד כי זו התשובה לשאלה
              "מה אתם באמת מבינים עליי" - הממצאים הבודדים כבר מוצגים בהמשך הדוח.
              התנאי כאן זהה לתנאי הפנימי של InsightsBlock, כדי שהעוגן לא יוביל לריק */}
          {insights.length > 0 && (
            <div id="insights" data-anchor>
              <InsightsBlock items={insights} className="rv d1" />
            </div>
          )}

          {hasHighlights && (
            <div id="highlights" data-anchor>
              <LossHighlightsBlock highlights={lossHighlights} personal={personalLoss} className="rv d2" />
            </div>
          )}

          <HeadlineCard
            headline={headline}
            summary={summary}
            usedFallback={usedFallback}
            className={hasHighlights ? "rv d3" : "rv d1"}
          />

          {hasNoGbp && (
            <section className="shell rv d3">
              <div className="core card-pad" style={BAD_WASH_STYLE}>
                <p className="font-bold" style={{ color: "var(--bad)" }}>העסק לא נמצא בגוגל מפות</p>
                <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>
                  לקוחות שמחפשים בסביבה פשוט לא רואים אותו. זה הפער המשמעותי ביותר שמצאנו.
                </p>
              </div>
            </section>
          )}

          {dimensions.length > 0 && (
            <section id="score-detail" data-anchor className="shell rv d4">
              <div className="core card-pad">
                <h2 className="card-title">פירוט הציון</h2>
                {dimensions.map((d) => (
                  <div key={d.key} className="border-t py-4 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: "var(--row-line)" }}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[15px] font-bold">{d.label}</span>
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${TONE_TAG_CLASSES[DATA_STATUS_TONE[d.dataStatus]]}`}>
                        {DATA_STATUS_LABEL[d.dataStatus]}
                      </span>
                      <span className="num ms-auto text-lg font-bold">
                        {d.score ?? <span className="text-sm font-normal" style={{ color: "var(--mut)" }}>אין מידע</span>}
                      </span>
                    </div>
                    {d.score != null && (
                      <div className="mt-3 flex items-center gap-3">
                        <FillBar percent={d.score} />
                      </div>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm hover:underline" style={{ color: "var(--mut)" }}>
                        איך חושב הציון?
                      </summary>
                      <ul className="mt-3 space-y-2 border-s ps-4" style={{ borderColor: "var(--hair-soft)" }}>
                        {d.rules.map((r) => (
                          <li key={r.key} className="flex items-start justify-between gap-3 text-sm">
                            <span className="flex items-start gap-2">
                              <RuleIcon rule={r} />
                              <RuleLine rule={r} />
                            </span>
                            <span className="num shrink-0" style={{ color: "var(--dim)" }}>{r.points} נק'</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* אחרי פירוט הציון: אלה הראיות שמאחורי חלק מהחוקים, ולפני הפערים כי הן
              מסבירות למה חלק מהם בכלל נפתחו */}
          <HealthFactsBlock health={findings.health} className="rv d4" />

          {topGaps.length > 0 && (
            <section id="gaps" data-anchor className="shell rv d5">
              <div className="core card-pad">
                <h2 className="card-title">הפערים המובילים</h2>
                {topGaps.map((g, i) => {
                  const explanation = narrative?.narrative.gapExplanations.find(
                    (e) => e.ruleKey === g.ruleKey,
                  );
                  const explanationText =
                    explanation && explanation.explanation !== g.text ? explanation.explanation : null;
                  return (
                    <div key={g.ruleKey} className="gap-row">
                      <span className="gap-no num" aria-hidden="true">{i + 1}</span>
                      <h3>{g.text}</h3>
                      {explanationText && <p className="pain">{explanationText}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {topStrengths.length > 0 && (
            <section id="strengths" data-anchor className="shell rv d5">
              <div className="core card-pad h-full">
                <h2 className="card-title">מה עובד טוב</h2>
                <ul className="space-y-3">
                  {topStrengths.map((s) => (
                    <li key={s.ruleKey} className="flex items-start gap-2.5 text-sm leading-relaxed">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                        style={{ background: "rgba(var(--acc2-rgb),.14)", borderColor: "rgba(var(--acc2-rgb),.4)", color: "var(--acc2)" }}
                        aria-hidden="true"
                      >
                        <CheckIcon />
                      </span>
                      <span>{s.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* הערך החינמי לפני ההצעה בתשלום: הצעדים שאפשר לעשות לבד יושבים אחרי הממצאים
              ולפני דלת התוכנית. התנאי כאן זהה לתנאי הפנימי של QuickWinsBlock */}
          {quickWins.length > 0 && (
            <div id="quick-wins" data-anchor>
              <QuickWinsBlock wins={quickWins} className="rv d6" />
            </div>
          )}

          {/* דלת התוכנית: קישור פעיל לכל סטטוס שממנו מותר לבנות/לצפות ב-Roadmap
              (report_ready/interviewing/roadmap_ready - ראו status.ts). כשכבר יש Roadmap קיים
              (roadmap_ready) הניסוח משתנה כדי לא להטעות כאילו זו הפעלה ראשונה */}
          {hasPlan && (
            <section id="plan" data-anchor className="shell rv d6">
              <div className="core card-pad flex flex-wrap items-center justify-between gap-6" style={PLAN_WASH_STYLE}>
                <div className="text-[11px] font-bold tracking-[.18em]" style={{ color: "var(--acc-soft)" }}>
                  תוכנית העבודה
                </div>
                <Link href={`/roadmap/${report.id}`} className="btn-invert">
                  {report.status === "roadmap_ready" ? "לצפייה ב-Roadmap" : "דלג ל-Roadmap"}
                  <span className="cap"><CapArrow size={14} /></span>
                </Link>
              </div>
            </section>
          )}

          <footer className="rv d6 border-t px-1 pt-4 text-xs" style={{ borderColor: "var(--hair-soft)", color: "var(--dim)" }}>
            <p className="num">
              משך סריקה: {(durationMs / 1000).toFixed(1)} שניות · עלות APIs: ${apiCost.toFixed(3)}
            </p>
            {findings.partial.length > 0 && (
              <p className="mt-1">
                {/* social_only מקבל את הנוסח עם שם הפלטפורמה בפועל (partialDetails), לא את התווית הגנרית -
                    בעל העסק צריך לראות "עמוד פייסבוק", לא "עמוד ברשת חברתית" (סקירת קוד m2) */}
                הערות איסוף: {findings.partial
                  .map((f) => (f === "social_only" && findings.partialDetails?.social_only) || PARTIAL_FLAG_LABEL[f])
                  .join(" · ")}
              </p>
            )}
          </footer>
        </div>
      </main>
    </AppShell>
  );
}
