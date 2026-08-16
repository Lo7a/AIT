import { makeSignoutHandler } from "../../../server/api/auth-handlers";
import { createSupabaseServerClient, hasAuthConfig } from "../../../server/auth/supabase-server";

// התנתקות: POST בלבד (ראו auth-handlers). בלי env של Supabase אין סשן לנתק - חוזרים הביתה
export async function POST(req: Request) {
  const handler = makeSignoutHandler(async () => {
    if (!hasAuthConfig()) return;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  });
  return handler(req);
}
