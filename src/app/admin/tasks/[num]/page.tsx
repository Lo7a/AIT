import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../server/db";
import {
  getTask, TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES,
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE,
  type TaskType, type TaskStatus,
} from "../../../../server/tasks";
import { requireAdmin } from "../../require-admin";
import { DATE_FMT } from "../../labels";

export const dynamic = "force-dynamic";

const AUTHOR_LABEL: Record<string, string> = { ...ASSIGNEE_LABEL_HE, founder: "מייסד" };

// תרגום שורת היסטוריה לעברית - "מי שינה מה" בלי להציג שמות שדות באנגלית לבד המסך
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

// משימה אחת: עריכה מלאה + ההיסטוריה ("מי עשה את השינוי") + הקומיטים שקשורים אליה
export default async function AdminTaskPage({ params }: { params: Promise<{ num: string }> }) {
  await requireAdmin();
  const { num: numRaw } = await params;
  const num = Number(numRaw);
  if (!Number.isInteger(num)) notFound();

  const t = await getTask(prisma, num);
  if (t == null) notFound();

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <nav className="cf-crumb">
            <Link href="/admin/tasks">לוח המשימות</Link>
            <span aria-hidden="true">/</span>
            <span>#{t.num}</span>
          </nav>

          <h2 className="card-title flush">{t.title}</h2>
          {t.details !== "" && (
            <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
              {t.details}
            </p>
          )}
          {t.commits.length > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--dim)" }}>
              קומיטים:{" "}
              {t.commits.map((c, i) => (
                <span key={c}>
                  {i > 0 && " · "}
                  <a href={`https://github.com/Lo7a/AIT/commit/${c}`} target="_blank" rel="noreferrer" className="num underline" dir="ltr">
                    {c.slice(0, 7)}
                  </a>
                </span>
              ))}
            </p>
          )}

          <form className="fbar mt-5" method="post" action="/api/admin/tasks">
            <input type="hidden" name="action" value="update" />
            <input type="hidden" name="num" value={t.num} />
            <span className="fld">
              <label htmlFor="te-status">סטטוס</label>
              <select id="te-status" name="status" defaultValue={t.status}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABEL_HE[s]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="te-p">עדיפות</label>
              <select id="te-p" name="priority" defaultValue={t.priority}>
                {[0, 1, 2, 3].map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABEL_HE[p]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="te-assignee">אחראי</label>
              <select id="te-assignee" name="assignee" defaultValue={t.assignee ?? ""}>
                <option value="">בלי אחראי</option>
                {TASK_ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{ASSIGNEE_LABEL_HE[a]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="te-type">סוג</label>
              <select id="te-type" name="type" defaultValue={t.type}>
                {TASK_TYPES.map((x) => (
                  <option key={x} value={x}>{TASK_TYPE_LABEL_HE[x]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="te-blocked">חסום על</label>
              <input id="te-blocked" type="text" name="blockedOn" defaultValue={t.blockedOn ?? ""} placeholder="ריק = לא חסום" />
            </span>
            <span className="fld">
              <label htmlFor="te-commit">הצמדת קומיט</label>
              <input id="te-commit" type="text" name="addCommit" placeholder="hash" dir="ltr" />
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">שמירה</button>
            </span>
          </form>
        </div>
      </section>

      <section className="shell c12 rv d2">
        <div className="core card-pad">
          <h2 className="card-title">מי שינה מה</h2>
          <ul>
            {t.eventRows.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 border-t py-2.5 text-sm first:border-t-0" style={{ borderColor: "var(--row-line)" }}>
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
      </section>
    </main>
  );
}
