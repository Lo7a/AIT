import { prisma } from "../../../../server/db";
import { makeCatalogHandler } from "../../../../server/api/admin-catalog-handler";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { emitUsageEvent } from "../../../../server/usage-events";

// עריכת ספריית השירותים. הזהות תמיד האמיתית (getSessionUser ולא currentActingUser) -
// אותו כלל כמו ההגדרות וההתחזות: אדמין באמצע התחזות עורך בשמו האמיתי.
//
// הטופס הוא HTML רגיל בלי JS, ולכן התשובה היא הפניה ולא JSON: מי ששולח טופס מצפה
// לחזור למסך, לא לראות אובייקט. ההאנדלר עצמו נשאר טהור ומחזיר נתונים (וכך הוא נבדק
// אופליין), והתרגום ל-HTTP חי כאן.
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;

  const handler = makeCatalogHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    findByName: (name) => prisma.opportunityCatalog.findUnique({ where: { name }, select: { id: true } }),
    create: (input) =>
      prisma.opportunityCatalog.create({
        data: {
          name: input.name, problem: input.problem, solution: input.solution,
          serviceType: input.serviceType, phase: input.phase,
          complexity: input.complexity, installTime: input.installTime,
          costRange: input.costRange, savingRange: input.savingRange,
          conditions: conditionsOf(input),
        },
        select: { id: true },
      }),
    update: async (id, input) => {
      await prisma.opportunityCatalog.update({
        where: { id },
        data: {
          name: input.name, problem: input.problem, solution: input.solution,
          serviceType: input.serviceType, phase: input.phase,
          complexity: input.complexity, installTime: input.installTime,
          costRange: input.costRange, savingRange: input.savingRange,
          conditions: conditionsOf(input),
        },
      });
    },
    setArchived: async (id, archived) => {
      await prisma.opportunityCatalog.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
    },
    addBenchmark: async (catalogId, b) => {
      await prisma.benchmark.create({ data: { ...b, catalogId } });
    },
    removeBenchmark: async (benchmarkId) => {
      await prisma.benchmark.delete({ where: { id: benchmarkId } });
    },
    emit: (input) => emitUsageEvent(prisma, input),
  });

  const res = await handler(req);
  const body = (await res.clone().json().catch(() => null)) as { id?: string; error?: string } | null;

  // 401/404 נשארים כפי שהם - הם לא תוצאה של טופס אלא של הרשאה
  if (res.status === 401 || res.status === 404) return res;

  const back = new URL(req.url);
  if (res.ok && body?.id) {
    back.pathname = `/admin/catalog/${body.id}`;
    back.search = "?saved=1";
  } else {
    // חוזרים למסך שממנו נשלח הטופס, עם השגיאה - כדי שלא ייעלם מה שהוקלד
    const referer = req.headers.get("referer");
    back.pathname = referer != null ? new URL(referer).pathname : "/admin/catalog";
    back.search = `?error=${encodeURIComponent(body?.error ?? "השמירה נכשלה")}`;
  }
  return Response.redirect(back, 303);
}

// conditions הוא Json אחד בסכמה. industries נכתב **רק** כשהפריט ענפי - פריט כללי
// לא מקבל שדה ריק, כי מערך ריק פירושו "לא מתאים לאף ענף" (ראו matching.ts)
function conditionsOf(input: { gapKeys: string[]; industries: string[] | null }) {
  return input.industries == null
    ? { gapKeys: input.gapKeys }
    : { gapKeys: input.gapKeys, industries: input.industries };
}
