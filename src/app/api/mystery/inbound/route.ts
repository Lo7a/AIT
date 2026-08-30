import { prisma } from "../../../../server/db";
import { recordInboundReply, reportCompletedRuns, mysteryDepsFromEnv } from "../../../../server/run-mystery";
import { makeInboundHandler } from "../../../../server/api/mystery-handlers";
import { chooseMailTransport, fetchReceivedEmail } from "../../../../server/mail";

// תשובה שחזרה לכתובת בדיקה של הלקוח הסמוי (משימה 10): webhook של Resend, אירוע email.received.
// החתימה (Svix) מאומתת על הגוף הגולמי; הגוף של המייל נמשך ב-API של Resend; ההתאמה לפנייה
// לפי כתובת הנמען. אם הסבב נסגר בזה - הוא נכתב לדוח מיד, בלי לחכות לתקתוק הבא
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const deps = { ...mysteryDepsFromEnv(), mail: chooseMailTransport() };
  const handler = makeInboundHandler({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    fetchReceived: (emailId) => {
      if (!apiKey) throw new Error("RESEND_API_KEY חסר - אי אפשר למשוך מייל נכנס");
      return fetchReceivedEmail(apiKey, emailId);
    },
    record: async (reply) => {
      const probe = await recordInboundReply(prisma, reply, deps);
      if (probe != null) await reportCompletedRuns(prisma, deps);
      return { matched: probe != null };
    },
  });
  return handler(req);
}
