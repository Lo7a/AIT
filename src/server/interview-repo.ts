import type { PrismaClient, Prisma } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import { deriveBusinessModel, type BusinessModel } from "../pipeline/model/business-model";
import type { DiagnosisStatus } from "./status";

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
}

export interface ExchangeInput {
  user: { content: string; questionKey?: string; isFreeText: boolean };
  assistant: { content: string };
}

export async function appendExchange(
  prisma: PrismaClient,
  diagnosisId: string,
  exchange: ExchangeInput,
  model: BusinessModel,
): Promise<void> {
  await prisma.$transaction([
    prisma.interviewMessage.create({
      data: {
        diagnosisId, role: "user", content: exchange.user.content,
        questionKey: exchange.user.questionKey ?? null, isFreeText: exchange.user.isFreeText,
      },
    }),
    prisma.interviewMessage.create({
      data: { diagnosisId, role: "assistant", content: exchange.assistant.content, questionKey: null, isFreeText: false },
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
  const findings = scan.findings as unknown as ScanFindings;
  const modelRow = await prisma.businessModelRow.findUnique({ where: { diagnosisId } });
  const model: BusinessModel = modelRow
    ? {
        data: modelRow.data as BusinessModel["data"],
        fieldSources: modelRow.fieldSources as BusinessModel["fieldSources"],
        credits: modelRow.credits as BusinessModel["credits"],
        completenessPct: modelRow.completenessPct,
      }
    : deriveBusinessModel(findings);
  const rows = await prisma.interviewMessage.findMany({
    where: { diagnosisId }, orderBy: { createdAt: "asc" },
  });
  const messages: InterviewMessageView[] = rows.map((m) => ({
    id: m.id, role: m.role as "user" | "assistant", content: m.content,
    questionKey: m.questionKey, isFreeText: m.isFreeText, createdAt: m.createdAt,
  }));
  const askedKeys = [...new Set(
    messages.filter((m) => m.role === "user" && m.questionKey != null).map((m) => m.questionKey as string),
  )];
  return { diagnosisId: d.id, status: d.status as DiagnosisStatus, messages, askedKeys, model, findings };
}
