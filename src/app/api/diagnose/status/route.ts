import { prisma } from "../../../../server/db";
import { makeStatusHandler } from "../../../../server/api/diagnose-status";
import { findLatestDiagnosis } from "../../../../server/diagnosis-lookup";
import { currentActingUser } from "../../../../server/auth/supabase-server";
import { unauthorizedResponse, userCanAccessDiagnosis } from "../../../../server/auth/guard";

// סטטוס מתוחם בעלות: אבחון זר מוחזר כ"לא נמצא" - אותה תשובה בדיוק כמו אבחון שלא קיים,
// בלי להסגיר שה-uuid או היעד קיימים אצל משתמש אחר
export async function GET(req: Request) {
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const user = acting.user;
  const handler = makeStatusHandler(
    async (id) => {
      if ((await userCanAccessDiagnosis(prisma, user, id).catch(() => null)) !== true) return null;
      const d = await prisma.diagnosis.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
      return d?.status ?? null;
    },
    async (target) => {
      const found = await findLatestDiagnosis(prisma, target).catch(() => null);
      if (!found) return null;
      if ((await userCanAccessDiagnosis(prisma, user, found.diagnosisId).catch(() => null)) !== true) return null;
      return { diagnosisId: found.diagnosisId, status: found.status };
    },
  );
  return handler(req);
}
