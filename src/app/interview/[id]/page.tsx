import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getInterviewState } from "../../../server/interview-repo";
import { snapshotOf } from "../../../server/run-interview";
import type { DiagnosisStatus } from "../../../server/status";
import { currentActingUser, hasAuthConfig } from "../../../server/auth/supabase-server";
import { userCanAccessDiagnosis } from "../../../server/auth/guard";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

// המסך רלוונטי רק כשיש דוח שאפשר לראיין עליו (report_ready), הראיון כבר פעיל (interviewing)
// או שכבר הופק ממנו roadmap (roadmap_ready - עדיין אפשר לחזור ולהעשיר). כל סטטוס אחר (created/
// scanning/scanned) אומר שאין עדיין מודל עסקי לבנות עליו ראיון - start היה נכשל בכל מקרה,
// אז עדיף 404 נקי מאשר מסך שמתחיל להיטען ואז נתקע חצי-מופעל
const INTERVIEWABLE: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // תיחום בעלות + זהות פועלת - ראו ההערה ב-report/[id]/page.tsx
  if (hasAuthConfig()) {
    const acting = await currentActingUser(prisma);
    if (acting == null) redirect("/login");
    if ((await userCanAccessDiagnosis(prisma, acting.user, id).catch(() => null)) !== true) notFound();
  }

  const [state, cookieStore] = await Promise.all([
    getInterviewState(prisma, id).catch(() => null),
    cookies(),
  ]);
  if (!state || !INTERVIEWABLE.includes(state.status)) notFound();

  const snapshot = snapshotOf(state);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Interview } = getVariant(theme);
  return <Interview diagnosisId={id} initial={snapshot} />;
}
