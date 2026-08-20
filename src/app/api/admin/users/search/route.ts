import { prisma } from "../../../../../server/db";
import { makeUserSearchHandler } from "../../../../../server/api/admin-user-search";
import { getSessionUser } from "../../../../../server/auth/session";
import { getServerClaims } from "../../../../../server/auth/supabase-server";

export const dynamic = "force-dynamic";

// GET ולכן בלי guardApiRequest: השומר הזה הוא הגנת CSRF ל-POST, וקריאה שאינה משנה דבר
// לא זקוקה לו. השער האמיתי כאן הוא ההרשאה עצמה, בתוך ההאנדלר.
export async function GET(req: Request) {
  const handler = makeUserSearchHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    search: (q, limit) =>
      prisma.user.findMany({
        where: { email: { contains: q, mode: "insensitive" } },
        orderBy: { email: "asc" },
        take: limit,
        select: { id: true, email: true, role: true },
      }),
  });
  return handler(req);
}
