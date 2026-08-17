import { after } from "next/server";
import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";
import { logDiagnoseEvent } from "../../../server/api/diagnose-log";
import { findLatestDiagnosis, isRecentInFlight } from "../../../server/diagnosis-lookup";
import { currentActingUser } from "../../../server/auth/supabase-server";
import { unauthorizedResponse, userCanAccessDiagnosis } from "../../../server/auth/guard";
import { guardApiRequest } from "../../../server/api/request-guards";
import { withCallContext } from "../../../server/external-log";
import { enforceGlobalCap, enforceRateLimit, GLOBAL_RULES, RATE_RULES } from "../../../server/rate-limit";
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
  const acting = await currentActingUser(prisma);
  if (acting == null) return unauthorizedResponse();
  const { user, actor } = acting;
  const limited = await enforceRateLimit(prisma, user, RATE_RULES.scan);
  if (limited != null) return limited;
  // הבלם הגלובלי (אחרי המגבלה האישית): תקרת סריקות כלל-מערכתית ליום - הגנה על תקציב ה-API
  // גם מול ריבוי חשבונות (ראו rate-limit.ts, GLOBAL_RULES)
  const capped = await enforceGlobalCap(prisma, user, GLOBAL_RULES.scansPerDay);
  if (capped != null) return capped;
  const handler = makeDiagnoseHandler(
    // withCallContext: קריאות Places/PSI/LLM של הסריקה נרשמות בארכיון עם המשתמש הסורק
    // (האבחון מצטרף להקשר בתוך runDiagnosis ברגע שהוא נוצר)
    (target, onEvent) => withCallContext({ userId: user.id }, () => runDiagnosis(prisma, target, {
      ownerUserId: user.id,
      onEvent: (e) => {
        logDiagnoseEvent(e);
        const usage = usageEventForDiagnoseEvent(e, user.id);
        if (usage != null) void emitUsageEvent(prisma, { ...usage, actorUserId: actor.id });
        onEvent(e);
      },
    })),
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
