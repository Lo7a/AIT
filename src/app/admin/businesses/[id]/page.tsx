import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../server/db";
import { getBusinessAdmin } from "../../../../server/business-admin";
import { INDUSTRY_LABEL_HE } from "../../../../pipeline/industry";
import { DIAGNOSIS_STATUS_LABEL } from "../../../../pipeline/report/presenter";
import type { DiagnosisStatus } from "../../../../server/status";
import { requireAdmin } from "../../require-admin";
import { DATE_FMT } from "../../labels";

export const dynamic = "force-dynamic";

// עסק אחד וכל האבחונים שלו לפי תאריך (בקשת מייסד 20.8). האבחונים אינם מעומדים כאן
// בכוונה: לעסק אחד יש יחידות ספורות, ועימוד על רשימה של שלוש שורות הוא פקד מיותר
export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const b = await getBusinessAdmin(prisma, id);
  if (b == null) notFound();

  const facts: { k: string; v: string }[] = [
    { k: "ענף", v: b.industry === "unknown" ? "לא זוהה" : INDUSTRY_LABEL_HE[b.industry] },
    { k: "עיר", v: b.city ?? "לא ידוע" },
    { k: "אתר", v: b.website ?? "אין" },
    { k: "טלפון", v: b.phone ?? "אין" },
    { k: "בעלים", v: b.ownerEmail ?? "ללא בעלים" },
  ];

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <nav className="cf-crumb">
            <Link href="/admin/businesses">עסקים</Link>
            <span aria-hidden="true">/</span>
            <span>{b.name}</span>
          </nav>

          <h2 className="card-title flush">{b.name}</h2>

          <div className="facts wide mt-4">
            {facts.map((f) => (
              <div key={f.k} className="f">
                <span className="k">{f.k}</span>
                <span className="v" dir={f.k === "אתר" || f.k === "בעלים" ? "ltr" : undefined}>{f.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">האבחונים של העסק</h2>
          {b.diagnoses.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>אין עדיין אבחונים לעסק הזה.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>סטטוס</th>
                    <th>ציון</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {b.diagnoses.map((d) => (
                    <tr key={d.id}>
                      <td className="t-strong num">{DATE_FMT.format(d.createdAt)}</td>
                      <td className="t-mut">{DIAGNOSIS_STATUS_LABEL[d.status as DiagnosisStatus] ?? d.status}</td>
                      <td className="num">{d.overall ?? "-"}</td>
                      <td><Link href={`/report/${d.id}`} className="ghost-act">לדוח</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
