import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { getRoadmapView } from "../../../server/roadmap-repo";
import { getQuantityAnswers } from "../../../server/interview-repo";
import { personalLossLine } from "../../../pipeline/roadmap/loss-calc";
import type { DiagnosisStatus } from "../../../server/status";
import { currentActingUser, hasAuthConfig } from "../../../server/auth/supabase-server";
import { userCanAccessDiagnosis, isAdmin } from "../../../server/auth/guard";
import { emitUsageEvent } from "../../../server/usage-events";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";
import { buildLedger } from "../../../pipeline/model/ledger";

export const dynamic = "force-dynamic";

// אותו סט סטטוסים בדיוק כמו ALLOWED_STATUSES ב-server/run-roadmap.ts - אלה שבהם מותר לבנות/
// להציג Roadmap. סטטוס מוקדם יותר (created/scanning/scanned) אומר שאין עדיין דוח/מודל לבנות
// עליו Roadmap - עדיף 404 נקי מאשר מסך "building" שנתקע כי buildRoadmap היה זורק InterviewError
const ROADMAPABLE: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // תיחום בעלות + זהות פועלת - ראו ההערה ב-report/[id]/page.tsx
  const acting = hasAuthConfig() ? await currentActingUser(prisma) : null;
  if (hasAuthConfig()) {
    if (acting == null) redirect("/login");
    if ((await userCanAccessDiagnosis(prisma, acting!.user, id).catch(() => null)) !== true) notFound();
  }

  const [report, roadmap, answers, cookieStore] = await Promise.all([
    getReport(prisma, id).catch(() => null),
    getRoadmapView(prisma, id).catch(() => null),
    // השורה האישית (מדרגה ב, loss-calc.ts) - תשובות הכמות לא משתנות בבנייה מחדש של Roadmap,
    // אז חישוב חד-פעמי ב-RSC מספיק; כשל קריאה נופל בשקט ל-null והבלוק מוצג בלי השורה
    getQuantityAnswers(prisma, id).catch(() => ({ volume: null, responseTime: null, dealValue: null })),
    cookies(),
  ]);
  if (!report || !report.scan || !ROADMAPABLE.includes(report.status)) notFound();

  // צפייה ב-Roadmap נרשמת ביומן - ראו ההערה המקבילה ב-report/[id]/page.tsx
  if (acting != null) {
    await emitUsageEvent(prisma, {
      type: "roadmap_viewed", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: id,
    });
  }

  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Roadmap } = getVariant(theme);
  return (
    <Roadmap
      report={report}
      initialRoadmap={roadmap}
      personalLoss={personalLossLine(answers.volume, answers.responseTime, answers.dealValue)}
      ledger={buildLedger(report.scan.findings, report.model, answers)}
      isAdmin={acting != null && isAdmin(acting.actor)}
      userEmail={acting?.actor.email ?? null}
    />
  );
}
