import { prisma } from "../../../../server/db";
import { makeSettingsHandler } from "../../../../server/api/admin-settings-handler";
import { getSessionUser } from "../../../../server/auth/session";
import { getServerClaims } from "../../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../../server/api/request-guards";
import { emitUsageEvent } from "../../../../server/usage-events";

// עריכת מגבלות מהניהול (טופס מעמוד האדמין). הזהות תמיד האמיתית (getSessionUser, לא
// currentActingUser) - בדיוק כמו מתג ההתחזות: אדמין בהתחזות עדיין עורך בשמו האמיתי
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const handler = makeSettingsHandler({
    getRealUser: () => getSessionUser(prisma, getServerClaims),
    readSetting: async (key) => (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null,
    writeSetting: async (key, value) => {
      await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    },
    clearSetting: async (key) => {
      await prisma.appSetting.deleteMany({ where: { key } });
    },
    emit: (input) => emitUsageEvent(prisma, input),
  });
  return handler(req);
}
