import { prisma } from "../../../../../server/db";
import { finishInterview } from "../../../../../server/run-interview";
import { makeFinishHandler } from "../../../../../server/api/interview-handlers";
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
  const handler = makeFinishHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    await finishInterview(prisma, diagnosisId);
    await emitUsageEvent(prisma, {
      type: "interview_finished", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: diagnosisId,
    });
  });
  return handler(req, id);
}
