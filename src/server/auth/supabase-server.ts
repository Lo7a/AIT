// מתאם Supabase צד-שרת (דק, לא נבדק - כמו db.ts): יצירת client עם אחסון cookies של Next,
// ושליפת claims מאומתים ממנו. כל הלוגיקה העסקית חיה ב-session.ts ומקבלת את אלה מוזרקים.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { AuthClaims } from "./session";

// env חסר => האפליקציה רצה בלי התחברות בכלל (מצב טרום-מפתחות): אין קריסה, getServerClaims
// מחזיר null בכל מקום, ומסך הכניסה מציג הודעת הגדרה כנה במקום טופס מת
export function hasAuthConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// client צד-שרת קשור לבקשה הנוכחית (cookies של next/headers). ב-RSC אסור לכתוב cookies -
// ה-catch בולע את זה בכוונה (הדפוס הרשמי של @supabase/ssr): רענון הטוקן שנכשל להיכתב שם
// מכוסה ע"י ה-middleware, שכן רשאי לכתוב
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // RSC - כתיבה אסורה; ה-middleware מרענן במקומנו
          }
        },
      },
    },
  );
}

// אימות ה-JWT ושליפת ה-claims: getClaims מאמת חתימה מקומית מול מפתחות החתימה של הפרויקט
// (JWKS עם cache; בפרויקט על סוד HS256 ישן הוא נופל לקריאת רשת לשרת ה-Auth - עדיין נכון,
// רק איטי יותר; הגירת signing keys בדשבורד מחזירה את זה לאימות מקומי). כל כשל => null
export async function getServerClaims(): Promise<AuthClaims | null> {
  if (!hasAuthConfig()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error != null || data?.claims?.sub == null) return null;
    const email = typeof data.claims.email === "string" ? data.claims.email : null;
    return { sub: data.claims.sub, email };
  } catch (err) {
    console.error("auth: getServerClaims failed:", err);
    return null;
  }
}
