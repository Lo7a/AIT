import { prisma } from "../../../../../server/db";
import { startInterview } from "../../../../../server/run-interview";
import { makeStartHandler } from "../../../../../server/api/interview-handlers";
import { currentActingUser } from "../../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../../server/usage-events";
import { guardApiRequest } from "../../../../../server/api/request-guards";

// תיחום בעלות בתוך ה-closure - ראו ההערה ב-interview/[id]/route.ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const handler = makeStartHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    const snapshot = await startInterview(prisma, diagnosisId);
    await emitUsageEvent(prisma, {
      type: "interview_started", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: diagnosisId,
    });
    return snapshot;
  });
  return handler(req, id);
}
