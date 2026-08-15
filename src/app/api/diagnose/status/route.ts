import { prisma } from "../../../../server/db";
import { makeStatusHandler } from "../../../../server/api/diagnose-status";
import { findLatestDiagnosis } from "../../../../server/diagnosis-lookup";

export const GET = makeStatusHandler(
  async (id) => {
    const d = await prisma.diagnosis.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
    return d?.status ?? null;
  },
  async (target) => {
    const found = await findLatestDiagnosis(prisma, target).catch(() => null);
    return found ? { diagnosisId: found.diagnosisId, status: found.status } : null;
  },
);
