import { prisma } from "../../../../server/db";
import { sendBrief, consoleBriefTransport } from "../../../../server/run-brief";
import { makeBriefHandler } from "../../../../server/api/roadmap-handlers";
import { InterviewError } from "../../../../pipeline/interview/contract";
import { currentActingUser } from "../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../server/usage-events";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../../server/rate-limit";

// חיווט קונקרטי (prisma + מימוש dev של התובלה) - כשיהיה ספק מייל אמיתי (Resend) מחליפים כאן
// בלבד את consoleBriefTransport. תיחום בעלות: הפריט שייך ל-roadmap ששייך לאבחון - העלייה
// בשרשרת קורית כאן (שאילתת select צרה) והבדיקה עצמה ב-guard, עם אותו not_found אחיד
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const { itemId } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, acting.user, RATE_RULES.brief);
  if (limited != null) return limited;
  const handler = makeBriefHandler(async (id) => {
    const item = await prisma.roadmapItem.findUnique({
      where: { id },
      select: { roadmap: { select: { diagnosisId: true } } },
    });
    const diagnosisId = item?.roadmap?.diagnosisId;
    if (diagnosisId == null) throw new InterviewError("הפריט לא נמצא", "not_found");
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    const result = await sendBrief(prisma, consoleBriefTransport, id);
    await emitUsageEvent(prisma, {
      type: "brief_sent", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "roadmap_item", entityId: id,
      metadata: { sent: result.sent },
    });
    return result;
  });
  return handler(req, itemId);
}
