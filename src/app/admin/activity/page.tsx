import Link from "next/link";
import { prisma } from "../../../server/db";
import { listRecentBriefs, listRecentEvents } from "../../../server/admin-read";
import { USAGE_EVENT_TYPES } from "../../../server/usage-events";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT, EVENT_LABEL } from "../labels";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// יומן הפעולות וה-Briefs האחרונים.
//
// היומן הוא הטבלה שגדלה הכי מהר במערכת, ולכן הוא הראשון שקיבל עימוד אמיתי: עד 20.8
// הוא הציג 50 שורות אחרונות בלי שום דרך להגיע לישנות מהן, כלומר יומן ביקורת שאי אפשר
// לחקור בו. עכשיו עימוד, סינון לפי סוג הפעולה וחיפוש לפי אימייל - הכול בשרת ובכתובת
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = one(sp.q) ?? "";
  const type = one(sp.type) ?? "";
  const page = pageParam(one(sp.page));

  const [events, briefs] = await Promise.all([
    listRecentEvents(prisma, { q, type, page }),
    listRecentBriefs(prisma),
  ]);

  const params = { q: q || undefined, type: type || undefined };
  const filtered = q !== "" || type !== "";

  return (
    <main className="board">
      <section className="shell c8 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">יומן פעולות</h2>

          <form className="fbar" method="get" action="/admin/activity">
            <span className="fld">
              <label htmlFor="ev-q">חיפוש</label>
              <input id="ev-q" type="search" name="q" defaultValue={q} placeholder="אימייל משתמש או מבצע" />
            </span>
            <span className="fld">
              <label htmlFor="ev-type">סוג פעולה</label>
              <select id="ev-type" name="type" defaultValue={type}>
                <option value="">הכל</option>
                {USAGE_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_LABEL[t] ?? t}</option>
                ))}
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/activity" className="clear">ניקוי</Link>}
            </span>
          </form>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>פעולה</th>
                  <th>משתמש</th>
                  <th>מתי</th>
                </tr>
              </thead>
              <tbody>
                {events.rows.map((e) => (
                  <tr key={e.id}>
                    <td className="t-strong">{EVENT_LABEL[e.type] ?? e.type}</td>
                    <td className="t-mut" dir="ltr">
                      {e.userEmail ?? "-"}
                      {/* פעולת התחזות: המבצע בפועל שונה מהמשתמש - ההתחזות גלויה ביומן מעצם המבנה */}
                      {e.actorEmail != null && e.actorEmail !== e.userEmail ? ` (בוצע ע"י ${e.actorEmail})` : ""}
                    </td>
                    <td className="t-mut">{DATE_FMT.format(e.createdAt)}</td>
                  </tr>
                ))}
                {events.rows.length === 0 && (
                  <tr>
                    <td className="t-empty" colSpan={3}>
                      {filtered ? "אין אירועים שמתאימים לסינון הזה" : "אין עדיין אירועים"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager
            page={events.page} pages={events.pages} total={events.total}
            basePath="/admin/activity" params={params} unit="אירועים"
          />
        </div>
      </section>

      <section className="shell c4 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">Briefs אחרונים</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>פריט</th>
                  <th>עסק</th>
                  <th>נשלח</th>
                </tr>
              </thead>
              <tbody>
                {briefs.map((b) => (
                  <tr key={b.id}>
                    <td className="t-strong">{b.itemName}</td>
                    <td className="t-mut">{b.businessName}</td>
                    <td className="t-mut">{b.sentAt != null ? DATE_FMT.format(b.sentAt) : "לא נשלח"}</td>
                  </tr>
                ))}
                {briefs.length === 0 && (
                  <tr><td className="t-empty" colSpan={3}>אין עדיין Briefs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
