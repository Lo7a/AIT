import Link from "next/link";
import { prisma } from "../../../server/db";
import { listAllDiagnoses } from "../../../server/admin-read";
import { DIAGNOSIS_STATUS_LABEL } from "../../../pipeline/report/presenter";
import type { DiagnosisStatus } from "../../../server/status";
import { requireAdmin } from "../require-admin";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

// כל האבחונים במערכת (100 האחרונים - התיחום הוא בשאילתה). כשהיה מקטע בתוך עמוד אחד הוא
// ישב בתיבת גלילה בגובה קבוע; עכשיו זה עמוד, והרשימה פשוט נגללת עם המסך
export default async function AdminDiagnosesPage() {
  await requireAdmin();

  const diagnoses = await listAllDiagnoses(prisma);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">כל האבחונים</h2>
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
                {diagnoses.map((d) => (
                  <tr key={d.id}>
                    <td className="t-strong">{d.businessName}</td>
                    <td className="t-mut" dir="ltr">{d.ownerEmail ?? "-"}</td>
                    <td className="t-mut">{DIAGNOSIS_STATUS_LABEL[d.status as DiagnosisStatus] ?? d.status}</td>
                    <td className="num">{d.overall ?? "-"}</td>
                    <td className="t-mut">{DATE_FMT.format(d.createdAt)}</td>
                    <td><Link href={`/report/${d.id}`} className="ghost-act">לדוח</Link></td>
                  </tr>
                ))}
                {diagnoses.length === 0 && (
                  <tr><td className="t-empty" colSpan={6}>אין עדיין אבחונים</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
