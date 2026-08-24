import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../server/db";
import { getTask, TASK_TYPE_LABEL_HE, ASSIGNEE_LABEL_HE, type TaskType } from "../../../../server/tasks";
import { requireAdmin } from "../../require-admin";
import { StatusChip, PriorityChip, TaskPanel } from "../task-panel";

export const dynamic = "force-dynamic";

// משימה בודדת בקישור ישיר (למשל מתוך הודעה בערוץ). אותו פאנל בדיוק כמו באקורדיון של
// הלוח - task-panel.tsx הוא הבית היחיד של הטופס וההיסטוריה
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

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title flush">{t.title}</h2>
            <span className="text-xs" style={{ color: "var(--mut)" }}>{TASK_TYPE_LABEL_HE[t.type as TaskType] ?? t.type}</span>
            <PriorityChip priority={t.priority} />
            <StatusChip status={t.status} />
            {t.assignee != null && (
              <span className="text-xs" style={{ color: "var(--mut)" }}>{ASSIGNEE_LABEL_HE[t.assignee] ?? t.assignee}</span>
            )}
          </div>

          <TaskPanel task={t} events={t.eventRows} />
        </div>
      </section>
    </main>
  );
}
