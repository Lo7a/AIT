import { prisma } from "../../../../../server/db";
import { runInterviewTurn } from "../../../../../server/run-interview";
import { makeMessageHandler } from "../../../../../server/api/interview-handlers";

const handler = makeMessageHandler((id, input) => runInterviewTurn(prisma, id, input));

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handler(req, id);
}
