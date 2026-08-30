import { prisma } from "../../../../server/db";
import { tickMystery, mysteryDepsFromEnv } from "../../../../server/run-mystery";
import { makeTickHandler } from "../../../../server/api/mystery-handlers";
import { chooseMailTransport } from "../../../../server/mail";

// התקתוק השעתי של הלקוח הסמוי (משימה 10). מי שקורא: pg_cron בסופאבייס דרך pg_net, עם הסוד
// בכותרת x-tick-secret (ראו docs/plans/2026-08-30-mystery-shopper.md). cron של Vercel בתוכנית
// Hobby רץ פעם ביום בלבד - לא מספיק לשליחה בשעה אקראית, ולכן לא הוא.
// בלי MYSTERY_TICK_SECRET בסביבה הנתיב סגור (503)
export async function POST(req: Request) {
  const handler = makeTickHandler({
    secret: process.env.MYSTERY_TICK_SECRET,
    run: () => tickMystery(prisma, { ...mysteryDepsFromEnv(), mail: chooseMailTransport() }),
  });
  return handler(req);
}
