import {
  TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES,
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE,
  type TaskRow, type TaskType, type TaskStatus,
} from "../../../server/tasks";
import { DATE_FMT } from "../labels";

// הרכיבים המשותפים של לוח המשימות: צ'יפי הצבע, טופס העריכה וההיסטוריה - משרתים גם את
// האקורדיון ברשימה וגם את דף המשימה הבודדת, כדי ששינוי עיצוב לא יתפצל לשני עותקים.
//
// סכמת הצבעים (בקשת מייסד 21.8): ירוק הושלם, כתום בעבודה, צהוב נקודת עצירה (חסום),
// אדום דחוף (עדיפות בוער - דחיפות היא מאפיין של העדיפות, לא של הסטטוס), אפור ירד.

const TAG_BASE = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";

export const STATUS_TAG: Record<string, string> = {
  open: `${TAG_BASE} border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] text-[color:var(--txt)]`,
  in_progress: `${TAG_BASE} border-[rgba(var(--work-rgb),0.35)] bg-[rgba(var(--work-rgb),0.1)] text-[color:var(--work)]`,
  blocked: `${TAG_BASE} border-[rgba(var(--warn-rgb),0.35)] bg-[rgba(var(--warn-rgb),0.1)] text-[color:var(--warn)]`,
  done: `${TAG_BASE} border-[rgba(var(--acc2-rgb),0.3)] bg-[rgba(var(--acc2-rgb),0.08)] text-[color:var(--acc2-soft)]`,
  dropped: `${TAG_BASE} border-[color:var(--hair-soft)] bg-[color:var(--surface-1)] text-[color:var(--mut)]`,
};

export const PRIORITY_TAG: Record<number, string> = {
  0: `${TAG_BASE} border-[rgba(var(--bad-rgb),0.35)] bg-[rgba(var(--bad-rgb),0.09)] text-[color:var(--bad)]`,
  1: `${TAG_BASE} border-[rgba(var(--work-rgb),0.3)] bg-transparent text-[color:var(--work)]`,
  2: `${TAG_BASE} border-[color:var(--hair-soft)] bg-transparent text-[color:var(--mut)]`,
  3: `${TAG_BASE} border-[color:var(--hair-soft)] bg-transparent text-[color:var(--dim)]`,
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={STATUS_TAG[status] ?? STATUS_TAG.open}>
      {TASK_STATUS_LABEL_HE[status as TaskStatus] ?? status}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: number }) {
  return (
    <span className={PRIORITY_TAG[priority] ?? PRIORITY_TAG[2]}>
      {TASK_PRIORITY_LABEL_HE[priority] ?? priority}
    </span>
  );
}

export interface TaskEventRow {
  author: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
}

const AUTHOR_LABEL: Record<string, string> = { ...ASSIGNEE_LABEL_HE, founder: "מייסד" };

const FIELD_LABEL: Record<string, string> = {
  created: "פתיחה", status: "סטטוס", priority: "עדיפות", assignee: "אחראי",
  blockedOn: "חסימה", commits: "קומיט", title: "כותרת", details: "תיאור", type: "סוג",
};

const valueLabel = (field: string, v: string | null): string => {
  if (v == null) return "-";
  if (field === "status") return TASK_STATUS_LABEL_HE[v as TaskStatus] ?? v;
  if (field === "priority") return TASK_PRIORITY_LABEL_HE[Number(v)] ?? v;
  if (field === "assignee") return AUTHOR_LABEL[v] ?? v;
  if (field === "type") return TASK_TYPE_LABEL_HE[v as TaskType] ?? v;
  return v;
};

/** גוף המשימה המלא: תיאור, קומיטים, טופס עריכה והיסטוריית מי-שינה-מה */
export function TaskPanel({ task, events }: { task: TaskRow; events: TaskEventRow[] }) {
  return (
    <div className="acc-body">
      {task.details !== "" && (
        <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
          {task.details}
        </p>
      )}

      {task.commits.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--dim)" }}>
          קומיטים:{" "}
          {task.commits.map((c, i) => (
            <span key={c}>
              {i > 0 && " · "}
              <a href={`https://github.com/Lo7a/AIT/commit/${c}`} target="_blank" rel="noreferrer" className="num underline" dir="ltr">
                {c.slice(0, 7)}
              </a>
            </span>
          ))}
          <span className="ms-2">(רשימת הקבצים שהשתנו - בלחיצה על הקומיט)</span>
        </p>
      )}

      <form className="fbar mt-4" method="post" action="/api/admin/tasks">
        <input type="hidden" name="action" value="update" />
        <input type="hidden" name="num" value={task.num} />
        <span className="fld">
          <label htmlFor={`te-status-${task.num}`}>סטטוס</label>
          <select id={`te-status-${task.num}`} name="status" defaultValue={task.status}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL_HE[s]}</option>
            ))}
          </select>
        </span>
        <span className="fld">
          <label htmlFor={`te-p-${task.num}`}>עדיפות</label>
          <select id={`te-p-${task.num}`} name="priority" defaultValue={task.priority}>
            {[0, 1, 2, 3].map((p) => (
              <option key={p} value={p}>{TASK_PRIORITY_LABEL_HE[p]}</option>
            ))}
          </select>
        </span>
        <span className="fld">
          <label htmlFor={`te-assignee-${task.num}`}>אחראי</label>
          <select id={`te-assignee-${task.num}`} name="assignee" defaultValue={task.assignee ?? ""}>
            <option value="">בלי אחראי</option>
            {TASK_ASSIGNEES.map((a) => (
              <option key={a} value={a}>{ASSIGNEE_LABEL_HE[a]}</option>
            ))}
          </select>
        </span>
        <span className="fld">
          <label htmlFor={`te-type-${task.num}`}>סוג</label>
          <select id={`te-type-${task.num}`} name="type" defaultValue={task.type}>
            {TASK_TYPES.map((x) => (
              <option key={x} value={x}>{TASK_TYPE_LABEL_HE[x]}</option>
            ))}
          </select>
        </span>
        <span className="fld">
          <label htmlFor={`te-blocked-${task.num}`}>חסום על</label>
          <input id={`te-blocked-${task.num}`} type="text" name="blockedOn" defaultValue={task.blockedOn ?? ""} placeholder="ריק = לא חסום" />
        </span>
        <span className="fld">
          <label htmlFor={`te-commit-${task.num}`}>הצמדת קומיט</label>
          <input id={`te-commit-${task.num}`} type="text" name="addCommit" placeholder="hash" dir="ltr" />
        </span>
        <span className="fbar-act">
          <button type="submit" className="btn sm">שמירה</button>
        </span>
      </form>

      <p className="mt-2 text-[10.5px] font-bold tracking-[.12em]" style={{ color: "var(--dim)" }}>מי שינה מה</p>
      <ul>
        {events.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2 border-t py-2 text-sm first:border-t-0" style={{ borderColor: "var(--row-line)" }}>
            <span className="num text-xs" style={{ color: "var(--dim)" }}>{DATE_FMT.format(e.createdAt)}</span>
            <span className="font-semibold">{AUTHOR_LABEL[e.author] ?? e.author}</span>
            <span style={{ color: "var(--mut)" }}>
              {e.field === "created"
                ? "פתח את המשימה"
                : `${FIELD_LABEL[e.field] ?? e.field}: ${valueLabel(e.field, e.fromValue)} ל${valueLabel(e.field, e.toValue)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
