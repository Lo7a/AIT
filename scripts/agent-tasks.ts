import { PrismaClient } from "@prisma/client";
import { requireAgentName } from "../src/server/agent-chat";
import {
  TASK_TYPE_LABEL_HE, TASK_STATUS_LABEL_HE, TASK_PRIORITY_LABEL_HE, ASSIGNEE_LABEL_HE,
  isTaskType, isTaskStatus, isTaskAssignee,
  listTasks, createTask, updateTask, getTask,
  type TaskRow, type TaskType, type TaskStatus, type TaskAssignee,
} from "../src/server/tasks";

// לוח המשימות משורת הפקודה - הגיבוי של כלי ה-MCP (עובד גם בסשן שבו השרת לא אושר):
//   npm run tasks                                   הלוח הפתוח, ממוין עדיפות
//   npm run tasks -- show <num>                     משימה אחת עם ההיסטוריה שלה
//   npm run tasks -- create "כותרת" <type> [--p 0-3] [--assignee x] [--details "..."]
//   npm run tasks -- update <num> [--status s] [--p 0-3] [--assignee x] [--blocked "..."] [--commit hash]
//
// הזהות מ-AIT_AGENT_NAME, כמו בערוץ. שינוי מכאן נרשם ב-task_events על שם הסוכן.

const line = (t: TaskRow): string => {
  const parts = [
    `#${t.num}`,
    `[${TASK_TYPE_LABEL_HE[t.type as TaskType] ?? t.type}]`,
    t.title,
    `(${TASK_STATUS_LABEL_HE[t.status as TaskStatus] ?? t.status} · ${TASK_PRIORITY_LABEL_HE[t.priority] ?? t.priority})`,
  ];
  if (t.assignee) parts.push(`אצל ${ASSIGNEE_LABEL_HE[t.assignee] ?? t.assignee}`);
  if (t.blockedOn) parts.push(`| חסום על: ${t.blockedOn}`);
  return parts.join(" ");
};

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    switch (cmd) {
      case undefined:
      case "list": {
        const tasks = await listTasks(prisma, {});
        console.log(tasks.length === 0 ? "הלוח ריק - אין משימות פתוחות." : tasks.map(line).join("\n"));
        break;
      }
      case "show": {
        const num = Number(args[0]);
        const t = await getTask(prisma, num);
        if (t == null) { console.error(`אין משימה מספר ${args[0]}`); process.exit(1); }
        console.log(line(t));
        if (t.details) console.log(t.details);
        if (t.commits.length > 0) console.log("קומיטים:", t.commits.join(", "));
        console.log("--- היסטוריה ---");
        for (const e of t.eventRows) {
          const what = e.field === "created" ? "נפתחה" : `${e.field}: ${e.fromValue ?? "-"} -> ${e.toValue ?? "-"}`;
          console.log(`${e.createdAt.toISOString().slice(0, 16)} ${e.author}: ${what}`);
        }
        break;
      }
      case "create": {
        const agent = requireAgentName();
        const [title, type] = args.filter((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
        if (!title || !isTaskType(type)) {
          console.error("שימוש: npm run tasks -- create \"כותרת\" bug|feature|task|idea [--p 0-3] [--assignee x] [--details \"...\"]");
          process.exit(1);
        }
        const p = flag(args, "p");
        const assignee = flag(args, "assignee");
        if (assignee != null && !isTaskAssignee(assignee)) { console.error("אחראי לא מוכר"); process.exit(1); }
        const t = await createTask(prisma, agent, {
          title, type,
          priority: p != null ? Number(p) : undefined,
          assignee: assignee as TaskAssignee | undefined,
          details: flag(args, "details"),
        });
        console.log(`נפתחה משימה #${t.num}`);
        break;
      }
      case "update": {
        const agent = requireAgentName();
        const num = Number(args[0]);
        if (!Number.isInteger(num)) { console.error("שימוש: npm run tasks -- update <num> [--status s] [--p 0-3] [--assignee x] [--blocked \"...\"] [--commit hash]"); process.exit(1); }
        const status = flag(args, "status");
        if (status != null && !isTaskStatus(status)) { console.error("סטטוס לא מוכר"); process.exit(1); }
        const assignee = flag(args, "assignee");
        if (assignee != null && assignee !== "" && !isTaskAssignee(assignee)) { console.error("אחראי לא מוכר"); process.exit(1); }
        const p = flag(args, "p");
        const t = await updateTask(prisma, agent, num, {
          status: status as TaskStatus | undefined,
          priority: p != null ? Number(p) : undefined,
          assignee: assignee as TaskAssignee | "" | undefined,
          blockedOn: flag(args, "blocked"),
          addCommit: flag(args, "commit"),
        });
        console.log(`עודכנה: ${line(t)}`);
        break;
      }
      default:
        console.error("פקודות: list | show <num> | create | update <num>");
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
