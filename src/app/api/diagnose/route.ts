import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";
import { logDiagnoseEvent } from "../../../server/api/diagnose-log";
import { getSessionUser } from "../../../server/auth/session";
import { getServerClaims } from "../../../server/auth/supabase-server";
import { unauthorizedResponse } from "../../../server/auth/guard";

// סריקה מלאה יכולה לקחת עד ~90 שניות (תקציב PSI) - רלוונטי ל-Vercel בעתיד, לא מקומית
export const maxDuration = 300;

// סריקה דורשת התחברות (תיחום בעלות): המשתמש המחובר מוטבע כבעלי העסק ביצירה, ועסק שכבר
// משויך למשתמש אחר נדחה בזרם עם הודעה כנה (עסק אחד = חשבון אחד, ראו diagnosis-repo.ts)
export async function POST(req: Request) {
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const handler = makeDiagnoseHandler((target, onEvent) => runDiagnosis(prisma, target, {
    ownerUserId: user.id,
    onEvent: (e) => {
      logDiagnoseEvent(e);
      onEvent(e);
    },
  }));
  return handler(req);
}
