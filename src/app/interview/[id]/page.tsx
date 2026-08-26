import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getInterviewState } from "../../../server/interview-repo";
import { snapshotOf } from "../../../server/run-interview";
import type { DiagnosisStatus } from "../../../server/status";
import { currentActingUser, hasAuthConfig } from "../../../server/auth/supabase-server";
import { userCanAccessDiagnosis } from "../../../server/auth/guard";
import { viewAsAdmin } from "../../../server/auth/impersonation";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";
import { factsOf } from "../../ui/business-facts";

export const dynamic = "force-dynamic";

// המסך רלוונטי רק כשיש דוח שאפשר לראיין עליו (report_ready), הראיון כבר פעיל (interviewing)
// או שכבר הופק ממנו roadmap (roadmap_ready - עדיין אפשר לחזור ולהעשיר). כל סטטוס אחר (created/
// scanning/scanned) אומר שאין עדיין מודל עסקי לבנות עליו ראיון - start היה נכשל בכל מקרה,
// אז עדיף 404 נקי מאשר מסך שמתחיל להיטען ואז נתקע חצי-מופעל
const INTERVIEWABLE: DiagnosisStatus[] = ["report_ready", "interviewing", "roadmap_ready"];

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // תיחום בעלות + זהות פועלת - ראו ההערה ב-report/[id]/page.tsx.
  // acting מורם מחוץ לתנאי (20.8) כדי שגם ההרשאה לחיפוש ההתחזות תיגזר ממנו
  const acting = hasAuthConfig() ? await currentActingUser(prisma) : null;
  if (hasAuthConfig()) {
    if (acting == null) redirect("/login");
    if ((await userCanAccessDiagnosis(prisma, acting.user, id).catch(() => null)) !== true) notFound();
  }

  // רשומת העסק נטענת כאן ולא נגזרת מהראיון: הראיון לא מחזיק אותה, ובלעדיה זה היה המסך
  // היחיד במערכת שלא אומר על איזה עסק מדובר (דיווח מייסד 20.8). שאילתה צרה במכוון -
  // שלושה שדות, ובמקביל לשאר ולא אחריהן. העיר והאתר נוספו לשם שורת העובדות בסרגל
  // (בקשת אלעד 26.8) - אותה שאילתה, שני שדות נוספים, לא סיבוב נוסף למסד
  const [state, cookieStore, biz] = await Promise.all([
    getInterviewState(prisma, id).catch(() => null),
    cookies(),
    prisma.diagnosis
      .findUnique({ where: { id }, select: { business: { select: { name: true, city: true, website: true } } } })
      .catch(() => null),
  ]);
  const businessName = biz?.business.name ?? null;
  if (!state || !INTERVIEWABLE.includes(state.status)) notFound();

  // תאריך הסריקה מ-findings.meta שכבר טעון ב-state, ולא מרשומת הסריקה כמו בדוח - חוסך
  // שאילתה, וההפרש ביניהם הוא שניות בעוד שהתצוגה היא יום. תאריך שאינו נפרס נופל ל-null
  // ולא לתאריך שגוי, כי Intl זורק על Invalid Date
  const scannedAt = new Date(state.findings.meta.startedAt);
  const facts = biz != null
    ? factsOf(state.findings, biz.business, Number.isNaN(scannedAt.getTime()) ? null : scannedAt)
    : undefined;

  const snapshot = snapshotOf(state);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Interview } = getVariant(theme);
  return (
    <Interview
      diagnosisId={id}
      initial={snapshot}
      businessName={businessName ?? undefined}
      facts={facts}
      isAdmin={viewAsAdmin(acting)}
      userEmail={acting?.actor.email ?? null}
    />
  );
}
