"use client";

import Link from "next/link";
import type { ReportView } from "../../server/diagnosis-read";
import type { RoadmapView, RoadmapItemView } from "../../server/roadmap-repo";
import type { ScoreReport } from "../../pipeline/score/types";
import { deriveBusinessMap, type StageStatus } from "../../pipeline/roadmap/business-map";
import { useRoadmap } from "../roadmap/use-roadmap";
import {
  PHASE_LABEL, roadmapLossHighlights, shouldShowCatalogProblem, type ItemBriefStatus,
} from "../roadmap/roadmap-logic";
import { LossHighlightsBlock, TONE_TAG_CLASSES } from "./default-screens";
import type { PersonalLossLine } from "../../pipeline/roadmap/loss-calc";
import type { ScoreToneKind } from "../../pipeline/report/presenter";

// מסך ה-Roadmap בשפת העיצוב הזמנית הקיימת (ראו default-screens.tsx/default-interview.tsx) - אין
// כאן שום לוגיקת עסק, רק תצוגה על גבי useRoadmap. גרסת עיצוב עתידית מחליפה את הקובץ הזה בלבד.

const EMPTY_SCORES: ScoreReport = { overall: null, dimensions: [], topGaps: [], topStrengths: [] };

// אותה שפת צבע good/mid/low/unknown כמו שאר המסך - תקין/חלש/חסר/אין מידע מתורגמים אליה
const STAGE_TONE: Record<StageStatus, ScoreToneKind> = {
  healthy: "good", weak: "mid", missing: "low", unknown: "unknown",
};

const SECONDARY_BTN =
  "rounded-md border border-black/[0.06] px-4 py-2 text-sm text-[#111111] hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";

function BusinessMap({ scores, model }: { scores: ScoreReport; model: ReportView["model"] }) {
  const stages = deriveBusinessMap(scores, model);
  return (
    <section className="mt-12 animate-fade-up" style={{ animationDelay: "80ms" }}>
      <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">
        מפת העסק
      </h2>
      <p className="mt-1 text-sm text-[#6F6E6A]">שרשרת הערך של העסק, שלב אחר שלב</p>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {stages.map((s, i) => (
          <li
            key={s.key}
            className="animate-fade-up rounded-lg border border-black/[0.06] bg-white p-3 text-center"
            style={{ animationDelay: `${120 + i * 60}ms` }}
          >
            <p className="text-sm font-medium">{s.label}</p>
            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${TONE_TAG_CLASSES[STAGE_TONE[s.status]]}`}>
              {s.statusLabel}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CompletenessMeter({ diagnosisId, model }: { diagnosisId: string; model: NonNullable<ReportView["model"]> }) {
  return (
    <section className="mt-10 animate-fade-up rounded-lg border border-black/[0.06] bg-white p-5" style={{ animationDelay: "160ms" }}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold tracking-tight">שלמות האבחון</h2>
        <span className="font-[family-name:var(--font-frank)] text-2xl font-bold tabular-nums">{model.completenessPct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={model.completenessPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="שלמות האבחון"
        className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-[#F1F0EE]"
      >
        <div className="h-[2px] rounded-full bg-[#111111]" style={{ width: `${model.completenessPct}%` }} />
      </div>
      <Link
        href={`/interview/${diagnosisId}`}
        className="mt-4 inline-block text-sm font-medium text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
      >
        שפר את הדיוק - ראיון קצר
      </Link>
    </section>
  );
}

function ConfidenceTag({ confidence }: { confidence: RoadmapItemView["confidence"] }) {
  if (confidence === "high") return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_TAG_CLASSES.mid}`}>
      דיוק ישתפר עם עוד מידע
    </span>
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
      <span className="rounded-md bg-[#EDF3EC] px-4 py-2 text-sm font-medium text-[#346538]">
        קיבלנו - ניצור קשר בהקדם
      </span>
    );
  }
  return (
    <button
      type="button"
      className="rounded-md bg-[#111111] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
      disabled={status === "sending"}
      onClick={onRequest}
      aria-label={`אני רוצה להטמיע את ${item.name}`}
    >
      {status === "sending" ? "שולח" : "אני רוצה להטמיע את זה"}
    </button>
  );
}

function ItemCard({
  item, briefStatus, briefError, onRequest,
}: {
  item: RoadmapItemView;
  briefStatus: ItemBriefStatus;
  briefError: string | undefined;
  onRequest: () => void;
}) {
  return (
    <li className="rounded-lg border border-black/[0.06] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-[family-name:var(--font-frank)] text-lg font-semibold">{item.name}</h3>
            <ConfidenceTag confidence={item.confidence} />
          </div>
          {/* תיקון ממצא שער יציאה אבן דרך 4, בדיקה 2: item.problem הוא ניסוח תחום כללי מהקטלוג
              שיכול לסתור את מצב העסק בפועל (מקרה חי: עסק עם וואטסאפ קיבל "אין דרך מהירה לפנות") -
              מוסתר לפריט כאב-בלבד (confidence="low"), שם ה-reasoning המעוגן-ציטוט הוא הסיפור הכן
              היחיד. ראו shouldShowCatalogProblem, roadmap-logic.ts */}
          {shouldShowCatalogProblem(item) && <p className="mt-1 text-[#6F6E6A]">{item.problem}</p>}
        </div>
        <span className="shrink-0 tabular-nums text-lg font-semibold">
          {item.score}
          <span className="text-sm font-normal text-[#6F6E6A]">/100</span>
        </span>
      </div>

      {item.reasoning && <p className="mt-3 text-sm leading-relaxed">{item.reasoning}</p>}

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[#6F6E6A]">עלות</dt>
          <dd className="font-medium">{item.costRange}</dd>
        </div>
        <div>
          <dt className="text-[#6F6E6A]">חיסכון משוער</dt>
          <dd className="font-medium">{item.savingRange}</dd>
        </div>
        <div>
          <dt className="text-[#6F6E6A]">זמן הטמעה</dt>
          <dd className="font-medium">{item.installTime}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BriefButton item={item} status={briefStatus} onRequest={onRequest} />
        {briefStatus === "error" && briefError && (
          <span className="text-sm text-[#9F2F2D]" role="alert">{briefError}</span>
        )}
      </div>
    </li>
  );
}

export function DefaultRoadmap({
  report, initialRoadmap, personalLoss = null,
}: {
  report: ReportView;
  initialRoadmap: RoadmapView | null;
  personalLoss?: PersonalLossLine | null;
}) {
  const {
    buildPhase, roadmap, error, itemBrief, itemError, groups, rebuild, requestBrief,
  } = useRoadmap(report.id, initialRoadmap);

  const scores = report.scan?.scores ?? EMPTY_SCORES;
  // "idle" קורה רק לרגע קצר לפני שה-effect הראשון ב-useRoadmap יורה build() (כשאין עדיין
  // Roadmap כלל) - מציגים את מצב הבנייה כבר עכשיו כדי שלא יהיה רגע של תוכן ריק לפני שהבקשה יוצאת
  const building = buildPhase === "building" || buildPhase === "idle";

  return (
    <main className="mx-auto max-w-3xl px-4 py-16" aria-busy={building}>
      <div className="flex animate-fade-up items-center justify-between">
        <Link
          href={`/report/${report.id}`}
          className="text-sm text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          חזרה לדוח
        </Link>
        <span className="text-sm text-[#6F6E6A]">{report.business.name}</span>
      </div>

      <h1 className="mt-6 animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight" style={{ animationDelay: "40ms" }}>
        Roadmap להטמעה
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        ההזדמנויות הכי משתלמות לעסק, מדורגות לפי כמה קל ליישם וכמה זה כואב לבעל העסק
      </p>

      <BusinessMap scores={scores} model={report.model} />

      {report.model && <CompletenessMeter diagnosisId={report.id} model={report.model} />}

      <section aria-live="polite" className="mt-12">
        {building && (
          <div className="animate-fade-up rounded-lg border border-black/[0.06] bg-white p-8 text-center">
            <p className="font-medium">
              {roadmap ? "מחשבים Roadmap מעודכן" : "בונים Roadmap - מתאימים הזדמנויות מהקטלוג לעסק שלכם"}
            </p>
            <p className="mt-1 text-sm text-[#6F6E6A]">זה לוקח כמה שניות</p>
          </div>
        )}

        {buildPhase === "error" && (
          <div className="animate-fade-up rounded-lg border border-black/[0.06] bg-[#FDEBEC] p-6 text-[#9F2F2D]">
            <p role="alert">{error}</p>
            <button type="button" className={`mt-3 ${SECONDARY_BTN}`} onClick={() => void rebuild()}>
              נסו שוב
            </button>
          </div>
        )}

        {buildPhase === "ready" && roadmap && (
          <>
            <div className="flex animate-fade-up items-center justify-between">
              <h2 className="font-[family-name:var(--font-frank)] text-xl font-bold tracking-tight">הזדמנויות</h2>
              <button type="button" className={SECONDARY_BTN} disabled={building} onClick={() => void rebuild()}>
                חישוב מחדש
              </button>
            </div>

            {/* "מה מונח על השולחן" (loss leads, score measures - שלב א'): אותו בלוק כמו מסך הדוח,
                מעל קבוצות השלב - מפת העסק ומד השלמות לא זזים ממקומם (ראו קריאה למעלה) */}
            <LossHighlightsBlock highlights={roadmapLossHighlights(roadmap.items)} personal={personalLoss} className="mt-6 animate-fade-up" />

            {roadmap.items.length === 0 ? (
              // כנות לפני רושם (ממצא מייסד 17.8, מסעדת האחים): תוכנית ריקה כשיש פערים בדוח
              // אינה "הבסיס חזק" - זה פער כיסוי של ספריית הפתרונות שלנו, ואומרים את זה ביושר
              scores.topGaps.length > 0 ? (
                <div className="mt-4 animate-fade-up rounded-lg border border-black/[0.06] bg-[#FBF3DB] p-6 text-[#956400]">
                  <p className="font-medium">זיהינו פערים, אבל אין עדיין התאמה בספריית הפתרונות שלנו</p>
                  <p className="mt-1">
                    הדוח מצא נקודות לשיפור, וספריית הפתרונות שלנו מתרחבת כל הזמן - כשיתווספו פתרונות
                    שמתאימים לעסק הזה, התוכנית כאן תתעדכן. השלמת הראיון תעזור לנו לדייק את ההתאמה.
                  </p>
                </div>
              ) : (
                <div className="mt-4 animate-fade-up rounded-lg border border-black/[0.06] bg-[#EDF3EC] p-6 text-[#346538]">
                  <p className="font-medium">לא זיהינו הזדמנויות דחופות כרגע</p>
                  <p className="mt-1">
                    לפי מה שידוע לנו על העסק היום, הבסיס הדיגיטלי כבר די חזק. השלמת הראיון עשויה עדיין
                    לחשוף הזדמנויות שלא נראות מהסריקה בלבד.
                  </p>
                </div>
              )
            ) : (
              <div className="mt-4 space-y-10">
                {groups.map((g, gi) => (
                  <section key={g.phase} className="animate-fade-up" style={{ animationDelay: `${Math.min(gi, 3) * 80}ms` }}>
                    <h3 className="font-[family-name:var(--font-frank)] text-lg font-semibold tracking-tight">
                      {PHASE_LABEL[g.phase]}
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {g.items.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
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
    </main>
  );
}
