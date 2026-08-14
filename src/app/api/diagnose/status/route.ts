import { prisma } from "../../../../server/db";
import { makeStatusHandler } from "../../../../server/api/diagnose-status";

export const GET = makeStatusHandler(async (id) => {
  const d = await prisma.diagnosis.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
  return d?.status ?? null;
});
