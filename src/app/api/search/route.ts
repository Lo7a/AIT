import { prisma } from "../../../server/db";
import { searchBusiness } from "../../../pipeline/google/places";
import { makeSearchHandler } from "../../../server/api/search-handler";
import { currentActingUser } from "../../../server/auth/supabase-server";
import { unauthorizedResponse } from "../../../server/auth/guard";
import { guardApiRequest } from "../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../server/rate-limit";
import { emitUsageEvent } from "../../../server/usage-events";

// גם החיפוש דורש התחברות - כל קריאה עולה כסף (Places API), אין שירות לאנונימיים.
// סדר השכבות בכל מסלול מוגן: שומרי בקשה (Origin/JSON) -> סשן -> מגבלת קצב -> הפעולה.
// החיפוש נרשם ביומן (search) - גם בסיס הספירה של המגבלה וגם נתון מוצרי (מה מחפשים)
export async function POST(req: Request) {
  const guard = guardApiRequest(req, { requireJson: true });
  if (guard != null) return guard;
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, acting.user, RATE_RULES.search);
  if (limited != null) return limited;

  const handler = makeSearchHandler(async (query) => {
    const result = await searchBusiness(query);
    await emitUsageEvent(prisma, {
      type: "search", userId: acting.user.id, actorUserId: acting.actor.id, metadata: { query },
    });
    return result;
  });
  return handler(req);
}
