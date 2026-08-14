import { prisma } from "../../../../server/db";
import { getInterviewState } from "../../../../server/interview-repo";
import { snapshotOf } from "../../../../server/run-interview";
import { makeStateHandler } from "../../../../server/api/interview-handlers";

// GET לא משנה מצב: מחזיר snapshot של המצב הנוכחי בלי שום מעבר סטטוס
const handler = makeStateHandler(async (id) => {
  const state = await getInterviewState(prisma, id);
  if (!state) throw new Error("האבחון לא נמצא או שאין לו סריקה");
  return snapshotOf(state);
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handler(req, id);
}
