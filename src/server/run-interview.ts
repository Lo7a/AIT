import type { PrismaClient } from "@prisma/client";
import { pickNextQuestion, QUESTION_BANK, MAX_GUIDED_QUESTIONS, staticUpdateFor } from "../pipeline/interview/questions";
import { extractAnswer, type ExtractOptions } from "../pipeline/interview/extract";
import { applyInterviewUpdates } from "../pipeline/interview/merge";
import { InterviewError, NOT_ACTIVE_MESSAGE } from "../pipeline/interview/contract";
import { recommendNextStep } from "../pipeline/model/business-model";
import { buildLedger, type LedgerEntry } from "../pipeline/model/ledger";
import { scoreWithModel } from "../pipeline/score/engine";
import type { ScoreReport } from "../pipeline/score/types";
import { generateNarrative, type NarrativeOptions } from "../pipeline/report/narrative";
import { transitionDiagnosis } from "./diagnosis-repo";
import { appendExchange, getInterviewState, quantityAnswersFrom, type InterviewState } from "./interview-repo";
import type { DiagnosisStatus } from "./status";

// אורקסטרטור הראיון: הראיון לא חוסם כלום, ניתן לעצירה בכל רגע, וכל תור נשמר אטומית.
// השאלה הבאה תמיד מחושבת מחדש מהמודל וההיסטוריה - resume בלי מצב נסתר.

export interface InterviewSnapshot {
  status: InterviewState["status"];
  messages: InterviewState["messages"];
  askedCount: number;
  maxQuestions: number;
  completenessPct: number;
  credits: Record<string, number>; // קרדיטים לפי סקציה - כדי שה-UI יציג התקדמות פר-סקציה, לא רק אחוז כולל
  // options/multiSelect (אפיון מחדש-ראיון, החלטה C): מוצגים רק כשהשאלה מגדירה אפשרויות בבנק
  // (questions.ts) - undefined אומר "בלי בחירה מרובה, טקסט חופשי" (כמו שאלת הסיכום היום).
  // options הוא מערך תוויות (string[]) ולא QuestionOption[] המלא - זה כל מה שהתצוגה צריכה כדי
  // לצייר צ'יפים, בלי לגרור טיפוס פנימי של הבנק אל חוזה ה-API.
  nextQuestion: { key: string; section: string; text: string; options?: string[]; multiSelect?: boolean } | null;
  recommendFreeText: boolean; // שלמות נמוכה - עדיף לפתוח בסיפור חופשי (recommendNextStep)
  // פנקס החוסרים (משימה 19): מה חסר לאבחון ומה כל חוסר פותח. נבנה מחדש בכל תור, ולכן הוא
  // מתעדכן חי בזמן הראיון בדיוק כמו scan.scores - זו הדרישה "כל שינוי מתעדכן בלייב"
  ledger: LedgerEntry[];
}

export interface TurnInput { content: string; questionKey?: string; isFreeText: boolean; }

// אישורי הנתיב הסטטי - קצרים, חמים, בלי הד לתשובה (אותו חוזה no-echo כמו הפרומפט של extract.ts)
const STATIC_REPLIES = ["מעולה, ממשיכים.", "רשמתי.", "הבנתי, הלאה.", "טוב, נמשיך."];

export interface TurnResult {
  reply: string;
  usedFallback: boolean;
  nextQuestion: InterviewSnapshot["nextQuestion"];
  completenessPct: number;
  credits: Record<string, number>; // ראו InterviewSnapshot.credits
  askedCount: number;
  done: boolean;
  ledger: LedgerEntry[]; // ראו InterviewSnapshot.ledger - מוחזר בכל תור כדי שהכרטיס יתעדכן מיד
}

export function snapshotOf(state: InterviewState): InterviewSnapshot {
  const q = pickNextQuestion(state.model, state.findings, state.askedKeys);
  return {
    status: state.status,
    messages: state.messages,
    askedCount: state.askedKeys.length,
    maxQuestions: MAX_GUIDED_QUESTIONS,
    completenessPct: state.model.completenessPct,
    credits: state.model.credits,
    nextQuestion: q
      ? {
        key: q.key, section: q.section, text: q.text(state.findings, state.model),
        options: q.options?.map((o) => o.label), multiSelect: q.multiSelect,
      }
      : null,
    recommendFreeText: recommendNextStep(state.model).action === "free_text",
    // תשובות הכמות נגזרות מההודעות שכבר טעונות ב-state, בלי סיבוב נוסף למסד
    ledger: buildLedger(state.findings, state.model, quantityAnswersFrom(state.messages)),
  };
}

async function loadStateOrThrow(prisma: PrismaClient, diagnosisId: string): Promise<InterviewState> {
  const state = await getInterviewState(prisma, diagnosisId);
  if (!state) throw new InterviewError("האבחון לא נמצא או שאין לו סריקה", "not_found");
  return state;
}

// עוטף את transitionDiagnosis: כישלון CAS (שני request מקבילים מתחרים על אותו diagnosisId,
// המפסיד מקבל "מעבר סטטוס נכשל" - ראו diagnosis-repo.ts) הופך ל-InterviewError("conflict") כדי
// ש-interview-handlers.ts ימפה אותו ל-409 בלי היוריסטיקה על תוכן ההודעה. כל שגיאה אחרת (כולל
// מעבר לא-חוקי במכונת המצבים, או תקלת DB) עוברת הלאה בלי שינוי - לא ה-InterviewError שלנו,
// ולכן ה-handler ימפה אותה ל-500 גנרי, לא ל-409 מזויף
async function transitionOrConflict(
  prisma: PrismaClient, diagnosisId: string, to: DiagnosisStatus,
): Promise<void> {
  try {
    await transitionDiagnosis(prisma, diagnosisId, to);
  } catch (err) {
    if (err instanceof Error && err.message.includes("מעבר סטטוס נכשל")) {
      throw new InterviewError(err.message, "conflict");
    }
    throw err;
  }
}

// הערת concurrency למשימות 6/11: שני request מקבילים שקוראים ל-startInterview על אותו diagnosisId
// מתחרים על אותו CAS ב-transitionDiagnosis; המפסיד מקבל 409 ולא באמת שגיאה - קליינטים צריכים
// להתייחס לזה כ"יש לרענן את המצב" (כנראה שהראיון כבר התחיל אצל הבקשה המקבילה)
export async function startInterview(prisma: PrismaClient, diagnosisId: string): Promise<InterviewSnapshot> {
  const state = await loadStateOrThrow(prisma, diagnosisId);
  if (state.status === "interviewing") return snapshotOf(state); // resume שקט
  if (state.status !== "report_ready" && state.status !== "roadmap_ready") {
    throw new InterviewError("אי אפשר להתחיל ראיון לפני שהדוח מוכן", "invalid");
  }
  await transitionOrConflict(prisma, diagnosisId, "interviewing");
  return snapshotOf({ ...state, status: "interviewing" });
}

export async function runInterviewTurn(
  prisma: PrismaClient,
  diagnosisId: string,
  input: TurnInput,
  opts: ExtractOptions = {},
): Promise<TurnResult> {
  const content = input.content.trim();
  if (!content) throw new InterviewError("תשובה ריקה, אין מה לשמור", "invalid");
  const state = await loadStateOrThrow(prisma, diagnosisId);
  if (state.status !== "interviewing") throw new InterviewError(NOT_ACTIVE_MESSAGE, "invalid");

  const question = input.questionKey != null
    ? QUESTION_BANK.find((q) => q.key === input.questionKey) ?? null
    : null;
  if (input.questionKey != null && !question) throw new InterviewError("שאלה לא מוכרת", "invalid");

  const extractQuestion = question
    ? { key: question.key, section: question.section, text: question.text(state.findings, state.model) }
    : null;
  // הנתיב הסטטי (הכרעת מייסד 17.8): תשובת צ'יפים טהורה ממופה דטרמיניסטית בלי LLM בכלל -
  // התור מיידי. כל דבר אחר (טקסט חופשי, "אחר", ניסוח לא תואם, שאלת הסיכום) ממשיך ל-extractAnswer
  const staticUpdate = !input.isFreeText && question != null ? staticUpdateFor(question, content) : null;
  const result = staticUpdate != null
    ? {
      updates: [staticUpdate],
      // גיוון דטרמיניסטי (בלי אקראיות - בדיקות יציבות), באותה רוח של דרישת הגיוון בפרומפט
      reply: STATIC_REPLIES[state.askedKeys.length % STATIC_REPLIES.length],
      usedFallback: false,
    }
    : await extractAnswer(
      { findings: state.findings, model: state.model, question: extractQuestion, answer: content },
      opts,
    );
  const source = input.isFreeText ? "free_text" as const : "interview" as const;
  const updated = applyInterviewUpdates(state.model, result.updates, source);

  await appendExchange(prisma, diagnosisId, {
    user: { content, questionKey: question?.key, isFreeText: input.isFreeText },
    assistant: { content: result.reply },
  }, updated);

  // רענון ציונים תוך כדי הראיון (אבן דרך 4, סגירת שער FAIL 2, שינוי 1): הדוח הוא מסמך חי - כל
  // תשובה שנשמרת בהצלחה אמורה להשתקף בציון מיד, לא רק בסיום הראיון (finishInterview כבר עושה
  // רענון דומה בסיום, ראו שם). פעולה טהורה וזולה (בלי LLM) על המודל המעודכן (updated) - בדיוק
  // כמו שהשאלה הבאה למטה נבחרת לפי updated ולא לפי state שלפני התור. מחוץ לטרנזקציה של
  // appendExchange למעלה בכוונה, אותו נימוק מדויק כמו רענון scores ב-finishInterview: כשל
  // ברענון אסור לגלגל אחורה תשובה ששמורה כבר בהצלחה. try/catch לא-קריטי - מדפיס ולא זורק,
  // כדי שכשל ברענון לעולם לא יפיל תור ראיון
  try {
    const freshScores = scoreWithModel(state.findings, updated);
    await prisma.scan.update({ where: { id: state.scanId }, data: { scores: freshScores as unknown as object } });
  } catch (err) {
    console.error("רענון scores תוך כדי תור ראיון נכשל (לא קריטי - יתעדכן בתור הבא או בסיום):", err instanceof Error ? err.message : err);
  }

  const askedKeys = question && !state.askedKeys.includes(question.key)
    ? [...state.askedKeys, question.key]
    : state.askedKeys;
  // בוחרים את השאלה הבאה לפי המודל המעודכן (אחרי המיזוג), לא לפי המצב שלפני התור - כך
  // שהתוצאה זהה למה ש-resume (startInterview על אבחון שכבר interviewing) היה מחשב מהמצב השמור.
  // מאז משימה 7 הבחירה לא נשענת על קרדיט הסקציה בכלל: אחרי שאלת הפתיחה מגיעות שלוש שאלות
  // הכסף ברצף, ואחריהן סבב רוחב לפי הסקציה שנשאלה הכי מעט (ראו questions.ts).
  const next = pickNextQuestion(updated, state.findings, askedKeys);
  // הפנקס נבנה מההודעות השמורות **בתוספת התשובה של התור הזה** - היא טרם נטענה מחדש מהמסד,
  // ובלעדיה הכרטיס היה מפגר תור אחד אחרי המשתמש ומראה כחסר את מה שהרגע ענה עליו
  const ledger = buildLedger(state.findings, updated, quantityAnswersFrom([
    ...state.messages,
    { role: "user", questionKey: question?.key ?? null, content },
  ]));
  return {
    reply: result.reply,
    usedFallback: result.usedFallback,
    nextQuestion: next
      ? {
        key: next.key, section: next.section, text: next.text(state.findings, updated),
        options: next.options?.map((o) => o.label), multiSelect: next.multiSelect,
      }
      : null,
    completenessPct: updated.completenessPct,
    credits: updated.credits,
    askedCount: askedKeys.length,
    done: next == null,
    ledger,
  };
}

export async function finishInterview(
  prisma: PrismaClient,
  diagnosisId: string,
  // complete מוזרק לצורך רענון הנרטיב (שינוי 2 למטה) - אותו סגנון הזרקה בדיוק כמו opts:
  // ExtractOptions ב-runInterviewTurn: אופציונלי, ברירת המחדל (completeJSON האמיתי) נפתרת
  // עמוק בפנים ב-generateNarrative עצמו ולא כאן - כך שנתיב ה-API היצרני (finish/route.ts)
  // לא צריך לבנות עטיפה בעצמו, בדיוק כמו ש-message/route.ts לא בונה עטיפה סביב extractAnswer
  opts: NarrativeOptions = {},
): Promise<void> {
  const state = await loadStateOrThrow(prisma, diagnosisId);
  // report_ready - כבר שם, no-op שקט, סימטרי ל-resume השקט של startInterview.
  // roadmap_ready - הראיון כבר נסגר בעבר וה-Roadmap כבר חושב ממנו; roadmap_ready->report_ready
  // אינו מעבר חוקי במכונת המצבים (ראו status.ts), אז בלי הבדיקה הזו finish היה נכשל שם ב-409
  // מזויף במקום להתנהג בדיוק כמו report_ready - שניהם "הראיון כבר סגור, אין מה לעשות". שני
  // המסלולים האלה לא מרעננים scores - אין ראיון פעיל שנסגר, אין מה לחשב מחדש (אבן דרך 4, משימה 1)
  if (state.status === "report_ready" || state.status === "roadmap_ready") return;
  await transitionOrConflict(prisma, diagnosisId, "report_ready"); // interviewing עובר; כל סטטוס אחר יזרוק כאן

  // רענון ציונים (אבן דרך 4, משימה 1): ממד process דורש את מודל העסק המעודכן - state.model כבר
  // כולל את כל תורי הראיון (כל תור שומר אותו מיידית ב-appendExchange), אז מספיק לחשב מחדש כאן
  // מה-findings של אותה סריקה עצמה (state.scanId) בלי לחזור ולסרוק.
  // בכוונה לא בתוך אותה טרנזקציה של transitionDiagnosis: ה-CAS הפנימי שלו (קריאת סטטוס נוכחי
  // ואז updateMany מותנה בו) לא נועד להתארח בתוך $transaction חיצוני עם כתיבה לא-קשורה בלי
  // לפרק אותו לשני חלקים ולסבך כל קורא אחר שלו (transitionOrConflict, startInterview) לשם משימה
  // אחת. העדפנו רצף פשוט אחרי הצלחה: אם התהליך קורס בדיוק בין שני הכתובים, הסטטוס כבר עבר
  // ל-report_ready אבל scores עדיין ישנים עד לרענון הבא - לא אי-עקביות מבנית, רק "עוד לא
  // התרענן" (בדיוק כמו שהיה קורה גם לפני המשימה הזו, בין סוף ראיון לרינדור הדוח הבא)
  //
  // סקירת קוד (סבב 2): הכתיבה הזו עטופה ב-try/catch (בדפוס step 5/5ב של run-diagnosis.ts -
  // backfill קוסמטי אחרי שהעיקר כבר הצליח) - המעבר ל-report_ready כבר קרה למעלה, אז שגיאה כאן
  // לא יכולה בלי העטיפה להיזרק החוצה ולגרום ל-caller לחשוב שהראיון לא נסגר, כשבפועל הוא כן
  // נסגר. וזריקה כאן גם הייתה הופכת לתקלה קבועה: finishInterview על סטטוס report_ready הוא
  // no-op שקט (ראו למעלה), אז ניסיון חוזר לא היה מרענן שוב - הכשל היה נצרב לצמיתות במקום להתאושש
  // ברענון הבא (למשל אחרי ראיון עתידי, או ריצת backfill ייעודית)
  let scores: ScoreReport | undefined;
  try {
    scores = scoreWithModel(state.findings, state.model);
    await prisma.scan.update({ where: { id: state.scanId }, data: { scores: scores as unknown as object } });
  } catch (err) {
    console.error("רענון scores אחרי סיום ראיון נכשל (לא קריטי - הראיון כבר נסגר, יתעדכן ברענון הבא):", err instanceof Error ? err.message : err);
  }

  // רענון נרטיב (סגירת שער FAIL 2, שינוי 2 - סוגר בדיקה 7 בשער): scan.scores כבר מתרענן למעלה,
  // אבל עד השינוי הזה scan.narrative לא - הכותרת וההסברים המשיכו לתאר את הפערים שהיו לפני
  // הראיון. אותה קריאת LLM בדיוק כמו run-diagnosis.ts (generateNarrative, אותו guard/fallback,
  // כולל normalizeTypography בפנים), רק על הציונים הטריים שחושבו כרגע. כשל LLM לא נחשב כשל כאן
  // בכלל - generateNarrative בולע אותו בעצמו ומחזיר נרטיב דטרמיניסטי עקבי עם הציונים הטריים
  // ("נוסח אוטומטי" שמתאים למציאות עדיף על ניסוח אלגנטי שכבר לא נכון), וזה בדיוק מה שאמור
  // להישמר. רק קריסה אמיתית של הצעד עצמו (כאן: כשל הכתיבה ל-DB) נבלעת ומשאירה את הנרטיב הישן
  // במקום. תלוי בקיום scores טריים בזיכרון (if (scores)): בלי חישוב ציונים מוצלח למעלה אין
  // בסיס נתונים עדכני לכתוב עליו נרטיב
  if (scores) {
    try {
      const narrative = await generateNarrative(state.findings, scores, opts);
      await prisma.scan.update({ where: { id: state.scanId }, data: { narrative: narrative as unknown as object } });
    } catch (err) {
      console.error("רענון narrative אחרי סיום ראיון נכשל (לא קריטי - הנרטיב הישן נשאר, יתעדכן ברענון הבא):", err instanceof Error ? err.message : err);
    }
  }
}
