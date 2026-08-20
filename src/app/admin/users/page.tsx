import { prisma } from "../../../server/db";
import { listUsersWithActivity } from "../../../server/admin-read";
import { requireAdmin } from "../require-admin";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

// מסך המשתמשים: מי נרשם, כמה עסקים ופעולות יש לו, מתי נראה לאחרונה, ומכאן גם ההתחזות
export default async function AdminUsersPage() {
  const acting = await requireAdmin();

  const users = await listUsersWithActivity(prisma);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">משתמשים</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>אימייל</th>
                  <th>תפקיד</th>
                  <th>עסקים</th>
                  <th>פעולות</th>
                  <th>נראה לאחרונה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td dir="ltr">{u.email ?? "ללא אימייל"}</td>
                    <td className="t-mut">{u.role === "admin" ? "אדמין" : "בעל עסק"}</td>
                    <td className="num">{u.businessCount}</td>
                    <td className="num">{u.eventCount}</td>
                    <td className="t-mut">{u.lastEventAt != null ? DATE_FMT.format(u.lastEventAt) : "-"}</td>
                    <td>
                      {/* התחזות לעצמך היא no-op - אין כפתור לשורה של האדמין המחובר */}
                      {u.id !== acting.actor.id && (
                        <form action="/api/admin/impersonate" method="post">
                          <input type="hidden" name="action" value="start" />
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="pill">התחזות</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td className="t-empty" colSpan={6}>אין עדיין משתמשים</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
