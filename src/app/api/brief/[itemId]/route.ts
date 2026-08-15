import { prisma } from "../../../../server/db";
import { sendBrief, consoleBriefTransport } from "../../../../server/run-brief";
import { makeBriefHandler } from "../../../../server/api/roadmap-handlers";

// חיווט קונקרטי (prisma + מימוש dev של התובלה) - אותו דפוס בדיוק כמו roadmap/[id]/route.ts:
// ה-handler עצמו (roadmap-handlers.ts) לא יודע כלום על prisma/console.log, רק מקבל פונקציה
// מוזרקת. כשיהיה ספק מייל אמיתי (Resend) - מחליפים כאן בלבד את consoleBriefTransport
const briefHandler = makeBriefHandler((itemId) => sendBrief(prisma, consoleBriefTransport, itemId));

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  return briefHandler(req, itemId);
}
