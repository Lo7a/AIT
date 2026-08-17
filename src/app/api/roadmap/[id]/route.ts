import { prisma } from "../../../../server/db";
import { completeJSON } from "../../../../pipeline/llm/client";
import type { CompleteFn } from "../../../../pipeline/roadmap/reasoning";
import { buildRoadmap } from "../../../../server/run-roadmap";
import { getRoadmapView } from "../../../../server/roadmap-repo";
import { InterviewError } from "../../../../pipeline/interview/contract";
import { makeBuildHandler, makeViewHandler } from "../../../../server/api/roadmap-handlers";
import { currentActingUser } from "../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../server/auth/guard";
import { emitUsageEvent } from "../../../../server/usage-events";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../../server/rate-limit";
import { withCallContext } from "../../../../server/external-log";

// עוטף את completeJSON כ-CompleteFn - אותו דפוס בדיוק כמו ברירת המחדל הפנימית ב-extract.ts/
// narrative.ts (opts.complete ?? completeJSON), רק שכאן זה חובה: buildRoadmap מקבל complete
// כפרמטר חיוני (לא אופציונלי) כי אין לו נקודת קריאה נוספת שמזריקה ברירת מחדל בעצמה
const complete: CompleteFn = async (prompt) => {
  const r = await completeJSON<unknown>(prompt, { context: "roadmap_reasoning" });
  return { data: r.data, usage: r.usage };
};

// תיחום בעלות בתוך ה-closures (כמו interview/[id]/route.ts) - אבחון זר מקבל בדיוק את אותו
// not_found כמו אבחון שלא קיים

// { roadmapId } בלבד בתשובה - buildRoadmap מחזיר גם usage (למטרות מדידה פנימיות), אבל הצורה
// הציבורית של ה-API מצומצמת בכוונה (ראו האפיון של המשימה); ה-destructuring כאן הוא נקודת החיתוך
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const { id } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, acting.user, RATE_RULES.roadmapBuild);
  if (limited != null) return limited;
  const handler = makeBuildHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    // הקשר לארכיון הקריאות: נימוקי ה-roadmap נרשמים עם המשתמש והאבחון
    const { roadmapId } = await withCallContext(
      { userId: acting.user.id, diagnosisId },
      () => buildRoadmap(prisma, complete, diagnosisId),
    );
    await emitUsageEvent(prisma, {
      type: "roadmap_built", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: diagnosisId,
    });
    return { roadmapId };
  });
  return handler(req, id);
}

// getRoadmapView מחזיר null כש"אין עדיין Roadmap" (זה לא מצב שגיאה מבחינתה - ראו roadmap-repo.ts),
// וה-route הוא שממיר את זה ל-InterviewError("not_found") כדי לקבל 404 עקבי עם שאר ה-API
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const handler = makeViewHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, acting.user, diagnosisId);
    const view = await getRoadmapView(prisma, diagnosisId);
    if (!view) throw new InterviewError("אין Roadmap לאבחון הזה", "not_found");
    return view;
  });
  return handler(req, id);
}
