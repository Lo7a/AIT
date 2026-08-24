import type { PrismaClient } from "@prisma/client";
import { isAdmin } from "./auth/guard";
import type { SessionUser } from "./auth/session";
import { sanitizeChatText, AGENT_NAMES } from "./agent-chat";

// לוח המשימות (הכרעת מייסד 21.8): כל הבאגים, הפיצ'רים, המשימות והרעיונות במקום אחד,
// עם עדיפות, סטטוס, אחראי וקישור לקומיטים. הסוכנים מעדכנים דרך ה-MCP והסקריפטים
// (הזהות מ-AIT_AGENT_NAME), המייסדים מהמסך בניהול. כל שינוי נרשם ב-task_events -
// זו התשובה ל"מי עשה את השינוי"; עריכות מהמסך נרשמות בנוסף ביומן הפעולות עם החשבון,
// באותה תבנית כמו הודעות הערוץ.

export const TASK_TYPES = ["bug", "feature", "task", "idea"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_TYPE_LABEL_HE: Record<TaskType, string> = {
  bug: "באג", feature: "פיצ'ר", task: "משימה", idea: "רעיון",
};

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done", "dropped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL_HE: Record<TaskStatus, string> = {
  open: "פתוח", in_progress: "בעבודה", blocked: "חסום", done: "הושלם", dropped: "ירד",
};

export const TASK_PRIORITIES = [0, 1, 2, 3] as const;
export const TASK_PRIORITY_LABEL_HE: Record<number, string> = {
  0: "בוער", 1: "חשוב", 2: "רגיל", 3: "בהמשך",
};

// אחראים: שני הסוכנים ושני המייסדים. שמות פרטיים בלבד - שום כתובת מייל בריפו הציבורי
export const TASK_ASSIGNEES = [...AGENT_NAMES, "lahav", "elad"] as const;
export type TaskAssignee = (typeof TASK_ASSIGNEES)[number];
export const ASSIGNEE_LABEL_HE: Record<string, string> = {
  "lahav-claude": "הקלוד של להב", "elad-claude": "הקלוד של אלעד", lahav: "להב", elad: "אלעד",
};

export const MAX_TITLE_CHARS = 140;
export const MAX_DETAILS_CHARS = 2000;

export const isTaskType = (v: unknown): v is TaskType =>
  typeof v === "string" && (TASK_TYPES as readonly string[]).includes(v);
export const isTaskStatus = (v: unknown): v is TaskStatus =>
  typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
export const isTaskAssignee = (v: unknown): v is TaskAssignee =>
  typeof v === "string" && (TASK_ASSIGNEES as readonly string[]).includes(v);
export const isTaskPriority = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;

export interface TaskRow {
  id: string;
  num: number;
  title: string;
  details: string;
  type: string;
  status: string;
  priority: number;
  assignee: string | null;
  blockedOn: string | null;
  commits: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskListFilter {
  status?: TaskStatus;
  type?: TaskType;
  assignee?: TaskAssignee;
  priority?: number;
  q?: string;
  /** ברירת המחדל מסתירה את מה שנסגר - הלוח הוא "מה עכשיו", לא ארכיון */
  includeClosed?: boolean;
}

/** הפתוח והבוער קודם: סטטוס פתוח/בעבודה/חסום לפני הושלם/ירד, ובתוך זה עדיפות ואז ותק */
export async function listTasks(prisma: PrismaClient, f: TaskListFilter = {}): Promise<TaskRow[]> {
  const where: Record<string, unknown> = {};
  if (f.status != null) where.status = f.status;
  else if (!f.includeClosed) where.status = { notIn: ["done", "dropped"] };
  if (f.type != null) where.type = f.type;
  if (f.assignee != null) where.assignee = f.assignee;
  if (f.priority != null) where.priority = f.priority;
  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { details: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return prisma.task.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}

export interface CreateTaskInput {
  title: string;
  type: TaskType;
  details?: string;
  priority?: number;
  assignee?: TaskAssignee;
}

export async function createTask(prisma: PrismaClient, author: string, input: CreateTaskInput): Promise<TaskRow> {
  const title = sanitizeChatText(input.title);
  if (title.length === 0) throw new Error("למשימה חייבת להיות כותרת");
  if (title.length > MAX_TITLE_CHARS) throw new Error(`כותרת ארוכה מדי (מעל ${MAX_TITLE_CHARS} תווים)`);
  if (!isTaskType(input.type)) throw new Error("סוג לא מוכר (bug / feature / task / idea)");
  const details = sanitizeChatText(input.details ?? "");
  if (details.length > MAX_DETAILS_CHARS) throw new Error(`תיאור ארוך מדי (מעל ${MAX_DETAILS_CHARS} תווים)`);
  const priority = input.priority ?? 2;
  if (!isTaskPriority(priority)) throw new Error("עדיפות היא 0 עד 3");
  if (input.assignee != null && !isTaskAssignee(input.assignee)) throw new Error("אחראי לא מוכר");

  const task = await prisma.task.create({
    data: {
      title, details, type: input.type, priority,
      assignee: input.assignee ?? null, createdBy: author,
      events: { create: { author, field: "created", toValue: title } },
    },
  });
  return task;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: number;
  assignee?: TaskAssignee | "";
  blockedOn?: string;
  addCommit?: string;
  title?: string;
  details?: string;
  type?: TaskType;
}

/** עדכון לפי המספר האנושי. כל שדה שהשתנה מקבל שורת task_event עם מי-ממה-למה */
export async function updateTask(
  prisma: PrismaClient,
  author: string,
  num: number,
  input: UpdateTaskInput,
): Promise<TaskRow> {
  const task = await prisma.task.findUnique({ where: { num } });
  if (task == null) throw new Error(`אין משימה מספר ${num}`);

  const data: Record<string, unknown> = {};
  const events: { author: string; field: string; fromValue: string | null; toValue: string | null }[] = [];
  const change = (field: string, from: string | null, to: string | null) =>
    events.push({ author, field, fromValue: from, toValue: to });

  if (input.status != null && input.status !== task.status) {
    if (!isTaskStatus(input.status)) throw new Error("סטטוס לא מוכר");
    data.status = input.status;
    change("status", task.status, input.status);
  }
  if (input.priority != null && input.priority !== task.priority) {
    if (!isTaskPriority(input.priority)) throw new Error("עדיפות היא 0 עד 3");
    data.priority = input.priority;
    change("priority", String(task.priority), String(input.priority));
  }
  if (input.assignee != null) {
    const next = input.assignee === "" ? null : input.assignee;
    if (next != null && !isTaskAssignee(next)) throw new Error("אחראי לא מוכר");
    if (next !== task.assignee) {
      data.assignee = next;
      change("assignee", task.assignee, next);
    }
  }
  if (input.blockedOn != null) {
    const next = sanitizeChatText(input.blockedOn) || null;
    if (next !== task.blockedOn) {
      data.blockedOn = next;
      change("blockedOn", task.blockedOn, next);
    }
  }
  if (input.addCommit != null) {
    const hash = sanitizeChatText(input.addCommit);
    // רק תבנית של hash - שדה הקומיטים הוא קישורים לגיטהאב, לא טקסט חופשי
    if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error("קומיט חייב להיות hash (7 עד 40 תווי hex)");
    if (!task.commits.includes(hash)) {
      data.commits = { push: hash };
      change("commits", null, hash);
    }
  }
  if (input.title != null) {
    const title = sanitizeChatText(input.title);
    if (title.length === 0 || title.length > MAX_TITLE_CHARS) throw new Error("כותרת ריקה או ארוכה מדי");
    if (title !== task.title) {
      data.title = title;
      change("title", task.title, title);
    }
  }
  if (input.details != null) {
    const details = sanitizeChatText(input.details);
    if (details.length > MAX_DETAILS_CHARS) throw new Error("תיאור ארוך מדי");
    if (details !== task.details) {
      data.details = details;
      change("details", null, "עודכן");
    }
  }
  if (input.type != null && input.type !== task.type) {
    if (!isTaskType(input.type)) throw new Error("סוג לא מוכר");
    data.type = input.type;
    change("type", task.type, input.type);
  }

  if (events.length === 0) return task;
  return prisma.task.update({
    where: { id: task.id },
    data: { ...data, events: { create: events } },
  });
}

export interface TaskDetail extends TaskRow {
  eventRows: { author: string; field: string; fromValue: string | null; toValue: string | null; createdAt: Date }[];
}

export async function getTask(prisma: PrismaClient, num: number): Promise<TaskDetail | null> {
  const task = await prisma.task.findUnique({
    where: { num },
    include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (task == null) return null;
  const { events, ...row } = task;
  return { ...row, eventRows: events };
}

// --- ההאנדלר של טפסי הניהול (יצירה ועריכה) ---
// אותה תבנית כמו הערוץ ועורך הספרייה: טופס HTML בלי JS, האנדלר טהור, התרגום להפניה
// ב-route. המייסד נרשם ב-task_events כ-founder, והחשבון המדויק ביומן הפעולות

export interface TaskPostDeps {
  getRealUser: () => Promise<SessionUser | null>;
  create: (author: string, input: CreateTaskInput) => Promise<TaskRow>;
  update: (author: string, num: number, input: UpdateTaskInput) => Promise<TaskRow>;
  emit: (input: { type: "task_changed"; userId: string; metadata: Record<string, unknown> }) => Promise<void>;
}

export type TaskPostResult =
  | { kind: "ok"; num: number }
  | { kind: "error"; status: number; message: string };

const str = (form: FormData, key: string): string | undefined => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

export function makeTaskPostHandler(deps: TaskPostDeps) {
  return async function handle(form: FormData): Promise<TaskPostResult> {
    const real = await deps.getRealUser();
    if (real == null) return { kind: "error", status: 401, message: "נדרשת התחברות" };
    if (!isAdmin(real)) return { kind: "error", status: 404, message: "לא נמצא" };

    const action = str(form, "action");
    try {
      if (action === "create") {
        const title = str(form, "title");
        const type = str(form, "type");
        if (title == null || !isTaskType(type)) return { kind: "error", status: 400, message: "חסרה כותרת או סוג" };
        const priorityRaw = str(form, "priority");
        const task = await deps.create("founder", {
          title, type,
          details: str(form, "details"),
          priority: priorityRaw != null ? Number(priorityRaw) : undefined,
          assignee: str(form, "assignee") as TaskAssignee | undefined,
        });
        await deps.emit({ type: "task_changed", userId: real.id, metadata: { num: task.num, action: "create" } });
        return { kind: "ok", num: task.num };
      }
      if (action === "update") {
        const num = Number(str(form, "num"));
        if (!Number.isInteger(num)) return { kind: "error", status: 400, message: "מספר משימה חסר" };
        const priorityRaw = str(form, "priority");
        const task = await deps.update("founder", num, {
          status: str(form, "status") as TaskStatus | undefined,
          priority: priorityRaw != null ? Number(priorityRaw) : undefined,
          // שדה ריק בטופס העריכה פירושו "נקה אחראי" - בשונה מ-undefined שמשמעו "אל תיגע"
          assignee: (form.get("assignee") != null ? String(form.get("assignee")) : undefined) as TaskAssignee | "" | undefined,
          blockedOn: form.get("blockedOn") != null ? String(form.get("blockedOn")) : undefined,
          addCommit: str(form, "addCommit"),
          title: str(form, "title"),
          details: form.get("details") != null ? String(form.get("details")) : undefined,
          type: str(form, "type") as TaskType | undefined,
        });
        await deps.emit({ type: "task_changed", userId: real.id, metadata: { num: task.num, action: "update" } });
        return { kind: "ok", num: task.num };
      }
      return { kind: "error", status: 400, message: "פעולה לא מוכרת" };
    } catch (e) {
      return { kind: "error", status: 400, message: e instanceof Error ? e.message : "שגיאה" };
    }
  };
}
