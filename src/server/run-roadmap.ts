import type { PrismaClient } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import type { BusinessModel } from "../pipeline/model/business-model";
import type { LlmUsage } from "../pipeline/llm/client";
import { scoreWithModel } from "../pipeline/score/engine";
import { matchOpportunities, type OpportunityMatch } from "../pipeline/roadmap/matching";
import { scoreOpportunity, phaseOf } from "../pipeline/roadmap/opportunity-score";
import { buildReasoning, type CompleteFn, type ReasoningItemInput } from "../pipeline/roadmap/reasoning";
import { generateNarrative } from "../pipeline/report/narrative";
import { InterviewError } from "../pipeline/interview/contract";
import { toFindings, toModelView } from "./diagnosis-read";
import { transitionDiagnosis } from "./diagnosis-repo";
import { createRoadmap, loadCatalogLite, type RoadmapItemInput } from "./roadmap-repo";
import type { DiagnosisStatus } from "./status";

// אורקסטרטור ה-Roadmap (אבן דרך 4, משימה 5): מחשב ציונים טריים מהממצאים האחרונים + המודל
// המעודכן, מתאים הזדמנויות מהקטלוג, מדרג אותן, מנמק ב-LLM (מוגן - כשל בשכבת הנימוק לעולם לא
// מפיל את ה-Roadmap), ושומר אטומית. Roadmap חדש בכל קריאה - "מחושב מחדש" הוא הזרימה הרגילה, לא
// מקרה קצה (ראו status.ts: roadmap_ready -> interviewing -> roadmap_ready). מאז סגירת שער FAIL 2
// (שינוי 3) הציונים הטריים האלה נכתבים גם ל-scan.scores בסוף הבנייה (לא רק בזיכרון) - ראו הערה
// למטה ליד הכתיבה עצמה.

// roadmap_ready כלול בכוונה - חישוב מחדש (למשל אחרי חזרה לראיון ועוד חזרה ל-roadmap_ready) לא
// אמור להיכשל; ההבדל היחיד מ-report_ready/interviewing הוא שאין צורך במעבר סטטוס (ראו למטה)
const ALLOWED_STATUSES: readonly DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

interface RoadmapState {
  status: DiagnosisStatus;
  findings: ScanFindings;
  model: BusinessModel | null;
  scanId: string; // לכתיבת הציונים הטריים ולהשוואה מול מה ששמור (סגירת שער FAIL 2, שינוי 3)
  storedScores: unknown; // scan.scores כפי שהיה שמור לפני הבנייה הזו - להשוואה בלבד, לא מפוענח לטיפוס
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
    scanId: scan.id,
    storedScores: scan.scores ?? null,
  };
}

// שתי הצורות שכשל מעבר סטטוס לובש ב-transitionDiagnosis (diagnosis-repo.ts): "מעבר סטטוס נכשל"
// (ה-CAS הפסיד למרוץ) ו"מעבר סטטוס לא חוקי" (הסטטוס הנוכחי כבר לא מאפשר את המעבר). שתיהן
// מסמנות כאן את אותו דבר - מישהו הזיז את הסטטוס מתחתינו
const STATUS_RACE_RE = /^מעבר סטטוס (נכשל|לא חוקי)/;

// המעבר ל-roadmap_ready אחרי שה-Roadmap כבר נשמר. state.status נקרא לפני קריאת ה-LLM (שניות),
// ולכן הוא עלול להתיישן: בקשה מקבילה שסיימה קודם כבר העבירה ל-roadmap_ready, ו-
// roadmap_ready -> roadmap_ready אינו מעבר חוקי במכונת המצבים (status.ts) - transitionDiagnosis
// זורק שם שגיאה גולמית שהייתה יוצאת 500 ללקוח (נתפס בסקירה) למרות שה-Roadmap שלו נשמר בהצלחה
// והאבחון כבר במצב היעד. לכן: כל כשל מעבר נבדק מול הסטטוס בפועל - היעד הושג (לא משנה מי הגיע
// לשם) = הצלחה שקטה; הסטטוס במקום אחר לגמרי = InterviewError("conflict") -> 409 בשכבת ה-API
// (אותו דפוס תיוג כמו transitionOrConflict ב-run-interview.ts, בלי היוריסטיקה על תוכן ההודעה)
async function reachStatusOrConflict(prisma: PrismaClient, diagnosisId: string, to: DiagnosisStatus): Promise<void> {
  try {
    await transitionDiagnosis(prisma, diagnosisId, to);
  } catch (err) {
    if (!(err instanceof Error) || !STATUS_RACE_RE.test(err.message)) throw err;
    const current = await prisma.diagnosis.findUnique({ where: { id: diagnosisId }, select: { status: true } });
    if (current?.status === to) return;
    throw new InterviewError(err.message, "conflict");
  }
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

  // ה-Roadmap צריך את התמונה העדכנית ביותר להתאמה עצמה - הציונים האלה גם נכתבים ל-scan.scores
  // בסוף הפונקציה (סגירת שער FAIL 2, שינוי 3), אחרי שהבנייה עצמה כבר הצליחה
  const scores = scoreWithModel(state.findings, state.model);
  const catalog = await loadCatalogLite(prisma);
  const matches = matchOpportunities(scores, state.model, catalog);

  const maxLostPoints = matches.reduce(
    (max, m) => Math.max(max, m.evidence.reduce((sum, e) => sum + e.lostWeightedPoints, 0)),
    0,
  );

  // hasInterviewModel = יש לפחות סקציה אחת במודל עם credit>=1 - זה האות הישיר ל-confidence="high"
  // (ראו opportunity-score.ts, תיקון בדיקה 4 בשער אבן דרך 4). קרדיט 1 מגיע אך ורק מתשובה מאושרת
  // בראיון (business-model.ts: "1 = אושר בראיון") - סקציה שמקורה בסריקה בלבד תקרה תמיד ב-0.5.
  // "model !== null" בפני עצמו לא מספיק: כל סריקה כותבת שורת מודל נגזרת גם בלי אף ראיון
  // (deriveBusinessModel נקרא ללא-תנאי ב-run-diagnosis.ts, saveScanResult כותב אותה תמיד -
  // diagnosis-repo.ts) - ולכן state.model כמעט אף פעם לא null בפועל, וה-null check היה משאיר את
  // הממצא החי פתוח (עסק שנסרק בלי ראיון, מודל נגזר-סריקה 25% שלמות, קיבל high על כל פריט)
  const hasInterviewModel = state.model !== null && Object.values(state.model.credits).some((c) => c >= 1);
  const ranked = matches
    .map((match) => ({ match, ...scoreOpportunity(match, maxLostPoints, hasInterviewModel) }))
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
  // (וגם שם הסטטוס עלול להשתנות תוך כדי - ראו reachStatusOrConflict)
  if (state.status !== "roadmap_ready") {
    await reachStatusOrConflict(prisma, diagnosisId, "roadmap_ready");
  }

  // ריפוי הדוח הישן (סגירת שער FAIL 2, שינוי 3 - סוגר בדיקה 7 בשער): scores למעלה כבר מחושבים
  // טריים לצורך ההתאמה עצמה; עכשיו נכתבים גם ל-scan.scores. זה סוגר שני מסלולים בבת אחת: (א)
  // אבחונים שנסגרו לפני ששינוי 1 (רענון תוך-ראיון) או שינוי 2 (רענון נרטיב בסיום) נחתו - אין
  // backfill חד-פעמי נפרד, הבנייה הבאה של Roadmap כבר מרפאת אותם בעצמה; (ב) המסלול
  // roadmap_ready->interviewing->roadmap_ready שבודק שוב Roadmap אחרי חזרה לראיון ועוקף את
  // finishInterview לגמרי. לא בתוך הטרנזקציה של createRoadmap למעלה, ואחרי שהיא כבר הצליחה -
  // אותו דפוס בדיוק כמו רענון scores ב-finishInterview: כשל כאן לא אמור להפיל Roadmap ששולם
  let scoresChanged = false;
  try {
    scoresChanged = JSON.stringify(scores) !== JSON.stringify(state.storedScores);
    await prisma.scan.update({ where: { id: state.scanId }, data: { scores: scores as unknown as object } });
  } catch (err) {
    console.error("שמירת scores טריים אחרי בניית Roadmap נכשלה (לא קריטי):", err instanceof Error ? err.message : err);
  }

  // נרטיב מתעדכן רק כשהציונים בפועל השתנו - חוסך קריאת LLM מיותרת כשבונים Roadmap פעמיים ברצף
  // בלי שום שינוי אמיתי (למשל חזרה למסך 5 בלי לענות על אף שאלה בראיון). ההשוואה מול מה ששמור
  // *לפני* הבנייה הזו (state.storedScores, נטען למעלה ב-loadStateOrThrow) - לא מול מה שכתבנו
  // הרגע, כדי שההחלטה תשקף שינוי אמיתי בתוכן ולא רק את זה שכתבנו את אותו ערך מחדש. אותו דפוס
  // גנרציה+שמירה כמו finishInterview (שינוי 2) - כשל כאן (LLM/DB) לא מפיל את הבנייה, והנרטיב
  // הישן פשוט נשאר
  if (scoresChanged) {
    try {
      const narrative = await generateNarrative(state.findings, scores, { complete });
      await prisma.scan.update({ where: { id: state.scanId }, data: { narrative: narrative as unknown as object } });
    } catch (err) {
      console.error("רענון narrative אחרי בניית Roadmap נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  return { roadmapId, usage: reasoning.usage };
}
