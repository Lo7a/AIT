import type { PrismaClient } from "@prisma/client";
import { pickNextQuestion, QUESTION_BANK, MAX_GUIDED_QUESTIONS } from "../pipeline/interview/questions";
import { extractAnswer, type ExtractOptions } from "../pipeline/interview/extract";
import { applyInterviewUpdates } from "../pipeline/interview/merge";
import { InterviewError, NOT_ACTIVE_MESSAGE } from "../pipeline/interview/contract";
import { recommendNextStep } from "../pipeline/model/business-model";
import { scoreWithModel } from "../pipeline/score/engine";
import { transitionDiagnosis } from "./diagnosis-repo";
import { appendExchange, getInterviewState, type InterviewState } from "./interview-repo";
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
  nextQuestion: { key: string; section: string; text: string } | null;
  recommendFreeText: boolean; // שלמות נמוכה - עדיף לפתוח בסיפור חופשי (recommendNextStep)
}

export interface TurnInput { content: string; questionKey?: string; isFreeText: boolean; }

export interface TurnResult {
  reply: string;
  usedFallback: boolean;
  nextQuestion: InterviewSnapshot["nextQuestion"];
  completenessPct: number;
  credits: Record<string, number>; // ראו InterviewSnapshot.credits
  askedCount: number;
  done: boolean;
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
    nextQuestion: q ? { key: q.key, section: q.section, text: q.text(state.findings, state.model) } : null,
    recommendFreeText: recommendNextStep(state.model).action === "free_text",
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
  const result = await extractAnswer(
    { findings: state.findings, model: state.model, question: extractQuestion, answer: content },
    opts,
  );
  const source = input.isFreeText ? "free_text" as const : "interview" as const;
  const updated = applyInterviewUpdates(state.model, result.updates, source);

  await appendExchange(prisma, diagnosisId, {
    user: { content, questionKey: question?.key, isFreeText: input.isFreeText },
    assistant: { content: result.reply },
  }, updated);

  const askedKeys = question && !state.askedKeys.includes(question.key)
    ? [...state.askedKeys, question.key]
    : state.askedKeys;
  // בוחרים את השאלה הבאה לפי המודל המעודכן (אחרי המיזוג), לא לפי המצב שלפני התור - כך
  // שהתוצאה זהה למה ש-resume (startInterview על אבחון שכבר interviewing) היה מחשב מהמצב השמור.
  // כשהתשובה מזכה את הסקציה (קרדיט 1) עוברים לסקציה החסרה הבאה - שאלה שנייה באותה סקציה
  // (כמו lead_flow_lost) היא רזרבת עומק שמופעלת רק כשהתשובה לא זיכתה את הסקציה.
  const next = pickNextQuestion(updated, state.findings, askedKeys);
  return {
    reply: result.reply,
    usedFallback: result.usedFallback,
    nextQuestion: next
      ? { key: next.key, section: next.section, text: next.text(state.findings, updated) }
      : null,
    completenessPct: updated.completenessPct,
    credits: updated.credits,
    askedCount: askedKeys.length,
    done: next == null,
  };
}

export async function finishInterview(prisma: PrismaClient, diagnosisId: string): Promise<void> {
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
  const scores = scoreWithModel(state.findings, state.model);
  await prisma.scan.update({ where: { id: state.scanId }, data: { scores: scores as unknown as object } });
}
