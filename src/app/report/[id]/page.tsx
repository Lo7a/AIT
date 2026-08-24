import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import { loadCatalogLite } from "../../../server/roadmap-repo";
import { getQuantityAnswers } from "../../../server/interview-repo";
import { reportLossHighlights } from "../../../pipeline/roadmap/report-highlights";
import { industryOf } from "../../../pipeline/industry";
import { personalLossLine } from "../../../pipeline/roadmap/loss-calc";
import { quickWins } from "../../../pipeline/roadmap/quick-wins";
import { insights } from "../../../pipeline/roadmap/insights";
import { currentActingUser, hasAuthConfig } from "../../../server/auth/supabase-server";
import { userCanAccessDiagnosis, isAdmin } from "../../../server/auth/guard";
import { emitUsageEvent } from "../../../server/usage-events";
import { THEME_COOKIE, parseTheme } from "../../theme";
import { getVariant } from "../../variants/registry";
import { buildLedger } from "../../../pipeline/model/ledger";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // תיחום בעלות (כמו בכל מסכי ה-[id]): אנונימי מופנה לכניסה, אבחון זר מקבל בדיוק את אותו
  // 404 כמו אבחון שלא קיים. בסביבה בלי מפתחות Supabase המסכים נשארים פתוחים (מצב פיתוח).
  // הזהות הפועלת (acting): בהתחזות התיחום לפי המשתמש שצופים בו - אדמין רואה בדיוק מה שהוא רואה
  const acting = hasAuthConfig() ? await currentActingUser(prisma) : null;
  const user = acting?.user ?? null;
  if (hasAuthConfig()) {
    if (user == null) redirect("/login");
    if ((await userCanAccessDiagnosis(prisma, user, id).catch(() => null)) !== true) notFound();
  }

  const [report, cookieStore] = await Promise.all([getReport(prisma, id).catch(() => null), cookies()]);
  if (!report || !report.scan) notFound();

  // צפייה בדוח נרשמת ביומן (usage-events) - הבסיס להיסטוריה, לסטטיסטיקות ולשימוש המכירתי
  // של שלב ב (מי צפה במה = למי מתקשרים). רק אחרי שהגישה אושרה והדוח באמת קיים
  if (acting != null) {
    await emitUsageEvent(prisma, {
      type: "report_viewed", userId: acting.user.id, actorUserId: acting.actor.id,
      entityType: "diagnosis", entityId: id,
    });
  }

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
    getQuantityAnswers(prisma, id).catch(() => ({ volume: null, responseTime: null, dealValue: null })),
  ]);
  // הענף (התניית ענף, 20.8) נגזר כאן ומוזרק פנימה: report-highlights סוגר על ScoreReport
  // בלבד ואין לו findings. פריט ענפי לא יוצג לעסק שענפו לא זוהה (הכרעת מייסד 6.1)
  const industry = industryOf(report.scan.findings, report.model);
  const highlights = reportLossHighlights(report.scan.scores, report.model, catalog, 3, industry.slug);
  const personalLoss = personalLossLine(answers.volume, answers.responseTime, answers.dealValue);
  // פנקס החוסרים (משימה 19): נבנה כאן ולא ב-getReport כי הוא דורש את תשובות הכמות, שנקראות
  // מההודעות לפי questionKey ולא מהמודל. אותם answers שכבר נטענו למעלה - בלי סיבוב נוסף
  const ledger = buildLedger(report.scan.findings, report.model, answers);

  // "מה אפשר לעשות כבר עכשיו" (צעדים חינמיים): נגזר באותו אופן בדיוק - חוקים סטטיים מעל
  // הציונים *כפי שהם שמורים*, בזיכרון בלבד, בלי LLM ובלי שמירה. רק חוקים שנבדקו בפועל
  // ולא הושגו מייצרים צעד (ראו quick-wins.ts) - "לא נבדק" אף פעם לא הופך להמלצה
  const freeSteps = quickWins(report.scan.scores);

  // "מה הבנתי על העסק שלך" (insights.ts): שכבת החיבור שפותחת את הדוח - כל מסקנה מחברת כמה
  // אותות *מאומתים* לתמונה אחת. נגזרת באותה דרך בדיוק: חוקים סטטיים מעל הציונים כפי שהם
  // שמורים, בזיכרון בלבד, בלי LLM ובלי שמירה. אות שלא נבדק לא נכנס לשום מסקנה
  const understood = insights(report.scan.scores);

  // ההרשאה נקבעת על השחקן האמיתי ולא על מי שמתחזים אליו
  const viewerIsAdmin = acting != null && isAdmin(acting.actor);
  const viewerEmail = acting?.actor.email ?? null;

  return (
    <Report
      isAdmin={viewerIsAdmin}
      userEmail={viewerEmail}
      report={report}
      lossHighlights={highlights}
      personalLoss={personalLoss}
      quickWins={freeSteps}
      insights={understood}
      ledger={ledger}
    />
  );
}
