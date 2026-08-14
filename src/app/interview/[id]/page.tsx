import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getInterviewState } from "../../../server/interview-repo";
import { snapshotOf } from "../../../server/run-interview";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [state, cookieStore] = await Promise.all([
    getInterviewState(prisma, id).catch(() => null),
    cookies(),
  ]);
  if (!state) notFound();

  const snapshot = snapshotOf(state);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Interview } = getVariant(theme);
  return <Interview diagnosisId={id} initial={snapshot} />;
}
