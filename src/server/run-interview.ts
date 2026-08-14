import type { PrismaClient } from "@prisma/client";
import { pickNextQuestion, QUESTION_BANK, MAX_GUIDED_QUESTIONS } from "../pipeline/interview/questions";
import { extractAnswer, type ExtractOptions } from "../pipeline/interview/extract";
import { applyInterviewUpdates } from "../pipeline/interview/merge";
import { recommendNextStep } from "../pipeline/model/business-model";
import { transitionDiagnosis } from "./diagnosis-repo";
import { appendExchange, getInterviewState, type InterviewState } from "./interview-repo";

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
  if (!state) throw new Error("האבחון לא נמצא או שאין לו סריקה");
  return state;
}

// הערת concurrency למשימות 6/11: שני request מקבילים שקוראים ל-startInterview על אותו diagnosisId
// מתחרים על אותו CAS ב-transitionDiagnosis; המפסיד מקבל "מעבר סטטוס נכשל" (409) ולא באמת שגיאה -
// קליינטים צריכים להתייחס לזה כ"יש לרענן את המצב" (כנראה שהראיון כבר התחיל אצל הבקשה המקבילה)
export async function startInterview(prisma: PrismaClient, diagnosisId: string): Promise<InterviewSnapshot> {
  const state = await loadStateOrThrow(prisma, diagnosisId);
  if (state.status === "interviewing") return snapshotOf(state); // resume שקט
  if (state.status !== "report_ready" && state.status !== "roadmap_ready") {
    throw new Error("אי אפשר להתחיל ראיון לפני שהדוח מוכן");
  }
  await transitionDiagnosis(prisma, diagnosisId, "interviewing");
  return snapshotOf({ ...state, status: "interviewing" });
}

export async function runInterviewTurn(
  prisma: PrismaClient,
  diagnosisId: string,
  input: TurnInput,
  opts: ExtractOptions = {},
): Promise<TurnResult> {
  const content = input.content.trim();
  if (!content) throw new Error("תשובה ריקה, אין מה לשמור");
  const state = await loadStateOrThrow(prisma, diagnosisId);
  if (state.status !== "interviewing") throw new Error("הראיון לא פעיל, יש להתחיל אותו קודם");

  const question = input.questionKey != null
    ? QUESTION_BANK.find((q) => q.key === input.questionKey) ?? null
    : null;
  if (input.questionKey != null && !question) throw new Error("שאלה לא מוכרת");

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
  if (state.status === "report_ready") return; // כבר שם - no-op שקט, סימטרי ל-resume השקט של startInterview
  await transitionDiagnosis(prisma, diagnosisId, "report_ready"); // interviewing עובר; כל סטטוס אחר יזרוק כאן
}
