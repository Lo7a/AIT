import { cookies } from "next/headers";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { currentActingUser, hasAuthConfig } from "../server/auth/supabase-server";
import { isImpersonating } from "../server/auth/impersonation";
import { isAdmin } from "../server/auth/guard";
import { THEME_COOKIE, parseTheme } from "./theme";
import { getVariant } from "./variants/registry";
import { LandingScreen } from "./landing-screen";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

export default async function HomePage() {
  // הזהות הפועלת: בהתחזות user הוא המשתמש שצופים בו, actor הוא האדמין - המסך כולו (רשימה,
  // קישור ניהול) מתנהג לפי user, ורק פס ההתחזות חושף את המצב
  const acting = await currentActingUser(prisma);
  const user = acting?.user ?? null;

  // אנונימי בסביבה עם התחברות => דף הנחיתה (הכרעת מייסד 16.8). בסביבה בלי מפתחות Supabase
  // (פיתוח טרום-הגדרה) אין בכלל מושג "מחובר" - מסך הבית המלא נשאר פתוח כמו קודם
  if (user == null && hasAuthConfig()) return <LandingScreen />;

  // הרשימה מתוחמת בעלות: אדמין רואה הכול (כולל שורות טסט ותיקות בלי בעלים), משתמש רגיל רק
  // את העסקים שלו. user null כאן = מצב טרום-מפתחות בלבד
  const [recent, cookieStore] = await Promise.all([
    listRecentDiagnoses(prisma, user != null && !isAdmin(user) ? { ownerUserId: user.id } : {}),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Home } = getVariant(theme);
  return (
    <Home
      recent={recent}
      session={user != null ? { email: user.email } : null}
      loginEnabled={hasAuthConfig()}
      isAdminUser={user != null && isAdmin(user)}
      impersonating={acting != null && isImpersonating(acting) ? { email: acting.user.email } : null}
    />
  );
}
