import { prisma } from "../../../server/db";
import { listRecentBriefs, listRecentEvents } from "../../../server/admin-read";
import { requireAdmin } from "../require-admin";
import { DATE_FMT, EVENT_LABEL } from "../labels";

export const dynamic = "force-dynamic";

// יומן הפעולות וה-Briefs האחרונים - שתי רשימות של "מה קרה", זו לצד זו
export default async function AdminActivityPage() {
  await requireAdmin();

  const [events, briefs] = await Promise.all([
    listRecentEvents(prisma),
    listRecentBriefs(prisma),
  ]);

  return (
    <main className="board">
      <section className="shell c8 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">יומן פעולות אחרונות</h2>
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
                {events.map((e) => (
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
                {events.length === 0 && (
                  <tr><td className="t-empty" colSpan={3}>אין עדיין אירועים</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
