import { prisma } from "../../server/db";
import { getAdminOverview } from "../../server/admin-read";
import { DIAGNOSIS_STATUS_LABEL } from "../../pipeline/report/presenter";
import type { DiagnosisStatus } from "../../server/status";
import { requireAdmin } from "./require-admin";
import { EVENT_LABEL } from "./labels";

export const dynamic = "force-dynamic";

// סקירת הניהול: המונים, פילוח האבחונים לפי סטטוס והדופק של השבוע האחרון. כל שאר
// המקטעים עברו למסכים משלהם - העמוד הזה מריץ שאילתה אחת בלבד
export default async function AdminOverviewPage() {
  await requireAdmin();

  const overview = await getAdminOverview(prisma);

  const tiles = [
    { label: "משתמשים", value: overview.users },
    { label: "עסקים", value: overview.businesses },
    { label: "סריקות", value: overview.scans },
    { label: "עלות סריקות (USD)", value: overview.scanCostUsd.toFixed(2) },
  ];

  return (
    <main className="board">
      {tiles.map((tile, i) => (
        <section key={tile.label} className={`shell c3 rv d${i + 1}`}>
          <div className="core card-pad">
            <div className="text-xs font-semibold" style={{ color: "var(--mut)" }}>{tile.label}</div>
            <div className="num mt-2 text-3xl font-extrabold tracking-tight">{tile.value}</div>
          </div>
        </section>
      ))}

      <section className="shell c6 rv d5">
        <div className="core card-pad">
          <h2 className="card-title">אבחונים לפי סטטוס</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(overview.diagnosesByStatus).length === 0 && (
              <span className="text-sm" style={{ color: "var(--mut)" }}>אין עדיין אבחונים</span>
            )}
            {Object.entries(overview.diagnosesByStatus).map(([status, count]) => (
              <span key={status} className="chip">
                {DIAGNOSIS_STATUS_LABEL[status as DiagnosisStatus] ?? status}:{" "}
                <span className="num font-bold" style={{ color: "var(--txt)" }}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* אותה שורת גלולות בירוק (chip live) - הפרדה בצבע בין "מה יש במערכת" ל"מה קרה השבוע" */}
      <section className="shell c6 rv d6">
        <div className="core card-pad">
          <h2 className="card-title">פעילות בשבוע האחרון</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(overview.eventsByType7d).length === 0 && (
              <span className="text-sm" style={{ color: "var(--mut)" }}>אין עדיין אירועים ביומן</span>
            )}
            {Object.entries(overview.eventsByType7d).map(([type, count]) => (
              <span key={type} className="chip live">
                {EVENT_LABEL[type] ?? type}: <span className="num font-bold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
