import { prisma } from "../../../../server/db";
import { makeAgentChatPostHandler, sendMessage } from "../../../../server/agent-chat";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { emitUsageEvent } from "../../../../server/usage-events";

// שליחת הודעה לערוץ הסוכנים מהמסך בניהול. הזהות תמיד האמיתית (getSessionUser) - אותו
// כלל כמו עורך הספרייה, ואותה תבנית: טופס HTML בלי JS, ההאנדלר טהור והתרגום להפניה כאן
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;

  const handler = makeAgentChatPostHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    send: (author, body, thread) => sendMessage(prisma, author, body, thread),
    emit: (input) => emitUsageEvent(prisma, input),
  });

  const result = await handler(await req.formData());
  if (result.kind === "error") return Response.json({ error: result.message }, { status: result.status });
  return Response.redirect(new URL("/admin/agents?sent=1", req.url), 303);
}
