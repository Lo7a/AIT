import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../server/db";
import { currentActingUser } from "../../server/auth/supabase-server";
import { isImpersonating } from "../../server/auth/impersonation";
import { isAdmin } from "../../server/auth/guard";
import {
  getAdminOverview, getExternalCallsSummary, listAllDiagnoses, listRecentBriefs, listRecentEvents,
  listUsersWithActivity,
} from "../../server/admin-read";
import { DIAGNOSIS_STATUS_LABEL } from "../../pipeline/report/presenter";
import type { DiagnosisStatus } from "../../server/status";

export const dynamic = "force-dynamic";

// תוויות עברית לסוגי אירועי היומן (usage-events.ts) - סוג לא מוכר מוצג כמו שהוא
const EVENT_LABEL: Record<string, string> = {
  login: "כניסה",
  search: "חיפוש עסק",
  diagnosis_created: "אבחון נוצר",
  scan_completed: "סריקה הושלמה",
  interview_started: "ראיון התחיל",
  interview_answer: "תשובת ראיון",
  interview_finished: "ראיון הסתיים",
  roadmap_built: "Roadmap נבנה",
  brief_sent: "Brief נשלח",
  report_viewed: "צפייה בדוח",
  roadmap_viewed: "צפייה ב-Roadmap",
  impersonation_started: "התחזות התחילה",
  impersonation_stopped: "התחזות הסתיימה",
};

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

// מסך האדמין (עיצוב placeholder כמו כל המסכים): סטטיסטיקות, כל האבחונים, משתמשים, יומן
// פעולות ו-Briefs - עמוד אחד רזה. השער: אדמין בלבד; לכל אחד אחר העמוד "לא קיים" (notFound,
// לא 403) - אין מה להסגיר. אנונימי מופנה לכניסה כמו בכל המסכים
export default async function AdminPage() {
  // השער לפי הזהות האמיתית (actor): אדמין באמצע התחזות לא מאבד את עמוד הניהול - ממנו הוא
  // גם עוצר את ההתחזות
  const acting = await currentActingUser(prisma);
  if (acting == null) redirect("/login");
  if (!isAdmin(acting.actor)) notFound();

  const [overview, diagnoses, users, events, briefs, externalCalls] = await Promise.all([
    getAdminOverview(prisma),
    listAllDiagnoses(prisma),
    listUsersWithActivity(prisma),
    listRecentEvents(prisma),
    listRecentBriefs(prisma),
    getExternalCallsSummary(prisma),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-frank)] text-3xl font-bold tracking-tight">ניהול</h1>
        <Link
          href="/"
          className="text-sm font-medium text-[#111111] underline-offset-4 hover:underline"
        >
          חזרה לעמוד הראשי
        </Link>
      </div>

      {isImpersonating(acting) && (
        <div className="mb-6 flex items-center justify-between rounded-lg bg-[#FBF3DB] px-4 py-2 text-sm text-[#956400]">
          <span>
            מצב התחזות פעיל: אתה רואה את המערכת בתור <span className="font-medium" dir="ltr">{acting.user.email ?? "משתמש ללא אימייל"}</span>
          </span>
          <form action="/api/admin/impersonate" method="post">
            <input type="hidden" name="action" value="stop" />
            <button type="submit" className="font-medium underline-offset-4 hover:underline">חזרה לעצמי</button>
          </form>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "משתמשים", value: overview.users },
          { label: "עסקים", value: overview.businesses },
          { label: "סריקות", value: overview.scans },
          { label: "עלות סריקות (USD)", value: overview.scanCostUsd.toFixed(2) },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-black/[0.06] bg-white px-4 py-3">
            <div className="text-sm text-[#6F6E6A]">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">אבחונים לפי סטטוס</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(overview.diagnosesByStatus).map(([status, count]) => (
            <span key={status} className="rounded-md bg-[#F1F0EE] px-3 py-1 text-sm">
              {DIAGNOSIS_STATUS_LABEL[status as DiagnosisStatus] ?? status}: <span className="font-semibold tabular-nums">{count}</span>
            </span>
          ))}
        </div>
        <h2 className="mt-5 font-[family-name:var(--font-frank)] text-lg font-bold">פעילות בשבוע האחרון</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(overview.eventsByType7d).length === 0 && (
            <span className="text-sm text-[#6F6E6A]">אין עדיין אירועים ביומן</span>
          )}
          {Object.entries(overview.eventsByType7d).map(([type, count]) => (
            <span key={type} className="rounded-md bg-[#EDF3EC] px-3 py-1 text-sm text-[#346538]">
              {EVENT_LABEL[type] ?? type}: <span className="font-semibold tabular-nums">{count}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">קריאות חיצוניות וטוקנים (7 ימים)</h2>
        <p className="mt-1 text-sm text-[#6F6E6A]">
          ביממה האחרונה: <span className="font-semibold tabular-nums">{externalCalls.todayCalls}</span> קריאות,{" "}
          <span className="font-semibold tabular-nums">{externalCalls.todayTokens.toLocaleString("he-IL")}</span> טוקנים
        </p>
        <div className="mt-3 overflow-auto rounded-lg border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead className="text-[#6F6E6A]">
              <tr className="border-b border-black/[0.06]">
                <th className="px-3 py-2 text-start font-medium">שירות</th>
                <th className="px-3 py-2 text-start font-medium">הקשר</th>
                <th className="px-3 py-2 text-start font-medium">קריאות</th>
                <th className="px-3 py-2 text-start font-medium">כשלים</th>
                <th className="px-3 py-2 text-start font-medium">טוקנים נכנסים</th>
                <th className="px-3 py-2 text-start font-medium">טוקנים יוצאים</th>
                <th className="px-3 py-2 text-start font-medium">משך ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {externalCalls.last7d.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-3 text-[#6F6E6A]">אין עדיין קריאות בארכיון</td></tr>
              )}
              {externalCalls.last7d.map((s) => (
                <tr key={`${s.service}:${s.context}`} className="border-b border-black/[0.06] last:border-0">
                  <td className="px-3 py-2 font-medium" dir="ltr">{s.service}</td>
                  <td className="px-3 py-2" dir="ltr">{s.context}</td>
                  <td className="px-3 py-2 tabular-nums">{s.calls}</td>
                  <td className="px-3 py-2 tabular-nums">{s.failed > 0 ? <span className="text-[#9F2F2D]">{s.failed}</span> : 0}</td>
                  <td className="px-3 py-2 tabular-nums">{s.inputTokens.toLocaleString("he-IL")}</td>
                  <td className="px-3 py-2 tabular-nums">{s.outputTokens.toLocaleString("he-IL")}</td>
                  <td className="px-3 py-2 tabular-nums">{(s.avgDurationMs / 1000).toFixed(1)} שנ'</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">משתמשים</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead className="text-start text-[#6F6E6A]">
              <tr className="border-b border-black/[0.06]">
                <th className="px-3 py-2 text-start font-medium">אימייל</th>
                <th className="px-3 py-2 text-start font-medium">תפקיד</th>
                <th className="px-3 py-2 text-start font-medium">עסקים</th>
                <th className="px-3 py-2 text-start font-medium">פעולות</th>
                <th className="px-3 py-2 text-start font-medium">נראה לאחרונה</th>
                <th className="px-3 py-2 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-black/[0.06] last:border-0">
                  <td className="px-3 py-2" dir="ltr">{u.email ?? "ללא אימייל"}</td>
                  <td className="px-3 py-2">{u.role === "admin" ? "אדמין" : "בעל עסק"}</td>
                  <td className="px-3 py-2 tabular-nums">{u.businessCount}</td>
                  <td className="px-3 py-2 tabular-nums">{u.eventCount}</td>
                  <td className="px-3 py-2">{u.lastEventAt != null ? DATE_FMT.format(u.lastEventAt) : "-"}</td>
                  <td className="px-3 py-2">
                    {/* התחזות לעצמך היא no-op - אין כפתור לשורה של האדמין המחובר */}
                    {u.id !== acting.actor.id && (
                      <form action="/api/admin/impersonate" method="post">
                        <input type="hidden" name="action" value="start" />
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="font-medium underline-offset-4 hover:underline">
                          התחזות
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">כל האבחונים</h2>
        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead className="text-[#6F6E6A]">
              <tr className="border-b border-black/[0.06]">
                <th className="px-3 py-2 text-start font-medium">עסק</th>
                <th className="px-3 py-2 text-start font-medium">בעלים</th>
                <th className="px-3 py-2 text-start font-medium">סטטוס</th>
                <th className="px-3 py-2 text-start font-medium">ציון</th>
                <th className="px-3 py-2 text-start font-medium">נוצר</th>
                <th className="px-3 py-2 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {diagnoses.map((d) => (
                <tr key={d.id} className="border-b border-black/[0.06] last:border-0">
                  <td className="px-3 py-2 font-medium">{d.businessName}</td>
                  <td className="px-3 py-2" dir="ltr">{d.ownerEmail ?? "-"}</td>
                  <td className="px-3 py-2">{DIAGNOSIS_STATUS_LABEL[d.status as DiagnosisStatus] ?? d.status}</td>
                  <td className="px-3 py-2 tabular-nums">{d.overall ?? "-"}</td>
                  <td className="px-3 py-2">{DATE_FMT.format(d.createdAt)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/report/${d.id}`} className="font-medium underline-offset-4 hover:underline">לדוח</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">יומן פעולות אחרונות</h2>
        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead className="text-[#6F6E6A]">
              <tr className="border-b border-black/[0.06]">
                <th className="px-3 py-2 text-start font-medium">פעולה</th>
                <th className="px-3 py-2 text-start font-medium">משתמש</th>
                <th className="px-3 py-2 text-start font-medium">מתי</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-black/[0.06] last:border-0">
                  <td className="px-3 py-2">{EVENT_LABEL[e.type] ?? e.type}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {e.userEmail ?? "-"}
                    {/* פעולת התחזות: המבצע בפועל שונה מהמשתמש - ההתחזות גלויה ביומן מעצם המבנה */}
                    {e.actorEmail != null && e.actorEmail !== e.userEmail ? ` (בוצע ע"י ${e.actorEmail})` : ""}
                  </td>
                  <td className="px-3 py-2">{DATE_FMT.format(e.createdAt)}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td className="px-3 py-3 text-[#6F6E6A]" colSpan={3}>אין עדיין אירועים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold">Briefs אחרונים</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-black/[0.06] bg-white">
          <table className="w-full text-sm">
            <thead className="text-[#6F6E6A]">
              <tr className="border-b border-black/[0.06]">
                <th className="px-3 py-2 text-start font-medium">פריט</th>
                <th className="px-3 py-2 text-start font-medium">עסק</th>
                <th className="px-3 py-2 text-start font-medium">נשלח</th>
              </tr>
            </thead>
            <tbody>
              {briefs.map((b) => (
                <tr key={b.id} className="border-b border-black/[0.06] last:border-0">
                  <td className="px-3 py-2">{b.itemName}</td>
                  <td className="px-3 py-2">{b.businessName}</td>
                  <td className="px-3 py-2">{b.sentAt != null ? DATE_FMT.format(b.sentAt) : "לא נשלח"}</td>
                </tr>
              ))}
              {briefs.length === 0 && (
                <tr><td className="px-3 py-3 text-[#6F6E6A]" colSpan={3}>אין עדיין Briefs</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
