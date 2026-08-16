import { cookies } from "next/headers";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { getSessionUser } from "../server/auth/session";
import { getServerClaims, hasAuthConfig } from "../server/auth/supabase-server";
import { THEME_COOKIE, parseTheme } from "./theme";
import { getVariant } from "./variants/registry";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

export default async function HomePage() {
  const [recent, cookieStore, user] = await Promise.all([
    listRecentDiagnoses(prisma),
    cookies(),
    getSessionUser(prisma, getServerClaims),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Home } = getVariant(theme);
  return (
    <Home
      recent={recent}
      session={user != null ? { email: user.email } : null}
      loginEnabled={hasAuthConfig()}
    />
  );
}
