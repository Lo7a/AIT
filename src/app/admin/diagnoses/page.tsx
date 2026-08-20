import Link from "next/link";
import { prisma } from "../../../server/db";
import { listAllDiagnoses } from "../../../server/admin-read";
import { DIAGNOSIS_STATUS_LABEL } from "../../../pipeline/report/presenter";
import type { DiagnosisStatus } from "../../../server/status";
import { DIAGNOSIS_STATUSES } from "../../../server/status";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// כל האבחונים במערכת. עד 20.8 נשלפו 100 האחרונים בלבד, בלי שום דרך להגיע לישנים מהם
// ובלי לדעת כמה יש - עכשיו עימוד אמיתי, חיפוש לפי שם עסק או אימייל בעלים, וסינון סטטוס
export default async function AdminDiagnosesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = one(sp.q) ?? "";
  const status = one(sp.status) ?? "";
  const page = pageParam(one(sp.page));

  const diagnoses = await listAllDiagnoses(prisma, { q, status, page });
  const params = { q: q || undefined, status: status || undefined };
  const filtered = q !== "" || status !== "";

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">כל האבחונים</h2>

          <form className="fbar" method="get" action="/admin/diagnoses">
            <span className="fld">
              <label htmlFor="dg-q">חיפוש</label>
              <input id="dg-q" type="search" name="q" defaultValue={q} placeholder="שם עסק או אימייל בעלים" />
            </span>
            <span className="fld">
              <label htmlFor="dg-status">סטטוס</label>
              <select id="dg-status" name="status" defaultValue={status}>
                <option value="">הכל</option>
                {DIAGNOSIS_STATUSES.map((st) => (
                  <option key={st} value={st}>{DIAGNOSIS_STATUS_LABEL[st] ?? st}</option>
                ))}
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/diagnoses" className="clear">ניקוי</Link>}
            </span>
          </form>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>עסק</th>
                  <th>בעלים</th>
                  <th>סטטוס</th>
                  <th>ציון</th>
                  <th>נוצר</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {diagnoses.rows.map((d) => (
                  <tr key={d.id}>
                    <td className="t-strong">{d.businessName}</td>
                    <td className="t-mut" dir="ltr">{d.ownerEmail ?? "-"}</td>
                    <td className="t-mut">{DIAGNOSIS_STATUS_LABEL[d.status as DiagnosisStatus] ?? d.status}</td>
                    <td className="num">{d.overall ?? "-"}</td>
                    <td className="t-mut">{DATE_FMT.format(d.createdAt)}</td>
                    <td><Link href={`/report/${d.id}`} className="ghost-act">לדוח</Link></td>
                  </tr>
                ))}
                {diagnoses.rows.length === 0 && (
                  <tr>
                    <td className="t-empty" colSpan={6}>
                      {filtered ? "אין אבחונים שמתאימים לסינון הזה" : "אין עדיין אבחונים"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager
            page={diagnoses.page} pages={diagnoses.pages} total={diagnoses.total}
            basePath="/admin/diagnoses" params={params} unit="אבחונים"
          />
        </div>
      </section>
    </main>
  );
}
