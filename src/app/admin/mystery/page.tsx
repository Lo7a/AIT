import Link from "next/link";
import { prisma } from "../../../server/db";
import { listMysteryProbes, type AdminProbeRow, type ProbeStatus } from "../../../server/run-mystery";
import { CHANNEL_NAME } from "../../../pipeline/mystery/evidence";
import { requireAdmin } from "../require-admin";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

// הלקוח הסמוי - מסך הניהול (משימה 10). שני תפקידים: לראות את כל הפניות (מה יצא, מה נענה,
// מה נכשל ולמה), ולטפל בתור של הערוצים המסייעים: וואטסאפ וטלפון נשלחים ביד מהטלפון של
// החברה, ומי ששלח מסמן כאן "נשלח" ואחר כך "ענו" / "לא ענו". טופס HTML בלי JS, כמו לוח המשימות

const STATUS_LABEL: Record<ProbeStatus, string> = {
  planned: "מתוכנן",
  sent: "נשלח, מחכים",
  answered: "נענה",
  unanswered: "לא נענה",
  failed: "נכשל",
  skipped: "דולג",
};

const ASSISTED = new Set(["whatsapp", "phone"]);

const fmt = (d: Date | null) => (d ? DATE_FMT.format(d) : "-");

function ActionCell({ p }: { p: AdminProbeRow }) {
  if (!ASSISTED.has(p.channel)) return <span className="t-mut">אוטומטי</span>;
  if (p.status === "planned") {
    return (
      <form method="post" action="/api/admin/mystery" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="probeId" value={p.id} />
        <button type="submit" name="action" value="sent" className="btn sm">שלחתי עכשיו</button>
        <button type="submit" name="action" value="skipped" className="ghost-act">דילוג</button>
      </form>
    );
  }
  if (p.status === "sent") {
    return (
      <form method="post" action="/api/admin/mystery" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="probeId" value={p.id} />
        <button type="submit" name="action" value="answered" className="btn sm">ענו עכשיו</button>
        <button type="submit" name="action" value="unanswered" className="ghost-act">לא ענו</button>
      </form>
    );
  }
  return <span className="t-mut">-</span>;
}

export default async function AdminMysteryPage() {
  await requireAdmin();
  const rows = await listMysteryProbes(prisma);
  const queue = rows.filter((p) => ASSISTED.has(p.channel) && (p.status === "planned" || p.status === "sent"));

  return (
    <main className="board">
      {queue.length > 0 && (
        <section className="shell c12 rv d1">
          <div className="core card-pad">
            <h2 className="card-title">לשליחה ביד</h2>
            <p className="-mt-2 mb-5 max-w-[64ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
              וואטסאפ וטלפון יוצאים מהטלפון של החברה. שולחים את הטקסט כמו שהוא, מסמנים "שלחתי",
              וכשיש תשובה - "ענו". אחרי 72 שעות בלי תשובה מסמנים "לא ענו".
            </p>
            <div className="facts wide">
              {queue.map((p) => (
                <div key={p.id} className={`f ${p.status === "sent" ? "work" : ""}`}>
                  <span className="k">{p.businessName} - {CHANNEL_NAME[p.channel]}</span>
                  <span className="v" dir="ltr">{p.target ?? p.businessPhone ?? "אין מספר - לחפש באתר"}</span>
                  <span className="why">מתוכנן ל-{fmt(p.scheduledFor)} בשם {p.senderName ?? ""}</span>
                  <span className="note" style={{ whiteSpace: "pre-wrap" }}>{p.messageBody}</span>
                  <span className="note"><ActionCell p={p} /></span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">כל הפניות</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>עסק</th>
                  <th>ערוץ</th>
                  <th>סטטוס</th>
                  <th>מתוכנן</th>
                  <th>נשלח</th>
                  <th>נענה</th>
                  <th>יעד / סיבה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="t-strong">{p.businessName}</td>
                    <td className="t-mut">{CHANNEL_NAME[p.channel]}</td>
                    <td className="t-mut">{STATUS_LABEL[p.status] ?? p.status}</td>
                    <td className="t-mut">{fmt(p.scheduledFor)}</td>
                    <td className="t-mut">{fmt(p.sentAt)}</td>
                    <td className="t-mut">{fmt(p.answeredAt)}</td>
                    <td className="t-mut" dir="ltr">{p.failReason ?? p.replyExcerpt ?? p.target ?? "-"}</td>
                    <td><Link href={`/report/${p.diagnosisId}`} className="ghost-act">לדוח</Link></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="t-empty" colSpan={8}>עוד לא הוזמנה אף בדיקה</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
