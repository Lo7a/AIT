import { prisma } from "../../../../../server/db";
import { finishInterview } from "../../../../../server/run-interview";
import { makeFinishHandler } from "../../../../../server/api/interview-handlers";
import { getSessionUser } from "../../../../../server/auth/session";
import { getServerClaims } from "../../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../../server/auth/guard";

// תיחום בעלות בתוך ה-closure - ראו ההערה ב-interview/[id]/route.ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const handler = makeFinishHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, user, diagnosisId);
    return finishInterview(prisma, diagnosisId);
  });
  return handler(req, id);
}
