import { prisma } from "../../../../../server/db";
import { startInterview } from "../../../../../server/run-interview";
import { makeStartHandler } from "../../../../../server/api/interview-handlers";

const handler = makeStartHandler((id) => startInterview(prisma, id));

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handler(req, id);
}
