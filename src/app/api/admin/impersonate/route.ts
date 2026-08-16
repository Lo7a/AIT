import { prisma } from "../../../../server/db";
import { makeImpersonateHandler } from "../../../../server/api/admin-handlers";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { emitUsageEvent } from "../../../../server/usage-events";

// התחלה/עצירה של התחזות (טופס מעמוד האדמין). הזהות כאן היא תמיד האמיתית (getSessionUser,
// לא currentActingUser) - אדמין שכבר בהתחזות עדיין שולט במתג
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const handler = makeImpersonateHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    findUserById: async (id) => {
      const u = await prisma.user.findUnique({ where: { id } });
      return u != null ? { id: u.id, authId: u.authId, email: u.email, role: u.role } : null;
    },
    emit: (input) => emitUsageEvent(prisma, input),
  });
  return handler(req);
}
