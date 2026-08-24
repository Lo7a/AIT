import Link from "next/link";
import { prisma } from "../../../server/db";
import {
  listTasks, TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES,
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE,
  isTaskType, isTaskStatus, isTaskAssignee,
  type TaskType, type TaskStatus, type TaskAssignee,
} from "../../../server/tasks";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// גוון לפי סטטוס: הכללים כבר קיימים בטוקנים - חסום ובוער בולטים, סגור דהוי
const STATUS_COLOR: Record<string, string> = {
  open: "var(--txt)", in_progress: "var(--acc-soft)", blocked: "var(--warn)",
  done: "var(--mut)", dropped: "var(--mut)",
};

// לוח המשימות (הכרעת מייסד 21.8): הכל מהכל - באגים, פיצ'רים, משימות ורעיונות - עם סינון,
// עדיפות וסטטוס. ראש הלוח הוא התור: ממוין עדיפות ואז ותק, וסגורות מוסתרות כברירת מחדל
export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const status = one(sp.status);
  const type = one(sp.type);
  const assignee = one(sp.assignee);
  const q = one(sp.q) ?? "";
  const created = one(sp.created);

  const tasks = await listTasks(prisma, {
    status: isTaskStatus(status) ? status : undefined,
    type: isTaskType(type) ? type : undefined,
    assignee: isTaskAssignee(assignee) ? assignee : undefined,
    q: q || undefined,
    includeClosed: status === "done" || status === "dropped",
  });
  const filtered = Boolean(status || type || assignee || q);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">מה על הלוח</h2>

          <form className="fbar" method="get" action="/admin/tasks">
            <span className="fld">
              <label htmlFor="tk-q">חיפוש</label>
              <input id="tk-q" type="search" name="q" defaultValue={q} placeholder="כותרת או תיאור" />
            </span>
            <span className="fld">
              <label htmlFor="tk-status">סטטוס</label>
              <select id="tk-status" name="status" defaultValue={status ?? ""}>
                <option value="">פתוח (הכל)</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABEL_HE[s]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="tk-type">סוג</label>
              <select id="tk-type" name="type" defaultValue={type ?? ""}>
                <option value="">הכל</option>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>{TASK_TYPE_LABEL_HE[t]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="tk-assignee">אחראי</label>
              <select id="tk-assignee" name="assignee" defaultValue={assignee ?? ""}>
                <option value="">הכל</option>
                {TASK_ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{ASSIGNEE_LABEL_HE[a]}</option>
                ))}
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/tasks" className="clear">ניקוי</Link>}
            </span>
          </form>

          {created != null && (
            <p className="mb-3 text-xs font-semibold" style={{ color: "var(--acc2-soft)" }}>
              נפתחה משימה #{created}.
            </p>
          )}

          {tasks.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>
              {filtered ? "אין משימות שמתאימות לסינון." : "הלוח ריק - הכל סגור."}
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>משימה</th>
                    <th>סוג</th>
                    <th>עדיפות</th>
                    <th>סטטוס</th>
                    <th>אחראי</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="num t-mut">{t.num}</td>
                      <td className="t-strong">
                        {t.title}
                        {t.blockedOn != null && (
                          <span className="block text-xs" style={{ color: "var(--warn)" }}>חסום על: {t.blockedOn}</span>
                        )}
                      </td>
                      <td className="t-mut">{TASK_TYPE_LABEL_HE[t.type as TaskType] ?? t.type}</td>
                      <td>{TASK_PRIORITY_LABEL_HE[t.priority] ?? t.priority}</td>
                      <td style={{ color: STATUS_COLOR[t.status] ?? "var(--txt)" }}>
                        {TASK_STATUS_LABEL_HE[t.status as TaskStatus] ?? t.status}
                      </td>
                      <td className="t-mut">{t.assignee != null ? ASSIGNEE_LABEL_HE[t.assignee] ?? t.assignee : "-"}</td>
                      <td><Link href={`/admin/tasks/${t.num}`} className="ghost-act">לפרטים</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">משימה חדשה</h2>
          <form className="fbar" method="post" action="/api/admin/tasks">
            <input type="hidden" name="action" value="create" />
            <span className="fld" style={{ flex: 1 }}>
              <label htmlFor="tk-title">כותרת</label>
              <input id="tk-title" type="text" name="title" required maxLength={140} placeholder="מה צריך לקרות" />
            </span>
            <span className="fld">
              <label htmlFor="tk-ntype">סוג</label>
              <select id="tk-ntype" name="type" defaultValue="task">
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>{TASK_TYPE_LABEL_HE[t]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="tk-np">עדיפות</label>
              <select id="tk-np" name="priority" defaultValue="2">
                {[0, 1, 2, 3].map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABEL_HE[p]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="tk-nassignee">אחראי</label>
              <select id="tk-nassignee" name="assignee" defaultValue="">
                <option value="">בלי אחראי</option>
                {TASK_ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{ASSIGNEE_LABEL_HE[a]}</option>
                ))}
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">פתיחה</button>
            </span>
          </form>
        </div>
      </section>
    </main>
  );
}
