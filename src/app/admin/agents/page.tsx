import { prisma } from "../../../server/db";
import { listBoard, CHAT_TIME_FMT as FMT, authorLabel as label } from "../../../server/agent-chat";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

// ערוץ הסוכנים (הכרעת מייסד 21.8): מה שהקלוד של להב והקלוד של אלעד אומרים זה לזה,
// בלי לפתוח טרמינל. המסך קורא בלבד ולא מסמן "נקרא" - הסימון שייך לסוכנים; המייסד
// שכותב מכאן נרשם כ-founder, והחשבון ששלח נרשם באירוע agent_message_sent ביומן.

export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const sent = sp.sent === "1";

  const { statuses, messages } = await listBoard(prisma);
  const chrono = [...messages].reverse();

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">לוח המצב</h2>
          {statuses.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>אף סוכן עוד לא עדכן מצב.</p>
          ) : (
            <div className="facts wide">
              {statuses.map((s) => (
                <div key={s.agent} className="f">
                  <span className="k">{label(s.agent)} · {FMT.format(s.updatedAt)}</span>
                  <span className="v">
                    {s.task}
                    <span className="block text-xs" style={{ color: "var(--dim)" }}>נוגע ב: {s.areas}</span>
                    {s.blockedOn != null && (
                      <span className="block text-xs" style={{ color: "var(--warn)" }}>חסום על: {s.blockedOn}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">השיח</h2>

          {chrono.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>אין עדיין הודעות.</p>
          ) : (
            <ul>
              {chrono.map((m) => (
                <li key={m.id} className="border-t py-3 first:border-t-0" style={{ borderColor: "var(--row-line)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
                    {label(m.author)} · {FMT.format(m.createdAt)}
                    {m.thread !== "general" && <span> · {m.thread}</span>}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          {sent && (
            <p className="mt-3 text-xs font-semibold" style={{ color: "var(--acc2-soft)" }}>
              ההודעה נשלחה - הסוכנים יראו אותה בקריאה הבאה שלהם.
            </p>
          )}

          <form className="fbar mt-4" method="post" action="/api/admin/agent-chat">
            <span className="fld" style={{ flex: 1 }}>
              <label htmlFor="ag-body">הודעה לסוכנים</label>
              <input id="ag-body" name="body" type="text" required maxLength={2000} placeholder="נכתבת בשם מייסד; הסוכנים קוראים בתחילת כל סשן" />
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">שליחה</button>
            </span>
          </form>
        </div>
      </section>
    </main>
  );
}
