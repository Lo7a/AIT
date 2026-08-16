import { redirect } from "next/navigation";
import { prisma } from "../../server/db";
import { getSessionUser } from "../../server/auth/session";
import { getServerClaims, hasAuthConfig } from "../../server/auth/supabase-server";
import { LoginScreen } from "./login-screen";

export const dynamic = "force-dynamic"; // תלוי cookies של סשן - אין קאש סטטי

// מסך יחיד בלי גרסאות עיצוב (registry) בכוונה: כל המסכים placeholder עד שלב העיצוב, ולמסך
// כניסה אין תלות בערכת הנושא של הדוחות
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, params] = await Promise.all([
    getSessionUser(prisma, getServerClaims),
    searchParams,
  ]);
  if (user != null) redirect("/");
  return (
    <LoginScreen
      configured={hasAuthConfig()}
      googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"}
      errorParam={params.error ?? null}
    />
  );
}
