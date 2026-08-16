import Link from "next/link";
import { SearchBox } from "../search-box";
import { ScanRunner } from "../scan/scan-runner";
import type { Target } from "../scan/use-scan-stream";
import { DIAGNOSIS_STATUS_LABEL } from "../../pipeline/report/presenter";
import type { DiagnosisListItem, ReportView } from "../../server/diagnosis-read";
import {
  DATA_STATUS_LABEL, PARTIAL_FLAG_LABEL, RULE_LABEL_HE, scoreTone, type ScoreToneKind,
} from "../../pipeline/report/presenter";
import type { DataStatus, RuleResult } from "../../pipeline/score/types";
import type { DiagnosisStatus } from "../../server/status";
import type { LossHighlight } from "../../pipeline/roadmap/loss-highlights";
import type { PersonalLossLine } from "../../pipeline/roadmap/loss-calc";

// הדוח קיים גם בזמן ראיון, הקישור לא נעלם
const HAS_REPORT: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

// שלושת המסכים המקוריים (ברירת מחדל, מינימליזם עיתונאי) - כל גרסה חדשה מתחילה בתור
// re-export של אלה (ראו variants/{modern,dark,vivid}/index.tsx) עד שהיא מוחלפת במימוש
// עצמאי משלה. אין כאן לוגיקה - רק תצוגה על גבי נתונים/הוקים משותפים.

export function DefaultHome({ recent }: { recent: DiagnosisListItem[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight">
        כמה שווה הנוכחות הדיגיטלית של העסק שלך?
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        מכניסים שם עסק או כתובת אתר. תוך דקה מקבלים תמונה אמיתית: מה עובד, מה חסר ומה כדאי לתקן קודם.
      </p>
      <SearchBox />

      {recent.length > 0 && (
        <section className="mt-14 animate-fade-up" style={{ animationDelay: "240ms" }}>
          <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold tracking-tight">
            אבחונים אחרונים
          </h2>
          {/* הרשימה מציגה את כל האבחונים - גובה קבוע וגלילה פנימית במקום חיתוך.
              דירוג האנימציה נעצר אחרי השורות הראשונות, אחרת שורות עמוק ברשימה מופיעות באיחור של שניות */}
          <ul className="mt-3 max-h-80 divide-y divide-black/[0.06] overflow-y-auto overscroll-contain rounded-lg border border-black/[0.06] bg-white">
            {recent.map((d, i) => (
              <li
                key={d.id}
                className="flex animate-fade-up items-center justify-between px-4 py-3"
                style={{ animationDelay: `${240 + Math.min(i, 5) * 80}ms` }}
              >
                <span>
                  <span className="font-medium">{d.businessName}</span>
                  <span className="ms-2 text-sm text-[#6F6E6A]">
                    {DIAGNOSIS_STATUS_LABEL[d.status]}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {d.overall != null && (
                    <span className="tabular-nums text-sm font-semibold">{d.overall}/100</span>
                  )}
                  {/* ראיון שהתחיל ולא הסתיים - קיצור ישיר להמשכתו; מסך הראיון כבר יודע
                      להתחדש מהנקודה שבה עצרו, כאן רק הכניסה */}
                  {d.status === "interviewing" && (
                    <Link
                      href={`/interview/${d.id}`}
                      className="rounded-md bg-[#111111] px-3 py-1 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                    >
                      להשלמת הראיון
                    </Link>
                  )}
                  {/* אבחון שכבר יש לו Roadmap - כניסה ישירה אליו מהרשימה (בקשת מייסד) */}
                  {d.status === "roadmap_ready" && (
                    <Link
                      href={`/roadmap/${d.id}`}
                      className="text-sm font-medium text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                    >
                      ל-Roadmap
                    </Link>
                  )}
                  {HAS_REPORT.includes(d.status) && (
                    <Link
                      href={`/report/${d.id}`}
                      className="text-sm font-medium text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                    >
                      לדוח
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
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
// מתורגמים לאותה שפת צבע good/mid/low/unknown, כדי שכל המסכים ידברו את אותו קוד צבעים)
export const TONE_TAG_CLASSES: Record<ScoreToneKind, string> = {
  good: "bg-[#EDF3EC] text-[#346538]",
  mid: "bg-[#FBF3DB] text-[#956400]",
  low: "bg-[#FDEBEC] text-[#9F2F2D]",
  unknown: "bg-[#F1F0EE] text-[#6F6E6A]",
};

export const TONE_TEXT_CLASSES: Record<ScoreToneKind, string> = {
  good: "text-[#346538]",
  mid: "text-[#956400]",
  low: "text-[#9F2F2D]",
  unknown: "text-[#6F6E6A]",
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
  if (!rule.known) return <span className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (rule.earned) {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#EDF3EC] text-[#346538]"
        aria-hidden="true"
      >
        <CheckIcon />
      </span>
    );
  }
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#FDEBEC] text-[#9F2F2D]"
      aria-hidden="true"
    >
      <FailIcon />
    </span>
  );
}

function RuleLine({ rule }: { rule: RuleResult }) {
  if (!rule.known) {
    // שם עברי לבעל העסק, לא מפתח החוק הגולמי (דיווח מייסד) - נפילה חזרה על rule.key רק אם
    // המפה פיגרה אחרי dimensions.ts (לא אמור לקרות, tests/presenter.test.ts נועל את זה)
    return (
      <span className="text-[#6F6E6A]">
        לא נבדק - אין מידע ({RULE_LABEL_HE[rule.key] ?? rule.key})
      </span>
    );
  }
  return <span>{rule.text}</span>;
}

// "מה מונח על השולחן" (loss leads, score measures - שלב א', החלטת מייסד נעולה): בלוק משותף
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
    <section className={`${className} rounded-lg border border-black/[0.06] bg-white p-6`}>
      <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">
        מה מונח על השולחן
      </h2>
      {personal && (
        <div
          className={`mt-4 rounded-md p-4 ${
            personal.kind === "praise" ? "bg-[#EDF3EC]" : "bg-[#FAF1F0]"
          }`}
        >
          <p className={`font-semibold leading-relaxed ${personal.kind === "praise" ? "text-[#346538]" : "text-[#9F2F2D]"}`}>
            {personal.lead}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#6F6E6A]">{personal.anchor}</p>
        </div>
      )}
      {highlights.length > 0 && (
        <ul className="mt-4 space-y-3">
          {highlights.map((h) => (
            <li key={`${h.itemName}-${h.text}`} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9F2F2D]" />
              <p className="leading-relaxed">
                <span className="font-semibold">{h.itemName}</span>
                <span className="text-[#6F6E6A]">{`: ${h.text}`}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DefaultReport({
  report, lossHighlights = [], personalLoss = null,
}: {
  report: ReportView;
  lossHighlights?: LossHighlight[];
  personalLoss?: PersonalLossLine | null;
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
  const tone = scoreTone(overall);

  const headline = narrative?.narrative.headline || `הציון הדיגיטלי של ${business.name}`;
  const summary = narrative?.narrative.summary ?? null;
  const usedFallback = narrative?.usedFallback === true;

  const hasNoGbp = findings.partial.includes("no_gbp");
  // "loss leads, score measures" (החלטת מייסד נעולה): כשיש מה להראות בלוק "מה מונח על השולחן"
  // מוביל, והציון הגדול מצטמצם ל"מדד התקדמות" קומפקטי ליד הכותרת. גם השורה האישית (מדרגה ב)
  // לבדה מצדיקה את הבלוק. אין כלום -> הלייאאוט חוזר בדיוק למוביל-ציון של היום, בלי בלוק ריק
  const hasHighlights = lossHighlights.length > 0 || personalLoss !== null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="flex animate-fade-up items-center justify-between">
        <Link
          href="/"
          className="text-sm text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          אבחון חדש
        </Link>
        <span className="text-sm text-[#6F6E6A]">
          {business.name}
          {business.website && <> · {business.website}</>}
        </span>
      </div>

      {hasHighlights && <LossHighlightsBlock highlights={lossHighlights} personal={personalLoss} />}

      <section className={hasHighlights ? "mt-8 animate-fade-up" : "mt-10 animate-fade-up"} style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-start gap-6">
          {!hasHighlights && (
            <div className="shrink-0">
              {overall == null ? (
                <p className="font-[family-name:var(--font-frank)] text-4xl font-bold text-[#6F6E6A]">
                  אין די מידע
                </p>
              ) : (
                <p
                  className={`font-[family-name:var(--font-frank)] text-7xl font-bold leading-none tabular-nums sm:text-8xl ${TONE_TEXT_CLASSES[tone]}`}
                >
                  {overall}
                  <span className="text-2xl font-normal text-[#6F6E6A]">/100</span>
                </p>
              )}
            </div>
          )}
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-frank)] text-3xl font-bold leading-tight sm:text-4xl">
                {headline}
              </h1>
              {usedFallback && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_TAG_CLASSES.unknown}`}>
                  נוסח אוטומטי
                </span>
              )}
            </div>
            {summary && (
              <p className="mt-2 text-lg leading-relaxed text-[#6F6E6A]">{summary}</p>
            )}
            {/* מדד ההתקדמות הקומפקטי: הגרסה המצומצמת של הציון הגדול, מוצג רק כשבלוק ההפסד כבר
                תפס את תשומת הלב - זה מה שהבעלים חוזר אליו לשפר, לא מה שמוכר */}
            {hasHighlights && (
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[#6F6E6A]">
                  מדד התקדמות
                </span>
                {overall == null ? (
                  <span className="text-sm font-medium text-[#6F6E6A]">אין די מידע</span>
                ) : (
                  <span
                    className={`font-[family-name:var(--font-frank)] text-2xl font-bold tabular-nums ${TONE_TEXT_CLASSES[tone]}`}
                  >
                    {overall}
                    <span className="text-xs font-normal text-[#6F6E6A]">/100</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {hasNoGbp && (
        <div
          className="mt-8 animate-fade-up rounded-lg border border-black/[0.06] bg-[#FDEBEC] p-5 text-[#9F2F2D]"
          style={{ animationDelay: "160ms" }}
        >
          <p className="font-semibold">העסק לא נמצא בגוגל מפות</p>
          <p className="mt-1">
            לקוחות שמחפשים בסביבה פשוט לא רואים אותו. זה הפער המשמעותי ביותר שמצאנו.
          </p>
        </div>
      )}

      {dimensions.length > 0 && (
        <div className="mt-12 divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {dimensions.map((d, i) => (
            <div
              key={d.key}
              className="animate-fade-up py-4"
              style={{ animationDelay: `${240 + i * 80}ms` }}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-frank)] text-lg font-semibold">
                    {d.label}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_TAG_CLASSES[DATA_STATUS_TONE[d.dataStatus]]}`}>
                    {DATA_STATUS_LABEL[d.dataStatus]}
                  </span>
                </span>
                <span className="tabular-nums text-lg font-semibold">
                  {d.score ?? <span className="text-sm font-normal text-[#6F6E6A]">אין מידע</span>}
                </span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-[#6F6E6A] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]">
                  איך חושב הציון?
                </summary>
                <ul className="mt-3 space-y-2 border-s border-black/[0.06] ps-4">
                  {d.rules.map((r) => (
                    <li key={r.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="flex items-start gap-2">
                        <RuleIcon rule={r} />
                        <RuleLine rule={r} />
                      </span>
                      <span className="shrink-0 tabular-nums text-[#6F6E6A]">{r.points} נק'</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}

      {topGaps.length > 0 && (
        <section className="mt-12 animate-fade-up" style={{ animationDelay: "640ms" }}>
          <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">
            הפערים המובילים
          </h2>
          <ul className="mt-3 divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {topGaps.map((g) => {
              const explanation = narrative?.narrative.gapExplanations.find(
                (e) => e.ruleKey === g.ruleKey,
              );
              const explanationText =
                explanation && explanation.explanation !== g.text ? explanation.explanation : null;
              return (
                <li key={g.ruleKey} className="py-3">
                  <p className="font-medium">{g.text}</p>
                  {explanationText && (
                    <p className="mt-1 text-sm text-[#6F6E6A]">{explanationText}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {topStrengths.length > 0 && (
        <section className="mt-10 animate-fade-up" style={{ animationDelay: "720ms" }}>
          <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">
            מה עובד טוב
          </h2>
          <ul className="mt-3 space-y-2">
            {topStrengths.map((s) => (
              <li key={s.ruleKey} className="flex items-start gap-2">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#EDF3EC] text-[#346538]"
                  aria-hidden="true"
                >
                  <CheckIcon />
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {model && nextStep && (
        <section
          className="mt-12 animate-fade-up border-t border-black/[0.06] pt-8"
          style={{ animationDelay: "800ms" }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">
              שלמות האבחון
            </h2>
            <span className="font-[family-name:var(--font-frank)] text-3xl font-bold tabular-nums">
              {model.completenessPct}%
            </span>
          </div>
          <div className="mt-3 h-[2px] w-full rounded-full bg-[#F1F0EE]">
            <div
              className="h-[2px] rounded-full bg-[#111111]"
              style={{ width: `${model.completenessPct}%` }}
            />
          </div>
          <p className="mt-4 text-[#6F6E6A]">{nextStep.reason}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/interview/${report.id}`}
              className="rounded-md bg-[#111111] px-5 py-2.5 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            >
              רוצה דיוק גבוה יותר? ראיון של 5 דקות
            </Link>
            {/* היה כפתור מנוטרל "בקרוב" עד משימה 8 - עכשיו קישור פעיל, לכל סטטוס שממנו מותר
                לבנות/לצפות ב-Roadmap (report_ready/interviewing/roadmap_ready - ראו status.ts).
                כשכבר יש Roadmap קיים (roadmap_ready) הניסוח משתנה כדי לא להטעות כאילו זו הפעלה
                ראשונה - בעל העסק חוזר לראות מה שכבר חושב לו, לא "מדלג" לשום מקום חדש */}
            <Link
              href={`/roadmap/${report.id}`}
              className="rounded-md border border-black/[0.06] px-5 py-2.5 text-[#111111] hover:bg-[#F1F0EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            >
              {report.status === "roadmap_ready" ? "לצפייה ב-Roadmap" : "דלג ל-Roadmap"}
            </Link>
          </div>
        </section>
      )}

      <footer
        className="mt-12 animate-fade-up border-t border-black/[0.06] pt-4 text-xs text-[#6F6E6A]"
        style={{ animationDelay: "880ms" }}
      >
        <p className="tabular-nums">
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
    </main>
  );
}
