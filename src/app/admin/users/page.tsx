import Link from "next/link";
import { prisma } from "../../../server/db";
import { listUsersWithActivity } from "../../../server/admin-read";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// מסך המשתמשים: מי נרשם, כמה עסקים ופעולות יש לו, מתי נראה לאחרונה, ומכאן גם ההתחזות.
// עימוד וחיפוש נוספו ב-20.8 יחד עם תיקון יעילות בצד השאילתה: "מתי נראה לאחרונה" נגזר
// מ-groupBy שרץ קודם על **כל** היומן, והוא מצומצם עכשיו למשתמשי העמוד בלבד
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const acting = await requireAdmin();
  const sp = await searchParams;

  const q = one(sp.q) ?? "";
  const role = one(sp.role) ?? "";
  const page = pageParam(one(sp.page));

  const users = await listUsersWithActivity(prisma, { q, role, page });
  const params = { q: q || undefined, role: role || undefined };
  const filtered = q !== "" || role !== "";

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">משתמשים</h2>

          <form className="fbar" method="get" action="/admin/users">
            <span className="fld">
              <label htmlFor="us-q">חיפוש</label>
              <input id="us-q" type="search" name="q" defaultValue={q} placeholder="אימייל" />
            </span>
            <span className="fld">
              <label htmlFor="us-role">תפקיד</label>
              <select id="us-role" name="role" defaultValue={role}>
                <option value="">הכל</option>
                <option value="admin">אדמין</option>
                <option value="owner">בעל עסק</option>
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/users" className="clear">ניקוי</Link>}
            </span>
          </form>

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
                {users.rows.map((u) => (
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
                {users.rows.length === 0 && (
                  <tr>
                    <td className="t-empty" colSpan={6}>
                      {filtered ? "אין משתמשים שמתאימים לסינון הזה" : "אין עדיין משתמשים"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager
            page={users.page} pages={users.pages} total={users.total}
            basePath="/admin/users" params={params} unit="משתמשים"
          />
        </div>
      </section>
    </main>
  );
}
