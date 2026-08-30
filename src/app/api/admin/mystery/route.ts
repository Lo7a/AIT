import { prisma } from "../../../../server/db";
import { adminMarkProbe, mysteryDepsFromEnv } from "../../../../server/run-mystery";
import { makeAdminMysteryHandler } from "../../../../server/api/mystery-handlers";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { isAdmin } from "../../../../server/auth/guard";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { chooseMailTransport } from "../../../../server/mail";

// הערוצים המסייעים של הלקוח הסמוי (וואטסאפ/טלפון): מישהו מהחברה שלח ביד ומתעד מהמסך.
// אותה תבנית בדיוק כמו לוח המשימות: טופס HTML בלי JS, זהות אמיתית (לא מדומה), handler טהור
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const form = await req.formData();
  const handler = makeAdminMysteryHandler({
    isAdmin: async () => {
      const user = await getSessionUser(prisma, getServerClaims);
      return user != null && isAdmin(user);
    },
    mark: (probeId, action) => adminMarkProbe(prisma, probeId, action, { ...mysteryDepsFromEnv(), mail: chooseMailTransport() }),
  });
  const result = await handler(form);
  if (result.kind === "error") return Response.json({ error: result.message }, { status: result.status });
  return Response.redirect(new URL("/admin/mystery", req.url), 303);
}
