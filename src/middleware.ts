// רענון סשן (הדפוס הרשמי של @supabase/ssr): רכיבי שרת לא רשאים לכתוב cookies, אז טוקן שפג
// חייב להתרענן כאן - היחיד שרואה גם את הבקשה וגם את התשובה. רץ גם על /api בכוונה: מסך ראיון
// פתוח שעה שולח רק בקשות API, ובלי רענון כאן הטוקן שלו היה מת באמצע. אין כאן שום אכיפת
// הרשאות - התיחום לפי בעלות הוא המשימה הבאה, בשכבת הדפים/ה-handlers, לא כאן.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // טרום-מפתחות: בלי env של Supabase אין סשן לרענן - האפליקציה ממשיכה כרגיל
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // הקריאה עצמה היא מה שמרענן: טוקן שפג מוחלף בחדש ונכתב לתשובה דרך setAll שלמעלה.
  // כשל כאן שקוף למשתמש - הבקשה ממשיכה בלי סשן, והשכבות הפנימיות יחזירו את מה שמתאים
  await supabase.auth.getClaims().catch(() => null);

  return response;
}

export const config = {
  // הכול חוץ מנכסים סטטיים - כולל /api (ראו למעלה למה)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
