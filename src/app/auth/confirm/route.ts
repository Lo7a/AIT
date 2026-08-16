import { prisma } from "../../../server/db";
import { makeConfirmHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, getServerClaims } from "../../../server/auth/supabase-server";
import { getSessionUser } from "../../../server/auth/session";
import { emitUsageEvent } from "../../../server/usage-events";

// קישור הכניסה מהמייל (תבנית token_hash): verifyOtp כותב את ה-cookies של הסשן דרך ה-client
// של הבקשה, ואז שורת המראה נוצרת מיד - הכניסה הראשונה היא גם ההרשמה, והיא נרשמת ביומן
export async function GET(req: Request) {
  const handler = makeConfirmHandler(
    async (tokenHash) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
      return error == null;
    },
    async () => {
      const user = await getSessionUser(prisma, getServerClaims);
      if (user != null) {
        await emitUsageEvent(prisma, { type: "login", userId: user.id, metadata: { method: "magic_link" } });
      }
      return user;
    },
  );
  return handler(req);
}
