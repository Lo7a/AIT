import Link from "next/link";
import { prisma } from "../../../server/db";
import {
  listTasks, TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES,
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE,
  isTaskType, isTaskStatus, isTaskAssignee, isTaskPriority,
  type TaskType, type TaskAssignee,
} from "../../../server/tasks";
import { requireAdmin } from "../require-admin";
import { StatusChip, PriorityChip, TaskPanel, type TaskEventRow } from "./task-panel";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// לוח המשימות (הכרעת מייסד 21.8): הכל מהכל, עם סינון מלא וצבעים לפי הסכמה שנקבעה -
// ירוק הושלם, כתום בעבודה, צהוב נקודת עצירה, אדום בוער. "לפרטים" הוא אקורדיון נייטיבי
// (details, בלי JS): הפתיחה מרחיבה את השורה עם התיאור, הקומיטים, העריכה וההיסטוריה
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
  const priorityRaw = one(sp.priority);
  const priority = priorityRaw != null && priorityRaw !== "" ? Number(priorityRaw) : undefined;
  const q = one(sp.q) ?? "";
  const created = one(sp.created);

  const tasks = await listTasks(prisma, {
    status: isTaskStatus(status) ? status : undefined,
    type: isTaskType(type) ? type : undefined,
    assignee: isTaskAssignee(assignee) ? assignee : undefined,
    priority: isTaskPriority(priority) ? priority : undefined,
    q: q || undefined,
    // "all" = להציג גם את מה שנסגר; סטטוס ספציפי ממילא גובר על ברירת המחדל
    includeClosed: status === "all",
  });
  const filtered = Boolean(status || type || assignee || priority != null || q);

  // ההיסטוריה של כל המשימות שמוצגות, בשליפה אחת - לא שאילתה לכל שורה
  const events = await prisma.taskEvent.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) } },
    orderBy: { createdAt: "desc" },
  });
  const eventsByTask = new Map<string, TaskEventRow[]>();
  for (const e of events) {
    const list = eventsByTask.get(e.taskId) ?? [];
    list.push(e);
    eventsByTask.set(e.taskId, list);
  }

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
                <option value="">כל הפתוח</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABEL_HE[s]}</option>
                ))}
                <option value="all">הכל, כולל סגורות</option>
              </select>
            </span>
            <span className="fld">
              <label htmlFor="tk-priority">עדיפות</label>
              <select id="tk-priority" name="priority" defaultValue={priorityRaw ?? ""}>
                <option value="">הכל</option>
                {[0, 1, 2, 3].map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABEL_HE[p]}</option>
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
            <div>
              {/* שורת הכותרות והשורות חולקות את אותו גריד - העמודות לא יכולות לזוז זו מזו */}
              <div className="acc-grid acc-head" aria-hidden="true">
                <span />
                <span>#</span>
                <span>משימה</span>
                <span>סוג</span>
                <span>עדיפות</span>
                <span>סטטוס</span>
                <span>אחראי</span>
              </div>
              {tasks.map((t) => (
                <details key={t.id} className="acc-row">
                  <summary className="acc-grid">
                    <span className="acc-arrow" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 6l-6 6 6 6" />
                      </svg>
                    </span>
                    <span className="num text-xs" style={{ color: "var(--dim)" }}>{t.num}</span>
                    <span className="min-w-0 text-sm font-bold">
                      {t.title}
                      {t.blockedOn != null && (
                        <span className="block text-xs font-normal" style={{ color: "var(--warn)" }}>חסום על: {t.blockedOn}</span>
                      )}
                    </span>
                    <span className="text-xs" style={{ color: "var(--mut)" }}>{TASK_TYPE_LABEL_HE[t.type as TaskType] ?? t.type}</span>
                    {/* צ'יפ צבעוני רק כשיש מה להדגיש - רגיל/בהמשך ופתוח הם טקסט שקט,
                        אחרת כל הלוח צועק והצבע מאבד את המשמעות שלו */}
                    <span>
                      {t.priority <= 1 ? <PriorityChip priority={t.priority} /> : (
                        <span className="text-xs" style={{ color: "var(--dim)" }}>{TASK_PRIORITY_LABEL_HE[t.priority]}</span>
                      )}
                    </span>
                    <span>
                      {t.status === "open" ? (
                        <span className="text-xs" style={{ color: "var(--mut)" }}>פתוח</span>
                      ) : (
                        <StatusChip status={t.status} />
                      )}
                    </span>
                    <span className="truncate text-xs" style={{ color: "var(--mut)" }}>
                      {t.assignee != null ? ASSIGNEE_LABEL_HE[t.assignee] ?? t.assignee : "-"}
                    </span>
                  </summary>
                  <TaskPanel task={t} events={eventsByTask.get(t.id) ?? []} />
                </details>
              ))}
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
