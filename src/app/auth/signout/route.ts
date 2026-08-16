import { makeSignoutHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, hasAuthConfig } from "../../../server/auth/supabase-server";
import { guardApiRequest } from "../../../server/api/request-guards";

// התנתקות: POST בלבד (ראו auth-handlers) + שומר Origin - אתר זר לא ינתק את המשתמש שלנו.
// בלי env של Supabase אין סשן לנתק - חוזרים הביתה
export async function POST(req: Request) {
  const guard = guardApiRequest(req);
  if (guard != null) return guard;
  const handler = makeSignoutHandler(async () => {
    if (!hasAuthConfig()) return;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  });
  return handler(req);
}
