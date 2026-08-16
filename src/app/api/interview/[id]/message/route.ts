import { prisma } from "../../../../../server/db";
import { runInterviewTurn } from "../../../../../server/run-interview";
import { makeMessageHandler } from "../../../../../server/api/interview-handlers";
import { currentActingUser } from "../../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../../server/usage-events";
import { guardApiRequest } from "../../../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../../../server/rate-limit";

// תיחום בעלות בתוך ה-closure - ראו ההערה ב-interview/[id]/route.ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req, { requireJson: true });
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, acting.user, RATE_RULES.interviewMessage);
  if (limited != null) return limited;
  const handler = makeMessageHandler(async (diagnosisId, input) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    const result = await runInterviewTurn(prisma, diagnosisId, input);
    await emitUsageEvent(prisma, {
      type: "interview_answer", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: diagnosisId,
      metadata: { questionKey: input.questionKey ?? null, isFreeText: input.isFreeText },
    });
    return result;
  });
  return handler(req, id);
}
