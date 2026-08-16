import { prisma } from "../../../server/db";
import { makeConfirmHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, getServerClaims } from "../../../server/auth/supabase-server";
import { getSessionUser } from "../../../server/auth/session";

// קישור הכניסה מהמייל (תבנית token_hash): verifyOtp כותב את ה-cookies של הסשן דרך ה-client
// של הבקשה, ואז שורת המראה נוצרת מיד - הכניסה הראשונה היא גם ההרשמה
export async function GET(req: Request) {
  const handler = makeConfirmHandler(
    async (tokenHash) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
      return error == null;
    },
    () => getSessionUser(prisma, getServerClaims),
  );
  return handler(req);
}
