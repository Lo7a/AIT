import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { loadCatalogLite } from "../../../server/roadmap-repo";
import { getQuantityAnswers } from "../../../server/interview-repo";
import { reportLossHighlights } from "../../../pipeline/roadmap/report-highlights";
import { personalLossLine } from "../../../pipeline/roadmap/loss-calc";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report, cookieStore] = await Promise.all([getReport(prisma, id).catch(() => null), cookies()]);
  if (!report || !report.scan) notFound();

  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Report } = getVariant(theme);

  // "מה מונח על השולחן" (loss leads, score measures - שלב א'): מחושב כאן בזיכרון בלבד מהציונים
  // *כפי שהם שמורים* (report.scan.scores) - בלי LLM, בלי שמירה, בלי לחשב ציונים טריים (ראו
  // report-highlights.ts). כשל בטעינת הקטלוג לא אמור להפיל את הדוח - נופל בשקט למערך ריק,
  // והמסך פשוט חוזר ללייאאוט מוביל-ציון הרגיל.
  // השורה האישית (מדרגה ב, loss-calc.ts): תשובות הכמות מהראיון לפי questionKey - גם כאן כשל
  // קריאה נופל בשקט ל-null והבלוק פשוט מוצג בלי השורה
  const [catalog, answers] = await Promise.all([
    loadCatalogLite(prisma).catch(() => []),
    getQuantityAnswers(prisma, id).catch(() => ({ volume: null, responseTime: null })),
  ]);
  const highlights = reportLossHighlights(report.scan.scores, report.model, catalog);
  const personalLoss = personalLossLine(answers.volume, answers.responseTime);

  return <Report report={report} lossHighlights={highlights} personalLoss={personalLoss} />;
}
