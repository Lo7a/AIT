import Link from "next/link";
import { prisma } from "../../../server/db";
import {
  listTasksPaged, TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES, TASK_SORTS,
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE, TASK_SORT_LABEL_HE,
  isTaskType, isTaskStatus, isTaskAssignee, isTaskSort,
  type TaskType, type TaskStatus, type TaskAssignee,
} from "../../../server/tasks";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_ONLY_FMT } from "../labels";
import { StatusChip, PriorityChip, TaskPanel, type TaskEventRow } from "./task-panel";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

// לוח המשימות (הכרעת מייסד 21.8): הכל מהכל, עם סינון מלא וצבעים לפי הסכמה שנקבעה -
// ירוק הושלם, כתום בעבודה, צהוב נקודת עצירה, אדום בוער. "לפרטים" הוא אקורדיון נייטיבי
// (details, בלי JS): הפתיחה מרחיבה את השורה עם התיאור, הקומיטים, העריכה וההיסטוריה.
// הסינון בצ'קבוקסים-גלולות (בקשת מייסד 21.8) - כל האפשרויות גלויות, ואפשר לבחור כמה
// ביחד ("בוער וגם חשוב"); בלי סימון סטטוס מוצג כל מה שלא נסגר
export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const statuses = many(sp.status).filter(isTaskStatus);
  const types = many(sp.type).filter(isTaskType);
  const assignees = many(sp.assignee).filter(isTaskAssignee);
  const priorities = many(sp.priority).map(Number).filter((p) => Number.isInteger(p) && p >= 0 && p <= 3);
  const q = one(sp.q) ?? "";
  const created = one(sp.created);
  const page = pageParam(one(sp.page));
  const sortRaw = one(sp.sort);
  const sort = isTaskSort(sortRaw) ? sortRaw : "priority";

  const list = await listTasksPaged(prisma, { statuses, types, assignees, priorities, q: q || undefined, sort }, page);
  const tasks = list.rows;
  const filtered = statuses.length + types.length + assignees.length + priorities.length > 0 || q !== "" || sort !== "priority";
  // הסינונים שורדים מעבר עמוד - ה-Pager משכפל מפתחות חוזרים בדיוק כמו שהטופס מגיש
  const pagerParams = {
    q: q || undefined,
    status: statuses.length > 0 ? statuses : undefined,
    type: types.length > 0 ? types : undefined,
    assignee: assignees.length > 0 ? assignees : undefined,
    priority: priorities.length > 0 ? priorities.map(String) : undefined,
    sort: sort !== "priority" ? sort : undefined,
  };

  // ההיסטוריה של כל המשימות שבעמוד, בשליפה אחת - לא שאילתה לכל שורה
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

          <form method="get" action="/admin/tasks" className="mb-4 flex flex-col gap-2.5">
            <div className="fbar" style={{ marginBottom: 0 }}>
              <span className="fld" style={{ flex: 1 }}>
                <label htmlFor="tk-q">חיפוש</label>
                <input id="tk-q" type="search" name="q" defaultValue={q} placeholder="כותרת או תיאור" />
              </span>
              <span className="fbar-act">
                <button type="submit" className="btn sm">סינון</button>
                {filtered && <Link href="/admin/tasks" className="clear">ניקוי</Link>}
              </span>
            </div>

            {/* שורה זורמת אחת לכל הקטגוריות (תיקון מייסד 21.8) - נשברת רק כשנגמר המקום */}
            <div className="fchips">
              <span className="fchips-cap">סטטוס</span>
              {TASK_STATUSES.map((s) => (
                <label key={s} className="fchip">
                  <input type="checkbox" name="status" value={s} defaultChecked={statuses.includes(s as TaskStatus)} />
                  <span>{TASK_STATUS_LABEL_HE[s]}</span>
                </label>
              ))}
              <span className="fchips-cap">עדיפות</span>
              {[0, 1, 2, 3].map((p) => (
                <label key={p} className="fchip">
                  <input type="checkbox" name="priority" value={p} defaultChecked={priorities.includes(p)} />
                  <span>{TASK_PRIORITY_LABEL_HE[p]}</span>
                </label>
              ))}
              <span className="fchips-cap">סוג</span>
              {TASK_TYPES.map((t) => (
                <label key={t} className="fchip">
                  <input type="checkbox" name="type" value={t} defaultChecked={types.includes(t as TaskType)} />
                  <span>{TASK_TYPE_LABEL_HE[t]}</span>
                </label>
              ))}
              <span className="fchips-cap">אחראי</span>
              {TASK_ASSIGNEES.map((a) => (
                <label key={a} className="fchip">
                  <input type="checkbox" name="assignee" value={a} defaultChecked={assignees.includes(a as TaskAssignee)} />
                  <span>{ASSIGNEE_LABEL_HE[a]}</span>
                </label>
              ))}
              {/* מיון הוא בחירה יחידה - radio באותו לבוש של הצ'יפים */}
              <span className="fchips-cap">מיון</span>
              {TASK_SORTS.map((s) => (
                <label key={s} className="fchip">
                  <input type="radio" name="sort" value={s} defaultChecked={sort === s} />
                  <span>{TASK_SORT_LABEL_HE[s]}</span>
                </label>
              ))}
            </div>
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
                <span>מס'</span>
                <span>משימה</span>
                <span>סוג</span>
                <span>עדיפות</span>
                <span>סטטוס</span>
                <span>אחראי</span>
                <span>נוצרה</span>
              </div>
              {tasks.map((t, i) => (
                <details key={t.id} className="acc-row">
                  <summary className="acc-grid">
                    <span className="acc-arrow" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 6l-6 6 6 6" />
                      </svg>
                    </span>
                    {/* מספר רץ של התצוגה (בקשת מייסד 21.8): תמיד 1 בראש, ממשיך בין עמודים -
                        עונה על "כמה יש ואיפה אני" גם כשהסינון והמיון משנים את הסדר */}
                    <span className="num text-xs" style={{ color: "var(--dim)" }}>
                      {(list.page - 1) * list.perPage + i + 1}
                    </span>
                    <span className="num text-xs font-semibold" style={{ color: "var(--mut)" }}>{t.num}</span>
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
                    <span className="num text-xs" style={{ color: "var(--dim)" }}>{DATE_ONLY_FMT.format(t.createdAt)}</span>
                  </summary>
                  <TaskPanel task={t} events={eventsByTask.get(t.id) ?? []} />
                </details>
              ))}
            </div>
          )}

          <Pager
            page={list.page} pages={list.pages} total={list.total}
            basePath="/admin/tasks" params={pagerParams} unit="משימות"
          />
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
