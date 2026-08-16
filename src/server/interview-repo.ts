import type { PrismaClient, Prisma } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import { deriveBusinessModel, MODEL_SECTIONS, type BusinessModel, type ModelSection } from "../pipeline/model/business-model";
import type { DiagnosisStatus } from "./status";
import { toModelView, toFindings } from "./diagnosis-read";

// שכבת השמירה של הראיון: כל חילופין (תשובה + אישור) נשמר מיידית ואטומית יחד עם המודל
// המעודכן - יציאה באמצע לא מאבדת אף תשובה (אפיון 3.1)

export interface InterviewMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  questionKey: string | null;
  isFreeText: boolean;
  createdAt: Date;
}

export interface InterviewState {
  diagnosisId: string;
  status: DiagnosisStatus;
  messages: InterviewMessageView[];
  askedKeys: string[]; // מפתחות השאלות שכבר נענו (מהודעות המשתמש), ייחודיים
  model: BusinessModel;
  findings: ScanFindings;
  scanId: string; // מזהה שורת הסריקה שממנה נגזרו findings/model - לרענון scores בסיום ראיון (אבן דרך 4, משימה 1)
}

export interface ExchangeInput {
  user: { content: string; questionKey?: string; isFreeText: boolean };
  assistant: { content: string };
}

// שעון מונוטוני קל למקרא createdAt של חילופין: Date.now() לבדו יכול לחזור על עצמו בין שתי קריאות
// סמוכות ל-appendExchange (רזולוציית שעון של מילישנייה מול ריצה בפועל מהירה ממנה - בעיקר בתורות
// חופשיים בלי המתנה ל-LLM) - שומרים את הזמן האחרון שחולק ומוודאים שכל חילופין חדש מתחיל אחריו,
// כדי שהמיון הכרונולוגי יהיה דטרמיניסטי גם בין חילופין נפרדים ולא רק בין שתי השורות שבתוך אחד
let lastExchangeEnd = 0;

export async function appendExchange(
  prisma: PrismaClient,
  diagnosisId: string,
  exchange: ExchangeInput,
  model: BusinessModel,
): Promise<void> {
  const t = Math.max(Date.now(), lastExchangeEnd + 1);
  lastExchangeEnd = t + 1;
  // createdAt מפורש: בתוך טרנזקציה CURRENT_TIMESTAMP קופא, ושתי השורות היו מקבלות אותו זמן -
  // המיון לפי createdAt היה לא-דטרמיניסטי מול Postgres אמיתי (ה-fake מסתיר את זה עם msgSeq)
  await prisma.$transaction([
    prisma.interviewMessage.create({
      data: {
        diagnosisId, role: "user", content: exchange.user.content,
        questionKey: exchange.user.questionKey ?? null, isFreeText: exchange.user.isFreeText,
        createdAt: new Date(t),
      },
    }),
    prisma.interviewMessage.create({
      data: {
        diagnosisId, role: "assistant", content: exchange.assistant.content, questionKey: null, isFreeText: false,
        createdAt: new Date(t + 1),
      },
    }),
    prisma.businessModelRow.upsert({
      where: { diagnosisId },
      update: {
        data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources,
        credits: model.credits, completenessPct: model.completenessPct,
      },
      create: {
        diagnosisId, data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources,
        credits: model.credits, completenessPct: model.completenessPct,
      },
    }),
  ]);
}

export async function getInterviewState(
  prisma: PrismaClient,
  diagnosisId: string,
): Promise<InterviewState | null> {
  const d = await prisma.diagnosis.findUnique({ where: { id: diagnosisId }, select: { id: true, status: true } });
  if (!d) return null;
  const scan = await prisma.scan.findFirst({ where: { diagnosisId }, orderBy: { createdAt: "desc" } });
  if (!scan) return null; // אין סריקה - אין על מה לראיין
  const findings = toFindings(scan.findings);
  const modelRow = await prisma.businessModelRow.findUnique({ where: { diagnosisId } });
  const model: BusinessModel = modelRow ? toModelView(modelRow) : deriveBusinessModel(findings);
  // קרדיטים חסרים (הרחבת MODEL_SECTIONS אחרי ששורת מודל ישנה כבר נשמרה) לא יהפכו לחור ב-completeness
  // באמצע תור - ממלאים 0, בעותק (spread) כדי לא לגעת באובייקט שחזר מ-toModelView
  const credits: Record<ModelSection, number> = { ...model.credits };
  for (const s of MODEL_SECTIONS) if (typeof credits[s] !== "number") credits[s] = 0;
  model.credits = credits;
  const rows = await prisma.interviewMessage.findMany({
    where: { diagnosisId }, orderBy: [{ createdAt: "asc" }, { role: "desc" }],
  });
  const messages: InterviewMessageView[] = rows.map((m) => ({
    id: m.id, role: m.role as "user" | "assistant", content: m.content,
    questionKey: m.questionKey, isFreeText: m.isFreeText, createdAt: m.createdAt,
  }));
  const askedKeys = [...new Set(
    messages.filter((m) => m.role === "user" && m.questionKey != null).map((m) => m.questionKey as string),
  )];
  return { diagnosisId: d.id, status: d.status as DiagnosisStatus, messages, askedKeys, model, findings, scanId: scan.id };
}

// תשובות הכמות מהראיון (מדרגה ב של "ההפסד מוביל", loss-calc.ts): התשובה האחרונה של בעל העסק
// לכל אחת משתי שאלות הכמות, לפי questionKey שנשמר על ההודעה עצמה - מקור דטרמיניסטי, בלי תלות
// בשמות השדות שה-LLM בחר בחילוץ למודל. הסינון על role/questionKey נעשה בזיכרון בכוונה:
// ה-fake בבדיקות מסנן findMany רק לפי diagnosisId, ו-where עשיר יותר היה עובר שם בשקט בלי
// לסנן באמת (הראיון חסום ב-12 שאלות - עשרות שורות לכל היותר, אין כאן בעיית נפח)
export interface QuantityAnswers {
  volume: string | null;       // תשובת lead_flow_volume כלשונה (למשל "10-30"), null אם לא נענתה
  responseTime: string | null; // תשובת lead_flow_response_time כלשונה, null אם לא נענתה
}

export async function getQuantityAnswers(prisma: PrismaClient, diagnosisId: string): Promise<QuantityAnswers> {
  const rows = await prisma.interviewMessage.findMany({
    where: { diagnosisId }, orderBy: [{ createdAt: "asc" }],
  });
  const answers: QuantityAnswers = { volume: null, responseTime: null };
  for (const m of rows) {
    if (m.role !== "user") continue;
    if (m.questionKey === "lead_flow_volume") answers.volume = m.content;
    if (m.questionKey === "lead_flow_response_time") answers.responseTime = m.content;
  }
  return answers;
}
