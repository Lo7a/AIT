import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report, cookieStore] = await Promise.all([getReport(prisma, id).catch(() => null), cookies()]);
  if (!report || !report.scan) notFound();

  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Report } = getVariant(theme);
  return <Report report={report} />;
}
