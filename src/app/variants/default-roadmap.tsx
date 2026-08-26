"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { ReportView } from "../../server/diagnosis-read";
import type { RoadmapView, RoadmapItemView } from "../../server/roadmap-repo";
import type { ScoreReport } from "../../pipeline/score/types";
import { deriveBusinessMap, type StageStatus } from "../../pipeline/roadmap/business-map";
import { useRoadmap } from "../roadmap/use-roadmap";
import {
  PHASE_LABEL, roadmapLossHighlights, shouldShowCatalogProblem, type ItemBriefStatus,
} from "../roadmap/roadmap-logic";
import type { LossHighlight } from "../../pipeline/roadmap/loss-highlights";
import type { PersonalLossLine } from "../../pipeline/roadmap/loss-calc";
import { AppShell } from "../ui/app-shell";
import { ImpersonateSearch } from "../ui/impersonate-search";
import { UserMenu } from "../ui/user-menu";
import { AnchorNav, type AnchorItem } from "../ui/anchor-nav";
import { FillBar } from "../ui/motion";

// מסך ה-Roadmap בשפת העיצוב הנבחרת (הכרעת מייסד 18.8: כהה פרמיום, סגול וברקת, Rubik - ראו
// globals.css) - אין כאן שום לוגיקת עסק, רק תצוגה על גבי useRoadmap. הצבעים/הפאנלים של
// ההפסד וההצלחה מיושמים כאן מקומית (לא נשענים על default-screens.tsx) כדי שכל מסך יחיה
// בקובץ שלו בזמן שהמסכים האחרים מעוצבים במקביל.

const EMPTY_SCORES: ScoreReport = { overall: null, dimensions: [], topGaps: [], topStrengths: [] };

// אותה שפת צבע תקין/חלש/חסר/אין-מידע כמו שאר המערכת (scoreTone: good/mid/low/unknown) -
// מיושמת ישירות על טוקני הצבע של מערכת העיצוב. עקיפות ב-style ולא ב-utilities: כללי globals
// אינם בשכבת tailwind ולכן גוברים על utilities בקסקדה
const STAGE_TAG_STYLE: Record<StageStatus, CSSProperties> = {
  healthy: { color: "var(--acc2-soft)", background: "rgba(var(--acc2-rgb),.09)", borderColor: "rgba(var(--acc2-rgb),.3)" },
  weak: { color: "var(--warn)", background: "rgba(var(--warn-rgb),.09)", borderColor: "rgba(var(--warn-rgb),.3)" },
  missing: { color: "var(--bad)", background: "rgba(var(--bad-rgb),.08)", borderColor: "rgba(var(--bad-rgb),.32)" },
  unknown: { color: "var(--dim)", background: "var(--surface-1)", borderColor: "var(--hair-soft)" },
};

// רקעים מוטים לפאנלים המיוחדים - אותו דפוס בדיוק כמו .cta-core ב-globals (שכבת גרדיאנט מעל var(--core-bg))
const AMBER_CORE_STYLE: CSSProperties = {
  borderColor: "rgba(var(--warn-rgb),.28)",
  background: "radial-gradient(420px 200px at 50% 0%, rgba(var(--warn-rgb),.09), transparent 65%), var(--core-bg)",
};
const GREEN_CORE_STYLE: CSSProperties = {
  borderColor: "rgba(var(--acc2-rgb),.28)",
  background: "radial-gradient(420px 200px at 50% 0%, rgba(var(--acc2-rgb),.09), transparent 65%), var(--core-bg)",
};
const PRAISE_LINE_STYLE: CSSProperties = {
  background: "rgba(var(--acc2-rgb),.07)",
  borderColor: "rgba(var(--acc2-rgb),.3)",
};
const RISK_LINE_STYLE: CSSProperties = {
  background: "rgba(var(--bad-rgb),.06)",
  borderColor: "rgba(var(--bad-rgb),.3)",
};

// החץ בעיגול של קישורי .door-link (globals) - בממשק עברי קדימה = שמאלה
function CapArrow() {
  return (
    <span className="cap" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </span>
  );
}

function BusinessMap({ scores, model }: { scores: ScoreReport; model: ReportView["model"] }) {
  const stages = deriveBusinessMap(scores, model);
  return (
    <div className="shell c12 rv d1">
      <section className="core card-pad">
        <h2 className="card-title">מפת העסק</h2>
        <p className="mb-4 mt-[-8px] text-[12.5px] text-[color:var(--mut)]">שרשרת הערך של העסק, שלב אחר שלב</p>
        <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
          {stages.map((s) => (
            <li
              key={s.key}
              className="rounded-2xl border border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] p-3 text-center"
            >
              <p className="text-[13px] font-semibold">{s.label}</p>
              <span
                className="mt-2 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={STAGE_TAG_STYLE[s.status]}
              >
                {s.statusLabel}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function CompletenessMeter({ diagnosisId, model }: { diagnosisId: string; model: NonNullable<ReportView["model"]> }) {
  return (
    <div className="shell c12 rv d2">
      <section className="core card-pad">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-bold">שלמות האבחון</h2>
          <span className="num text-2xl font-extrabold tracking-[-.02em] text-[color:var(--acc-soft)]">
            {model.completenessPct}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={model.completenessPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="שלמות האבחון"
          className="mt-3 flex"
        >
          <FillBar percent={model.completenessPct} />
        </div>
        <Link href={`/interview/${diagnosisId}`} className="door-link mt-4">
          שפר את הדיוק - ראיון קצר
          <CapArrow />
        </Link>
      </section>
    </div>
  );
}

function ConfidenceTag({ confidence }: { confidence: RoadmapItemView["confidence"] }) {
  if (confidence === "high") return null;
  return (
    <span
      className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
      style={STAGE_TAG_STYLE.weak}
    >
      דיוק ישתפר עם עוד מידע
    </span>
  );
}

// הפסד וחיסכון בראש התוכנית (loss leads, score measures - שלב א'): personal = השורה האישית
// מתשובות הראיון (מדרגה ב, loss-calc.ts), highlights = שורות ה-savingRange כלשונן מהקטלוג
// הנחקר. highlights ריק וגם אין שורה אישית -> שום דבר לא מוצג (אף פעם לא בלוק ריק ומפחיד)
function LossPanel({ highlights, personal }: { highlights: LossHighlight[]; personal: PersonalLossLine | null }) {
  if (highlights.length === 0 && !personal) return null;
  return (
    <div className="shell rv d1 mt-5">
      <section className="core card-pad">
        {personal && (
          <div className="rounded-2xl border p-4" style={personal.kind === "praise" ? PRAISE_LINE_STYLE : RISK_LINE_STYLE}>
            <p
              className="font-bold leading-relaxed"
              style={{ color: personal.kind === "praise" ? "var(--acc2-soft)" : "var(--bad)" }}
            >
              {personal.lead}
            </p>
            <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-[color:var(--mut)]">{personal.anchor}</p>
          </div>
        )}
        {highlights.length > 0 && (
          <>
            {/* אותה תווית בדיוק כמו בשדה הפריט למטה - זה מה שהשורות האלה הן: savingRange מהקטלוג */}
            <h3 className={personal ? "card-title mt-5" : "card-title"}>חיסכון משוער</h3>
            <ul className="space-y-3">
              {highlights.map((h) => (
                <li key={`${h.itemName}-${h.text}`} className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--acc2)]" />
                  <p className="text-[13.5px] leading-relaxed">
                    <span className="font-bold">{h.itemName}</span>
                    <span className="text-[color:var(--mut)]">{`: ${h.text}`}</span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function BriefButton({
  item, status, onRequest,
}: {
  item: RoadmapItemView;
  status: ItemBriefStatus;
  onRequest: () => void;
}) {
  if (status === "requested") {
    return (
      <span
        className="inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-bold text-[color:var(--acc2-soft)]"
        style={PRAISE_LINE_STYLE}
      >
        קיבלנו - ניצור קשר בהקדם
      </span>
    );
  }
  return (
    <button
      type="button"
      className="btn sm"
      disabled={status === "sending"}
      onClick={onRequest}
      aria-label={`אני רוצה להטמיע את ${item.name}`}
    >
      {status === "sending" ? "שולח" : "אני רוצה להטמיע את זה"}
      <CapArrow />
    </button>
  );
}

function ItemCard({
  item, order, briefStatus, briefError, onRequest,
}: {
  item: RoadmapItemView;
  // המיקום בתוכנית כולה (1 והלאה) - נגזר מסדר הפריטים כפי שהגיע מהשרת, לא מחושב כאן
  order: number;
  briefStatus: ItemBriefStatus;
  briefError: string | undefined;
  onRequest: () => void;
}) {
  return (
    <li className="shell c4">
      <div className="core card-pad flex h-full flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className="num text-[34px] font-extrabold leading-none text-[color:var(--acc-soft)]"
            style={{ textShadow: "var(--num-glow)" }}
          >
            {order}
          </span>
          <span className="num text-[15px] font-bold">
            {item.score}
            <span className="text-[11px] font-medium text-[color:var(--dim)]">/100</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[17px] font-bold leading-snug tracking-[-.01em]">{item.name}</h3>
          <ConfidenceTag confidence={item.confidence} />
        </div>

        {/* תיקון ממצא שער יציאה אבן דרך 4, בדיקה 2: item.problem הוא ניסוח תחום כללי מהקטלוג
            שיכול לסתור את מצב העסק בפועל (מקרה חי: עסק עם וואטסאפ קיבל "אין דרך מהירה לפנות") -
            מוסתר לפריט כאב-בלבד (confidence="low"), שם ה-reasoning המעוגן-ציטוט הוא הסיפור הכן
            היחיד. ראו shouldShowCatalogProblem, roadmap-logic.ts */}
        {shouldShowCatalogProblem(item) && (
          <p className="text-[12.5px] text-[color:var(--mut)]">{item.problem}</p>
        )}

        {item.reasoning && <p className="text-[13px] leading-relaxed">{item.reasoning}</p>}

        <dl className="mt-1 grid flex-1 grid-cols-1 content-start gap-x-3 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-[color:var(--dim)]">עלות</dt>
            <dd className="num mt-0.5 text-[12.5px] font-semibold leading-snug">{item.costRange}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[color:var(--dim)]">חיסכון משוער</dt>
            <dd className="num mt-0.5 text-[12.5px] font-semibold leading-snug">{item.savingRange}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[color:var(--dim)]">זמן הטמעה</dt>
            <dd className="num mt-0.5 text-[12.5px] font-semibold leading-snug">{item.installTime}</dd>
          </div>
        </dl>

        <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-dashed border-[color:var(--hair)] pt-3.5">
          <BriefButton item={item} status={briefStatus} onRequest={onRequest} />
          {briefStatus === "error" && briefError && (
            <span className="text-[12.5px] text-[color:var(--bad)]" role="alert">{briefError}</span>
          )}
        </div>
      </div>
    </li>
  );
}

export function DefaultRoadmap({
  report, initialRoadmap, personalLoss = null, isAdmin = false, userEmail = null,
}: {
  report: ReportView;
  initialRoadmap: RoadmapView | null;
  personalLoss?: PersonalLossLine | null;
  isAdmin?: boolean;
  userEmail?: string | null;
}) {
  const {
    buildPhase, roadmap, error, itemBrief, itemError, groups, rebuild, requestBrief,
  } = useRoadmap(report.id, initialRoadmap);

  const scores = report.scan?.scores ?? EMPTY_SCORES;
  // "idle" קורה רק לרגע קצר לפני שה-effect הראשון ב-useRoadmap יורה build() (כשאין עדיין
  // Roadmap כלל) - מציגים את מצב הבנייה כבר עכשיו כדי שלא יהיה רגע של תוכן ריק לפני שהבקשה יוצאת
  const building = buildPhase === "building" || buildPhase === "idle";

  // המיקום הכולל של כל פריט בתוכנית (הקבוצות שומרות על סדר הרשימה השטוחה - ראו groupByPhase):
  // המספר הגדול על הכרטיס הוא סדר תצוגה בלבד, לא ציון
  const orderOf = new Map<string, number>();
  roadmap?.items.forEach((it, i) => orderOf.set(it.id, i + 1));

  // סרגל השלבים הצף: נבנה מהקבוצות שבאמת מרונדרות, כך שהוא לעולם לא מקשר לשלב
  // שאינו על המסך. מתחת לשני שלבים AnchorNav מחזיר null מעצמו
  const phaseAnchors: AnchorItem[] = groups.map((g) => ({
    id: `phase-${g.phase}`,
    label: PHASE_LABEL[g.phase],
  }));

  return (
    <AppShell active="roadmap" diagnosisId={report.id} userLabel={userEmail} isAdmin={isAdmin}>
      {/* שורת הזהות, זהה לדוח ולראיון: על איזה עסק מדובר. הכותרת "תוכנית העבודה" למטה
          אומרת מה זה, ולא למי - וכשיש כמה אבחונים זו בדיוק השאלה (דיווח מייסד 20.8) */}
      <header className="topbar">
        <span className="brand-txt"><small>תוכנית העבודה</small><b>{report.business.name}</b></span>
        <div className="side">
          {isAdmin && <ImpersonateSearch />}
          <UserMenu email={userEmail} isAdmin={isAdmin} />
        </div>
      </header>
      {buildPhase === "ready" && roadmap != null && roadmap.items.length > 0 && (
        <AnchorNav items={phaseAnchors} label="שלבי תוכנית העבודה" />
      )}
      <main aria-busy={building} className="flex-1">
        <div className="board">
          <header className="c12 rv flex flex-wrap items-end justify-between gap-4 px-1 pt-2">
            {/* אותן מחלקות .page-head של שאר המסכים, ולא גדלים משלו - זה המסך שהמייסד
                הצביע עליו כדוגמה, ולכן דווקא הוא צריך לדבר את אותה שפה */}
            <div className="page-head" style={{ margin: 0 }}>
              <h1>תוכנית העבודה</h1>
              <p>ההזדמנויות הכי משתלמות לעסק, מדורגות לפי הצרכים של העסק וקלות היישום</p>
            </div>
            <div className="flex items-center gap-3 pb-1">
              <span className="chip">{report.business.name}</span>
              <Link href={`/report/${report.id}`} className="door-link">
                חזרה לדוח
                <CapArrow />
              </Link>
            </div>
          </header>

          <BusinessMap scores={scores} model={report.model} />

          {report.model && <CompletenessMeter diagnosisId={report.id} model={report.model} />}

          <section aria-live="polite" className="c12 mt-2">
            {building && (
              <div className="shell rv">
                <div className="core card-pad flex flex-col items-center gap-3 py-12 text-center">
                  {/* הדמות מלווה את רגע הבנייה - הספינר נשאר, הוא המידע האמיתי */}
                  <img
                    src="/brand/pointing.webp"
                    alt=""
                    aria-hidden="true"
                    width={96}
                    style={{ pointerEvents: "none" }}
                  />
                  <span
                    aria-hidden="true"
                    className="h-9 w-9 rounded-full border-[3px] border-[rgba(var(--acc-rgb),.25)]"
                    style={{ borderTopColor: "var(--acc)", animation: "rot .8s linear infinite" }}
                  />
                  <p className="font-bold">
                    {roadmap
                      ? "מחשבים תוכנית עבודה מעודכנת"
                      : "בונים את תוכנית העבודה - מתאימים הזדמנויות מספריית הפתרונות לעסק שלכם"}
                  </p>
                  <p className="text-[12.5px] text-[color:var(--mut)]">זה לוקח כמה שניות</p>
                </div>
              </div>
            )}

            {buildPhase === "error" && (
              <div className="shell rv">
                <div className="core card-pad" style={{ borderColor: "rgba(var(--bad-rgb),.3)" }}>
                  <p role="alert" className="font-semibold text-[color:var(--bad)]">{error}</p>
                  <button type="button" className="btn-quiet mt-3" onClick={() => void rebuild()}>
                    נסו שוב
                  </button>
                </div>
              </div>
            )}

            {buildPhase === "ready" && roadmap && (
              <>
                <div className="rv flex flex-wrap items-center justify-between gap-3 px-1">
                  <h2 className="text-lg font-bold tracking-[-.01em]">הזדמנויות</h2>
                  <button type="button" className="btn-quiet" disabled={building} onClick={() => void rebuild()}>
                    חישוב מחדש
                  </button>
                </div>

                {/* ההפסד והחיסכון מובילים (שלב א'): מעל קבוצות השלב - מפת העסק ומד השלמות
                    לא זזים ממקומם (ראו קריאה למעלה) */}
                <LossPanel highlights={roadmapLossHighlights(roadmap.items)} personal={personalLoss} />

                {roadmap.items.length === 0 ? (
                  // כנות לפני רושם (ממצא מייסד 17.8, מסעדת האחים): תוכנית ריקה כשיש פערים בדוח
                  // אינה "הבסיס חזק" - זה פער כיסוי של ספריית הפתרונות שלנו, ואומרים את זה ביושר
                  scores.topGaps.length > 0 ? (
                    <div className="shell rv d1 mt-5">
                      <div
                        className="core card-pad flex flex-col items-center gap-2 py-10 text-center"
                        style={AMBER_CORE_STYLE}
                      >
                        <p className="font-bold text-[color:var(--warn)]">
                          זיהינו פערים, אבל אין עדיין התאמה בספריית הפתרונות שלנו
                        </p>
                        <p className="max-w-[52ch] text-[13px] leading-relaxed text-[color:var(--mut)]">
                          הדוח מצא נקודות לשיפור, וספריית הפתרונות שלנו מתרחבת כל הזמן - כשיתווספו פתרונות
                          שמתאימים לעסק הזה, התוכנית כאן תתעדכן. השלמת הראיון תעזור לנו לדייק את ההתאמה.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="shell rv d1 mt-5">
                      <div
                        className="core card-pad flex flex-col items-center gap-2 py-10 text-center"
                        style={GREEN_CORE_STYLE}
                      >
                        <p className="font-bold text-[color:var(--acc2-soft)]">
                          לא זיהינו הזדמנויות דחופות כרגע
                        </p>
                        <p className="max-w-[52ch] text-[13px] leading-relaxed text-[color:var(--mut)]">
                          לפי מה שידוע לנו על העסק היום, הבסיס הדיגיטלי כבר די חזק. השלמת הראיון עשויה עדיין
                          לחשוף הזדמנויות שלא נראות מהסריקה בלבד.
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="mt-5 space-y-9">
                    {groups.map((g, gi) => (
                      <section
                        key={g.phase}
                        id={`phase-${g.phase}`}
                        data-anchor
                        className={gi === 0 ? "rv d2" : "rv d3"}
                      >
                        <h3 className="mb-3 flex items-center gap-3 px-1 text-[13px] font-bold tracking-[.08em] text-[color:var(--acc-soft)]">
                          {PHASE_LABEL[g.phase]}
                          <span className="h-px flex-1 bg-[color:var(--hair-soft)]" aria-hidden="true" />
                        </h3>
                        <ul className="grid grid-cols-12 gap-3.5">
                          {g.items.map((item) => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              order={orderOf.get(item.id) ?? 0}
                              briefStatus={itemBrief[item.id] ?? "idle"}
                              briefError={itemError[item.id]}
                              onRequest={() => void requestBrief(item.id)}
                            />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
