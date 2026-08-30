import { prisma } from "../../../../server/db";
import { requestMysteryRun, mysteryDepsFromEnv } from "../../../../server/run-mystery";
import { makeRequestMysteryHandler } from "../../../../server/api/mystery-handlers";
import { currentActingUser } from "../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../server/usage-events";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../../server/rate-limit";

// הלקוח הסמוי (משימה 10): "בדוק איך עונים אצלי" - ההסכמה. אותו חיווט בדיוק כמו ה-Brief:
// שומרי בקשה, זהות, מגבלת קצב, תיחום בעלות, ואז האורקסטרטור. ההסכמה נרשמת על בעל האבחון
// (acting.user); בהתחזות האדמין הוא ה-actor ביומן, והבעלים הוא מי שהסכים
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, acting.user, RATE_RULES.mystery);
  if (limited != null) return limited;
  const handler = makeRequestMysteryHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    const result = await requestMysteryRun(prisma, diagnosisId, acting.user.id, mysteryDepsFromEnv());
    await emitUsageEvent(prisma, {
      type: "mystery_requested", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: diagnosisId,
      metadata: { runId: result.runId, channels: result.channels },
    });
    return result;
  });
  return handler(req, id);
}
