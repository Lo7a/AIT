import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { getRoadmapView } from "../../../server/roadmap-repo";
import type { DiagnosisStatus } from "../../../server/status";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

// אותו סט סטטוסים בדיוק כמו ALLOWED_STATUSES ב-server/run-roadmap.ts - אלה שבהם מותר לבנות/
// להציג Roadmap. סטטוס מוקדם יותר (created/scanning/scanned) אומר שאין עדיין דוח/מודל לבנות
// עליו Roadmap - עדיף 404 נקי מאשר מסך "building" שנתקע כי buildRoadmap היה זורק InterviewError
const ROADMAPABLE: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report, roadmap, cookieStore] = await Promise.all([
    getReport(prisma, id).catch(() => null),
    getRoadmapView(prisma, id).catch(() => null),
    cookies(),
  ]);
  if (!report || !report.scan || !ROADMAPABLE.includes(report.status)) notFound();

  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Roadmap } = getVariant(theme);
  return <Roadmap report={report} initialRoadmap={roadmap} />;
}
