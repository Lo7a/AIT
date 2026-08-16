import { prisma } from "../../../server/db";
import { makeCallbackHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, getServerClaims } from "../../../server/auth/supabase-server";
import { getSessionUser } from "../../../server/auth/session";

// חזרה עם code: גם קישור המייל בתצורת ברירת המחדל (ConfirmationURL -> emailRedirectTo) וגם
// Google OAuth כשיחובר - שניהם נוחתים כאן ומוחלפים לסשן; שורת המראה נוצרת מיד אחרי
export async function GET(req: Request) {
  const handler = makeCallbackHandler(
    async (code) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return error == null;
    },
    () => getSessionUser(prisma, getServerClaims),
  );
  return handler(req);
}
