import type { PrismaClient } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import type { BusinessModel } from "../pipeline/model/business-model";
import type { LlmUsage } from "../pipeline/llm/client";
import { scoreWithModel } from "../pipeline/score/engine";
import { matchOpportunities, type CatalogRowLite, type OpportunityMatch } from "../pipeline/roadmap/matching";
import { scoreOpportunity, phaseOf } from "../pipeline/roadmap/opportunity-score";
import { buildReasoning, type CompleteFn, type ReasoningItemInput } from "../pipeline/roadmap/reasoning";
import { InterviewError } from "../pipeline/interview/contract";
import { toFindings, toModelView } from "./diagnosis-read";
import { transitionDiagnosis } from "./diagnosis-repo";
import { createRoadmap, type RoadmapItemInput } from "./roadmap-repo";
import type { DiagnosisStatus } from "./status";

// אורקסטרטור ה-Roadmap (אבן דרך 4, משימה 5): מחשב ציונים טריים מהממצאים האחרונים + המודל
// המעודכן בזיכרון בלבד (בלי לגעת ב-scan.scores השמור - זה תפקידו של finishInterview, ראו
// run-interview.ts משימה 1), מתאים הזדמנויות מהקטלוג, מדרג אותן, מנמק ב-LLM (מוגן - כשל בשכבת
// הנימוק לעולם לא מפיל את ה-Roadmap), ושומר אטומית. Roadmap חדש בכל קריאה - "מחושב מחדש" הוא
// הזרימה הרגילה, לא מקרה קצה (ראו status.ts: roadmap_ready -> interviewing -> roadmap_ready).

// roadmap_ready כלול בכוונה - חישוב מחדש (למשל אחרי חזרה לראיון ועוד חזרה ל-roadmap_ready) לא
// אמור להיכשל; ההבדל היחיד מ-report_ready/interviewing הוא שאין צורך במעבר סטטוס (ראו למטה)
const ALLOWED_STATUSES: readonly DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

interface RoadmapState {
  status: DiagnosisStatus;
  findings: ScanFindings;
  model: BusinessModel | null;
}

// בכוונה לא משתמשים ב-getInterviewState (interview-repo.ts): הוא מקפל "אבחון לא קיים" ו"אין
// סריקה" לאותו null אחד, ומשתמש ב-deriveBusinessModel כברירת מחדל כשאין שורת מודל שמורה - שני
// דברים שמתאימים לזרימת הראיון (צריך מודל עבודה גם לפני תשובה ראשונה) אבל לא ל-Roadmap, שצריך
// להבדיל not_found מ-invalid (המשימה) ולהתייחס ל"אין ראיון בכלל" כ-model=null אמיתי (בדיוק כמו
// getReport/diagnosis-read.ts) כדי ש-matching.ts יתייחס נכון ל"אין ראיון" (confidence נמוך/בינוני
// בלבד, בלי ציטוטי כאב מומצאים)
async function loadStateOrThrow(prisma: PrismaClient, diagnosisId: string): Promise<RoadmapState> {
  const d = await prisma.diagnosis.findUnique({ where: { id: diagnosisId }, select: { id: true, status: true } });
  if (!d) throw new InterviewError("האבחון לא נמצא", "not_found");
  const scan = await prisma.scan.findFirst({ where: { diagnosisId }, orderBy: { createdAt: "desc" } });
  if (!scan) throw new InterviewError("אין סריקה לאבחון הזה - אי אפשר לבנות Roadmap בלי ממצאי סריקה", "invalid");
  const modelRow = await prisma.businessModelRow.findUnique({ where: { diagnosisId } });
  return {
    status: d.status as DiagnosisStatus,
    findings: toFindings(scan.findings),
    model: modelRow ? toModelView(modelRow) : null,
  };
}

// עוטף את transitionDiagnosis: כישלון CAS (בקשה מקבילה שכבר הזיזה את הסטטוס) הופך ל-
// InterviewError("conflict") - אותו דפוס בדיוק כמו transitionOrConflict ב-run-interview.ts,
// כדי ששכבת ה-API (משימה 6) תמפה אותו ל-409 בלי היוריסטיקה על תוכן ההודעה
async function transitionOrConflict(prisma: PrismaClient, diagnosisId: string, to: DiagnosisStatus): Promise<void> {
  try {
    await transitionDiagnosis(prisma, diagnosisId, to);
  } catch (err) {
    if (err instanceof Error && err.message.includes("מעבר סטטוס נכשל")) {
      throw new InterviewError(err.message, "conflict");
    }
    throw err;
  }
}

async function loadCatalog(prisma: PrismaClient): Promise<CatalogRowLite[]> {
  const rows = await prisma.opportunityCatalog.findMany({
    select: {
      id: true, name: true, problem: true, solution: true, conditions: true,
      costRange: true, savingRange: true, complexity: true, installTime: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    problem: r.problem,
    solution: r.solution,
    conditions: r.conditions as { gapKeys: string[] },
    costRange: r.costRange,
    savingRange: r.savingRange,
    complexity: r.complexity,
    installTime: r.installTime,
  }));
}

// סדר סופי לשמירה/קריאה: score (הציון הסופי, אחרי בונוס כאב/עונש ודאות/התאמת מורכבות - לא
// lostWeightedPoints הגולמי ש-matchOpportunities ממיין לפיו) יורד, ואז שם קטלוג כשובר שוויון
// יציב. השוואת מחרוזות רגילה (לא localeCompare) בכוונה - תוצאה זהה בכל סביבת ריצה
function compareByScoreThenName(
  a: { score: number; match: OpportunityMatch },
  b: { score: number; match: OpportunityMatch },
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.match.catalog.name < b.match.catalog.name) return -1;
  if (a.match.catalog.name > b.match.catalog.name) return 1;
  return 0;
}

export async function buildRoadmap(
  prisma: PrismaClient,
  complete: CompleteFn,
  diagnosisId: string,
): Promise<{ roadmapId: string; usage: LlmUsage }> {
  const state = await loadStateOrThrow(prisma, diagnosisId);
  if (!ALLOWED_STATUSES.includes(state.status)) {
    throw new InterviewError("אי אפשר לבנות Roadmap במצב הנוכחי של האבחון", "invalid");
  }

  // ציונים טריים בזיכרון בלבד - לא כותבים ל-scan.scores כאן (זה תפקיד finishInterview, אבן
  // דרך 4 משימה 1); ה-Roadmap צריך את התמונה העדכנית ביותר להתאמה עצמה, לא לרענון הדוח השמור
  const scores = scoreWithModel(state.findings, state.model);
  const catalog = await loadCatalog(prisma);
  const matches = matchOpportunities(scores, state.model, catalog);

  const maxLostPoints = matches.reduce(
    (max, m) => Math.max(max, m.evidence.reduce((sum, e) => sum + e.lostWeightedPoints, 0)),
    0,
  );

  const ranked = matches
    .map((match) => ({ match, ...scoreOpportunity(match, maxLostPoints) }))
    .sort(compareByScoreThenName);

  const reasoningInputs: ReasoningItemInput[] = ranked.map(({ match }) => ({
    problem: match.catalog.problem,
    solution: match.catalog.solution,
    evidenceTexts: match.evidence.map((e) => e.text),
    painQuotes: match.painQuotes,
  }));

  // כשל בשכבת הנימוק (רשת/LLM/תקלה פנימית) לא מפיל Roadmap: buildReasoning כבר בולע כשלי
  // complete() פנימית ומחזיר תבנית דטרמיניסטית לכל פריט (reasoning.ts) - ה-try/catch כאן הוא
  // הגנה נוספת מפני תקלה בלתי צפויה בשכבה עצמה, כדי שאף תרחיש לא יוכל להפיל את יצירת ה-Roadmap
  let reasoning: { sentences: (string | null)[]; usage: LlmUsage };
  try {
    reasoning = await buildReasoning(complete, reasoningInputs);
  } catch {
    reasoning = { sentences: ranked.map(() => null), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const items: RoadmapItemInput[] = ranked.map((r, i) => ({
    catalogId: r.match.catalog.id,
    score: r.score,
    confidence: r.confidence,
    phase: phaseOf(r.match),
    reasoning: reasoning.sentences[i] ?? null,
  }));

  const roadmapId = await createRoadmap(prisma, diagnosisId, items);

  // roadmap_ready -> roadmap_ready אינו מעבר חוקי במכונת המצבים (status.ts) - חישוב מחדש
  // מ-roadmap_ready נשאר שם בלי ניסיון מעבר; רק report_ready/interviewing דורשים CAS אמיתי
  if (state.status !== "roadmap_ready") {
    await transitionOrConflict(prisma, diagnosisId, "roadmap_ready");
  }

  return { roadmapId, usage: reasoning.usage };
}
