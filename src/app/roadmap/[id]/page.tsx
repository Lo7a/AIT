import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { getRoadmapView } from "../../../server/roadmap-repo";
import { getQuantityAnswers } from "../../../server/interview-repo";
import { personalLossLine } from "../../../pipeline/roadmap/loss-calc";
import type { DiagnosisStatus } from "../../../server/status";
import { getSessionUser } from "../../../server/auth/session";
import { getServerClaims, hasAuthConfig } from "../../../server/auth/supabase-server";
import { userCanAccessDiagnosis } from "../../../server/auth/guard";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

// אותו סט סטטוסים בדיוק כמו ALLOWED_STATUSES ב-server/run-roadmap.ts - אלה שבהם מותר לבנות/
// להציג Roadmap. סטטוס מוקדם יותר (created/scanning/scanned) אומר שאין עדיין דוח/מודל לבנות
// עליו Roadmap - עדיף 404 נקי מאשר מסך "building" שנתקע כי buildRoadmap היה זורק InterviewError
const ROADMAPABLE: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // תיחום בעלות - ראו ההערה ב-report/[id]/page.tsx
  if (hasAuthConfig()) {
    const user = await getSessionUser(prisma, getServerClaims);
    if (user == null) redirect("/login");
    if ((await userCanAccessDiagnosis(prisma, user, id).catch(() => null)) !== true) notFound();
  }

  const [report, roadmap, answers, cookieStore] = await Promise.all([
    getReport(prisma, id).catch(() => null),
    getRoadmapView(prisma, id).catch(() => null),
    // השורה האישית (מדרגה ב, loss-calc.ts) - תשובות הכמות לא משתנות בבנייה מחדש של Roadmap,
    // אז חישוב חד-פעמי ב-RSC מספיק; כשל קריאה נופל בשקט ל-null והבלוק מוצג בלי השורה
    getQuantityAnswers(prisma, id).catch(() => ({ volume: null, responseTime: null })),
    cookies(),
  ]);
  if (!report || !report.scan || !ROADMAPABLE.includes(report.status)) notFound();

  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Roadmap } = getVariant(theme);
  return <Roadmap report={report} initialRoadmap={roadmap} personalLoss={personalLossLine(answers.volume, answers.responseTime)} />;
}
