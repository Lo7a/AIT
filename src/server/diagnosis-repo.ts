import type { PrismaClient, Prisma } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import type { ReportNarrative } from "../pipeline/report/narrative";
import type { BusinessModel } from "../pipeline/model/business-model";
import { assertTransition, type DiagnosisStatus } from "./status";

export interface ScanRow {
  findings: ScanFindings;
  scores: ScoreReport | null;
  narrative: ReportNarrative | null;
  llmCost: number;
  apiCost: number;
  durationMs: number;
}

// ממפה טהור — כל לוגיקת העמודות במקום אחד, נבדק אופליין
export function toScanRow(
  findings: ScanFindings,
  scores: ScoreReport | null,
  narrative: ReportNarrative | null,
): ScanRow {
  return {
    findings,
    scores,
    narrative,
    llmCost: 0, // שכבת החינם של Gemini; יתעדכן כשייבחר מודל ייצור (אפיון 9.3)
    apiCost: findings.meta.estCostUsd,
    durationMs: findings.meta.durationMs,
  };
}

export interface NewDiagnosisInput {
  name: string;
  placeId?: string;
  website?: string;
  city?: string;
}

export async function createDiagnosisForBusiness(
  prisma: PrismaClient,
  input: NewDiagnosisInput,
): Promise<{ businessId: string; diagnosisId: string }> {
  let businessId: string;
  if (input.placeId) {
    const business = await prisma.business.upsert({
      where: { placeId: input.placeId },
      update: { name: input.name, website: input.website, city: input.city },
      create: { name: input.name, placeId: input.placeId, website: input.website, city: input.city },
    });
    businessId = business.id;
  } else {
    // מסלול אתר-בלבד (no_gbp): אין placeId — מזהים לפי האתר
    const existing = await prisma.business.findFirst({ where: { website: input.website } });
    businessId = existing?.id
      ?? (await prisma.business.create({
        data: { name: input.name, website: input.website, city: input.city },
      })).id;
  }
  const diagnosis = await prisma.diagnosis.create({ data: { businessId } });
  return { businessId, diagnosisId: diagnosis.id };
}

export async function transitionDiagnosis(
  prisma: PrismaClient,
  diagnosisId: string,
  to: DiagnosisStatus,
): Promise<void> {
  const current = await prisma.diagnosis.findUniqueOrThrow({
    where: { id: diagnosisId }, select: { status: true },
  });
  assertTransition(current.status as DiagnosisStatus, to);
  await prisma.diagnosis.update({ where: { id: diagnosisId }, data: { status: to } });
}

export async function saveScanResult(
  prisma: PrismaClient,
  diagnosisId: string,
  row: ScanRow,
  model: BusinessModel,
): Promise<void> {
  await prisma.scan.create({
    data: {
      diagnosisId,
      findings: row.findings as object,
      scores: (row.scores ?? undefined) as object | undefined,
      narrative: (row.narrative ?? undefined) as object | undefined,
      llmCost: row.llmCost,
      apiCost: row.apiCost,
      durationMs: row.durationMs,
    },
  });
  await prisma.businessModelRow.upsert({
    where: { diagnosisId },
    update: {
      data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources, credits: model.credits,
      completenessPct: model.completenessPct,
    },
    create: {
      diagnosisId, data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources, credits: model.credits,
      completenessPct: model.completenessPct,
    },
  });
}
