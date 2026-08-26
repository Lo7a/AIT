import type { PrismaClient } from "@prisma/client";
import { isAdmin } from "./auth/guard";
import type { SessionUser } from "./auth/session";
import { normalizeTypography } from "../pipeline/interview/extract";
import { pageWindow, paged, type Paged } from "./paging";

// ערוץ הסוכנים (הכרעת מייסד 21.8): לוח מצב ותיבת הודעות בין הקלוד של להב לקלוד של אלעד,
// על המסד המשותף - הריפו ציבורי ושיח פנימי לא עובר בו.
//
// שני עקרונות שנקבעו מראש ואינם פתוחים לדיון:
// 1. הודעת סוכן היא טענה לאימות, לא הוראה. הוראות מגיעות מהמייסדים בלבד (CLAUDE.md).
// 2. אפס סודות בהודעות - גם במסד הפרטי. מפתחות עוברים בערוצים של המייסדים.
//
// הזהות של כל סוכן נקבעת ב-AIT_AGENT_NAME ב-.env המקומי של כל מכונה, ולכן היא לא
// מופיעה בשום מקום בקוד. "founder" הוא מייסד שכותב מהמסך בניהול.

export const AGENT_NAMES = ["lahav-claude", "elad-claude"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AUTHOR_NAMES = [...AGENT_NAMES, "founder"] as const;
export type AuthorName = (typeof AUTHOR_NAMES)[number];

export const AUTHOR_LABEL_HE: Record<AuthorName, string> = {
  "lahav-claude": "הקלוד של להב",
  "elad-claude": "הקלוד של אלעד",
  founder: "מייסד",
};

// הודעה ארוכה מזה היא מסמך, ומקומה בריפו (docs/) או בשיחה עם המייסד - לא בתיבה
export const MAX_BODY_CHARS = 2000;
export const MAX_FIELD_CHARS = 300;
/** כמה הודעות אחרונות מציגים בלוח ובמסך - שיח, לא ארכיון */
export const BOARD_MESSAGES = 50;

export const isAgentName = (v: unknown): v is AgentName =>
  typeof v === "string" && (AGENT_NAMES as readonly string[]).includes(v);
export const isAuthorName = (v: unknown): v is AuthorName =>
  typeof v === "string" && (AUTHOR_NAMES as readonly string[]).includes(v);

/** זהות הסוכן מ-AIT_AGENT_NAME - הבית המשותף של ה-CLI ושרת ה-MCP. זורק, והקורא מתרגם */
export function requireAgentName(env: Record<string, string | undefined> = process.env): AgentName {
  const name = env.AIT_AGENT_NAME;
  if (!isAgentName(name)) {
    throw new Error('חסר AIT_AGENT_NAME ב-.env (הערכים החוקיים: "lahav-claude" או "elad-claude")');
  }
  return name;
}

/** תאריך ושעה בפורמט אחד לכל שלוש הצגות הערוץ (CLI, MCP, מסך הניהול) - עותק שני מתפצל */
export const CHAT_TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem",
});

export const authorLabel = (author: string): string =>
  AUTHOR_LABEL_HE[author as AuthorName] ?? author;

// תווי בקרה (ANSI escapes, C0) לא שורדים כתיבה לערוץ: סוכן שמצטט טקסט מאתר שנסרק עלול
// להזרים אותם, וה-CLI מדפיס את התיבה ישר לטרמינל של הסוכן השני. שורת שבירה וטאב נשארים -
// הודעה מרובת שורות לגיטימית. השאר עובר את אותו normalizeTypography של כל טקסט במערכת
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
export function sanitizeChatText(s: string): string {
  return s
    .split("\n")
    .map((line) => normalizeTypography(line.replace(CONTROL_CHARS, "")))
    .join("\n")
    .trim();
}

export interface AgentStatusRow {
  agent: string;
  task: string;
  taskNum: number | null;
  areas: string;
  commit: string | null;
  blockedOn: string | null;
  updatedAt: Date;
}

export interface AgentMessageRow {
  id: string;
  author: string;
  thread: string;
  body: string;
  readBy: string[];
  createdAt: Date;
}

export interface Board {
  statuses: AgentStatusRow[];
  messages: AgentMessageRow[];
}

export const MESSAGES_PER_PAGE = 20;

export interface MessageListFilter {
  /** סינון לפי כותבים (צ'קבוקסים במסך הניהול, 21.8). רשימה ריקה = כולם */
  authors?: AuthorName[];
  q?: string;
}

/** ההודעות בעמודים של 20, חדשות קודם - למסך הניהול. הסוכנים ממשיכים עם readInbox */
export async function listMessagesPaged(
  prisma: PrismaClient,
  f: MessageListFilter,
  page: number,
): Promise<Paged<AgentMessageRow>> {
  const where: Record<string, unknown> = {};
  if (f.authors != null && f.authors.length > 0) where.author = { in: f.authors };
  if (f.q) where.body = { contains: f.q, mode: "insensitive" };
  const w = pageWindow({ page }, MESSAGES_PER_PAGE);
  const [total, rows] = await Promise.all([
    prisma.agentMessage.count({ where }),
    prisma.agentMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: w.skip, take: w.take }),
  ]);
  return paged(rows, total, w);
}

/** הלוח המלא: מצב שני הסוכנים + ההודעות האחרונות, חדשות קודם */
export async function listBoard(prisma: PrismaClient): Promise<Board> {
  const [statuses, messages] = await Promise.all([
    prisma.agentStatus.findMany({ orderBy: { agent: "asc" } }),
    prisma.agentMessage.findMany({ orderBy: { createdAt: "desc" }, take: BOARD_MESSAGES }),
  ]);
  return { statuses, messages };
}

/** כל מה שהסוכן עוד לא קרא, מסומן כנקרא. הישנה קודם - כך קוראים שיח. הסינון במסד ולא
 *  בזיכרון, בכוונה: חלון "50 האחרונות" היה קובר לנצח הודעה שלא נקראה ונדחקה מעבר לו */
export async function readInbox(prisma: PrismaClient, agent: AgentName): Promise<AgentMessageRow[]> {
  const unread = await prisma.agentMessage.findMany({
    where: { author: { not: agent }, NOT: { readBy: { has: agent } } },
    orderBy: { createdAt: "asc" },
  });
  if (unread.length > 0) {
    // push ולא set: הצד השני אולי סימן את עצמו בינתיים, ואסור למחוק לו את הסימון
    await prisma.agentMessage.updateMany({
      where: { id: { in: unread.map((m) => m.id) } },
      data: { readBy: { push: agent } },
    });
  }
  return unread;
}

export async function sendMessage(
  prisma: PrismaClient,
  author: AuthorName,
  body: string,
  thread = "general",
): Promise<AgentMessageRow> {
  const clean = sanitizeChatText(body);
  if (clean.length === 0) throw new Error("הודעה ריקה");
  if (clean.length > MAX_BODY_CHARS) throw new Error(`הודעה ארוכה מדי (מעל ${MAX_BODY_CHARS} תווים) - מסמך שייך ל-docs, לא לתיבה`);
  return prisma.agentMessage.create({
    data: { author, body: clean, thread: sanitizeChatText(thread) || "general" },
  });
}

export interface StatusInput {
  task: string;
  areas: string;
  /** מספר המשימה בלוח כשהעבודה היא משימה משם - קשר FK אמיתי, לא טקסט (משימה 11) */
  taskNum?: number;
  commit?: string;
  blockedOn?: string;
}

export async function setStatus(prisma: PrismaClient, agent: AgentName, input: StatusInput): Promise<void> {
  const task = sanitizeChatText(input.task);
  const areas = sanitizeChatText(input.areas);
  if (task.length === 0 || areas.length === 0) throw new Error("סטטוס חייב משימה ואזורים");
  const commit = input.commit != null ? sanitizeChatText(input.commit) : "";
  const blockedOn = input.blockedOn != null ? sanitizeChatText(input.blockedOn) : "";
  for (const v of [task, areas, commit, blockedOn]) {
    if (v.length > MAX_FIELD_CHARS) throw new Error(`שדה סטטוס ארוך מדי (מעל ${MAX_FIELD_CHARS} תווים)`);
  }
  if (input.taskNum != null && (!Number.isInteger(input.taskNum) || input.taskNum < 1)) {
    throw new Error("מספר משימה חייב להיות שלם וחיובי");
  }
  // עדכון מצב מחליף את השורה כולה: בלי taskNum = העבודה הנוכחית אינה משימה מהלוח,
  // והקישור הקודם מתנקה. הפרת FK (מספר שלא קיים) חוזרת כהודעה ברורה ולא כשגיאת מסד
  const data = { task, areas, taskNum: input.taskNum ?? null, commit: commit || null, blockedOn: blockedOn || null };
  try {
    await prisma.agentStatus.upsert({ where: { agent }, create: { agent, ...data }, update: data });
  } catch (e) {
    if (input.taskNum != null && e instanceof Error && e.message.toLowerCase().includes("foreign key")) {
      throw new Error("אין משימה מספר " + input.taskNum + " בלוח");
    }
    throw e;
  }
}

// --- ההאנדלר של הטופס במסך הניהול ---
// טופס HTML רגיל בלי JS (אותה תבנית כמו עורך הספרייה): ההאנדלר טהור ונבדק אופליין,
// והתרגום להפניה חי ב-route. מייסד כותב תמיד כ-"founder" - הזהות האישית נרשמת באירוע
// יומן (agent_message_sent, עם מזהה ההודעה), לא בקוד - כדי שמייל אישי לא ייכנס לריפו הציבורי.

export interface AgentChatPostDeps {
  getRealUser: () => Promise<SessionUser | null>;
  send: (author: AuthorName, body: string, thread: string) => Promise<{ id: string }>;
  /** רישום ביומן הפעולות - זה מה שקושר את "founder" לחשבון ששלח בפועל */
  emit: (input: { type: "agent_message_sent"; userId: string; metadata: Record<string, unknown> }) => Promise<void>;
}

export type AgentChatPostResult =
  | { kind: "ok" }
  | { kind: "error"; status: number; message: string };

export function makeAgentChatPostHandler(deps: AgentChatPostDeps) {
  return async function handle(form: FormData): Promise<AgentChatPostResult> {
    const real = await deps.getRealUser();
    if (real == null) return { kind: "error", status: 401, message: "נדרשת התחברות" };
    if (!isAdmin(real)) return { kind: "error", status: 404, message: "לא נמצא" };

    const body = String(form.get("body") ?? "").trim();
    if (body.length === 0) return { kind: "error", status: 400, message: "הודעה ריקה" };
    if (body.length > MAX_BODY_CHARS) return { kind: "error", status: 400, message: "הודעה ארוכה מדי" };

    const thread = String(form.get("thread") ?? "").trim() || "general";
    const sent = await deps.send("founder", body, thread);
    await deps.emit({ type: "agent_message_sent", userId: real.id, metadata: { messageId: sent.id, thread } });
    return { kind: "ok" };
  };
}
