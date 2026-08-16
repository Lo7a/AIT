import { prisma } from "../../../server/db";
import { searchBusiness } from "../../../pipeline/google/places";
import { makeSearchHandler } from "../../../server/api/search-handler";
import { getSessionUser } from "../../../server/auth/session";
import { getServerClaims } from "../../../server/auth/supabase-server";
import { unauthorizedResponse } from "../../../server/auth/guard";

const handler = makeSearchHandler(searchBusiness);

// גם החיפוש דורש התחברות - כל קריאה עולה כסף (Places API), אין שירות לאנונימיים
export async function POST(req: Request) {
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  return handler(req);
}
