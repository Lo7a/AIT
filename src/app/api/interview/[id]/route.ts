import { prisma } from "../../../../server/db";
import { getInterviewState } from "../../../../server/interview-repo";
import { snapshotOf } from "../../../../server/run-interview";
import { makeStateHandler } from "../../../../server/api/interview-handlers";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { assertDiagnosisAccess, unauthorizedResponse } from "../../../../server/auth/guard";

// GET לא משנה מצב: מחזיר snapshot של המצב הנוכחי בלי שום מעבר סטטוס.
// תיחום בעלות: הבדיקה בתוך ה-closure כדי ש-InterviewError(not_found) של אבחון זר יעבור את
// אותו מיפוי סטטוסים בדיוק כמו כל שגיאה אחרת (אותו "לא נמצא" לאבחון חסר ולאבחון של אחר)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const handler = makeStateHandler(async (diagnosisId) => {
    await assertDiagnosisAccess(prisma, user, diagnosisId);
    const state = await getInterviewState(prisma, diagnosisId);
    if (!state) throw new Error("האבחון לא נמצא או שאין לו סריקה");
    return snapshotOf(state);
  });
  return handler(req, id);
}
