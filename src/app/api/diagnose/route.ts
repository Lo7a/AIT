import { after } from "next/server";
import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";
import { logDiagnoseEvent } from "../../../server/api/diagnose-log";
import { findLatestDiagnosis, isRecentInFlight } from "../../../server/diagnosis-lookup";
import { getSessionUser } from "../../../server/auth/session";
import { getServerClaims } from "../../../server/auth/supabase-server";
import { unauthorizedResponse, userCanAccessDiagnosis } from "../../../server/auth/guard";
import { guardApiRequest } from "../../../server/api/request-guards";
import { enforceRateLimit, RATE_RULES } from "../../../server/rate-limit";
import { emitUsageEvent, usageEventForDiagnoseEvent } from "../../../server/usage-events";

// סריקה מלאה יכולה לקחת עד ~90 שניות (תקציב PSI) - רלוונטי ל-Vercel בעתיד, לא מקומית
export const maxDuration = 300;

// סריקה דורשת התחברות (תיחום בעלות): המשתמש המחובר מוטבע כבעלי העסק ביצירה, ועסק שכבר
// משויך למשתמש אחר נדחה בזרם עם הודעה כנה (עסק אחד = חשבון אחד, ראו diagnosis-repo.ts).
// יומן השימוש נגזר מזרם האירועים עצמו (created/done -> usage-events.ts) - בלי לגעת בצנרת;
// onEvent סינכרוני בחוזה (diagnose-events.ts), אז הרישום נורה-ונשכח וכשל בו נבלע בתפר
export async function POST(req: Request) {
  const guard = guardApiRequest(req, { requireJson: true });
  if (guard != null) return guard;
  const user = await getSessionUser(prisma, getServerClaims);
  if (user == null) return unauthorizedResponse();
  const limited = await enforceRateLimit(prisma, user, RATE_RULES.scan);
  if (limited != null) return limited;
  const handler = makeDiagnoseHandler(
    (target, onEvent) => runDiagnosis(prisma, target, {
      ownerUserId: user.id,
      onEvent: (e) => {
        logDiagnoseEvent(e);
        const usage = usageEventForDiagnoseEvent(e, user.id);
        if (usage != null) void emitUsageEvent(prisma, usage);
        onEvent(e);
      },
    }),
    {
      // דה-דופליקציה בצד שרת: סריקה חיה ליעד הזה (של המשתמש עצמו) => 409 במקום סריקה כפולה
      // בתשלום. סריקה חיה של משתמש אחר לא נחשפת כאן - הבקשה ממשיכה ונופלת על שומר הבעלות
      // (diagnosis-repo) עם ההודעה הכנה שלו. סריקה חוזרת של דוח שהסתיים נשארת מותרת בכוונה
      preflight: async (target) => {
        const lookup = target.kind === "places" ? { placeId: target.placeId } : { url: target.url };
        const latest = await findLatestDiagnosis(prisma, lookup).catch(() => null);
        if (!isRecentInFlight(latest)) return null;
        if ((await userCanAccessDiagnosis(prisma, user, latest.diagnosisId).catch(() => null)) !== true) return null;
        return Response.json(
          { error: "האבחון הזה כבר רץ, הדוח יופיע ברשימה בעמוד הראשי בעוד רגע", diagnosisId: latest.diagnosisId },
          { status: 409 },
        );
      },
      // Vercel serverless: הסריקה שרצה חייבת לשרוד ניתוק לקוח באמצע הזרם ("הכול נשמר") -
      // after() מחזיק את האינסטנס עד שהעבודה נגמרת (בגבול maxDuration למעלה)
      keepAlive: (work) => after(() => work),
    },
  );
  return handler(req);
}
