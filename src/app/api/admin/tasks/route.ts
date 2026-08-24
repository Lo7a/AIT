import { prisma } from "../../../../server/db";
import { makeTaskPostHandler, createTask, updateTask } from "../../../../server/tasks";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { emitUsageEvent } from "../../../../server/usage-events";

// יצירה ועריכה של משימות מהמסך בניהול. אותה תבנית בדיוק כמו הערוץ ועורך הספרייה:
// טופס HTML בלי JS, זהות אמיתית (getSessionUser), האנדלר טהור והתרגום להפניה כאן
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;

  const form = await req.formData();
  const handler = makeTaskPostHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    create: (author, input) => createTask(prisma, author, input),
    update: (author, num, input) => updateTask(prisma, author, num, input),
    emit: (input) => emitUsageEvent(prisma, input),
  });

  const result = await handler(form);
  if (result.kind === "error") return Response.json({ error: result.message }, { status: result.status });

  const action = form.get("action");
  const target = action === "create" ? `/admin/tasks?created=${result.num}` : `/admin/tasks/${result.num}`;
  return Response.redirect(new URL(target, req.url), 303);
}
