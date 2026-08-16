import { prisma } from "../../../../../server/db";
import { runInterviewTurn } from "../../../../../server/run-interview";
import { makeMessageHandler } from "../../../../../server/api/interview-handlers";
import { getSessionUser } from "../../../../../server/auth/session";
import { getServerClaims } from "../../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../../server/usage-events";
import { guardApiRequest } from "../../../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../../../server/rate-limit";

// תיחום בעלות בתוך ה-closure - ראו ההערה ב-interview/[id]/route.ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req, { requireJson: true });
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, user, RATE_RULES.interviewMessage);
  if (limited != null) return limited;
  const handler = makeMessageHandler(async (diagnosisId, input) => {
    await assertDiagnosisAccess(prisma, user, diagnosisId);
    const result = await runInterviewTurn(prisma, diagnosisId, input);
    await emitUsageEvent(prisma, {
      type: "interview_answer", userId: user.id, entityType: "diagnosis", entityId: diagnosisId,
      metadata: { questionKey: input.questionKey ?? null, isFreeText: input.isFreeText },
    });
    return result;
  });
  return handler(req, id);
}
