import { prisma } from "../../../../../server/db";
import { finishInterview } from "../../../../../server/run-interview";
import { makeFinishHandler } from "../../../../../server/api/interview-handlers";

const handler = makeFinishHandler((id) => finishInterview(prisma, id));

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handler(req, id);
}
