import { cookies } from "next/headers";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { THEME_COOKIE, parseTheme } from "./theme";
import { getVariant } from "./variants/registry";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

export default async function HomePage() {
  const [recent, cookieStore] = await Promise.all([listRecentDiagnoses(prisma), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Home } = getVariant(theme);
  return <Home recent={recent} />;
}
