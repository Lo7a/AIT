import { prisma } from "../../../server/db";
import { makeCallbackHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, getServerClaims } from "../../../server/auth/supabase-server";
import { getSessionUser } from "../../../server/auth/session";
import { emitUsageEvent } from "../../../server/usage-events";

// חזרה עם code: גם קישור המייל בתצורת ברירת המחדל (ConfirmationURL -> emailRedirectTo) וגם
// Google OAuth כשיחובר - שניהם נוחתים כאן ומוחלפים לסשן; שורת המראה נוצרת מיד אחרי, והכניסה
// נרשמת ביומן (method: oauth - במסלול הזה אין דרך אמינה להבדיל מייל-דרך-callback מגוגל,
// והבידול המדויק ממילא קיים אצל Supabase; מספיק לנו סוג המסלול)
export async function GET(req: Request) {
  const handler = makeCallbackHandler(
    async (code) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      // פירוט הכשל בלוג השרת בלבד (הלקוח מקבל את הודעת הקישור הגנרית) - בלעדיו אי אפשר
      // להבדיל בין code שכבר מומש, verifier שחסר (דפדפן אחר באמצע הזרימה) או תקלת ספק
      if (error != null) console.error("auth callback: exchange failed:", error.message);
      return error == null;
    },
    async () => {
      const user = await getSessionUser(prisma, getServerClaims);
      if (user != null) {
        await emitUsageEvent(prisma, { type: "login", userId: user.id, metadata: { method: "oauth" } });
      }
      return user;
    },
  );
  return handler(req);
}
