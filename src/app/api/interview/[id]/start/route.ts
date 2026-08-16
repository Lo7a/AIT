import { prisma } from "../../../../../server/db";
import { startInterview } from "../../../../../server/run-interview";
import { makeStartHandler } from "../../../../../server/api/interview-handlers";
import { getSessionUser } from "../../../../../server/auth/session";
import { getServerClaims } from "../../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../../server/usage-events";
import { guardApiRequest } from "../../../../../server/api/request-guards";

// תיחום בעלות בתוך ה-closure - ראו ההערה ב-interview/[id]/route.ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const handler = makeStartHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, user, diagnosisId);
    const snapshot = await startInterview(prisma, diagnosisId);
    await emitUsageEvent(prisma, {
      type: "interview_started", userId: user.id, entityType: "diagnosis", entityId: diagnosisId,
    });
    return snapshot;
  });
  return handler(req, id);
}
