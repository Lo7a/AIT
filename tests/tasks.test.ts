import { describe, expect, it } from "vitest";
import {
  TASK_TYPES, TASK_STATUSES, TASK_ASSIGNEES,
  isTaskType, isTaskStatus, isTaskAssignee, isTaskPriority,
  makeTaskPostHandler, type TaskRow,
} from "../src/server/tasks";
import type { SessionUser } from "../src/server/auth/session";

const admin: SessionUser = { id: "u1", authId: "a1", email: null, role: "admin" } as SessionUser;
const owner: SessionUser = { id: "u2", authId: "a2", email: null, role: "owner" } as SessionUser;

describe("רשימות סגורות", () => {
  it("ארבעה סוגים, חמישה סטטוסים, ארבעה אחראים - והוולידטורים מסכימים", () => {
    expect(TASK_TYPES).toHaveLength(4);
    expect(TASK_STATUSES).toHaveLength(5);
    expect(TASK_ASSIGNEES).toHaveLength(4);
    expect(isTaskType("bug")).toBe(true);
    expect(isTaskType("epic")).toBe(false);
    expect(isTaskStatus("in_progress")).toBe(true);
    expect(isTaskStatus("סגור")).toBe(false);
    expect(isTaskAssignee("lahav")).toBe(true);
    expect(isTaskAssignee("founder")).toBe(false);
    expect(isTaskPriority(0)).toBe(true);
    expect(isTaskPriority(4)).toBe(false);
    expect(isTaskPriority(1.5)).toBe(false);
  });
});

describe("makeTaskPostHandler", () => {
  const fakeTask = (num: number): TaskRow => ({
    id: "t1", num, title: "משימה", details: "", type: "task", status: "open", priority: 2,
    assignee: null, blockedOn: null, commits: [], createdBy: "founder",
    createdAt: new Date(0), updatedAt: new Date(0),
  });

  const collect = () => {
    const calls = { created: [] as unknown[], updated: [] as unknown[], events: [] as unknown[] };
    const deps = {
      getRealUser: async () => admin,
      create: async (author: string, input: unknown) => {
        calls.created.push({ author, input });
        return fakeTask(7);
      },
      update: async (author: string, num: number, input: unknown) => {
        calls.updated.push({ author, num, input });
        return fakeTask(num);
      },
      emit: async (input: unknown) => { calls.events.push(input); },
    };
    return { calls, deps };
  };

  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it("יצירה: נכתבת כ-founder, והחשבון נרשם ביומן עם מספר המשימה", async () => {
    const { calls, deps } = collect();
    const res = await makeTaskPostHandler(deps)(form({ action: "create", title: "לתקן את הזחלן", type: "bug", priority: "1" }));
    expect(res).toEqual({ kind: "ok", num: 7 });
    expect(calls.created).toHaveLength(1);
    expect(calls.events).toEqual([
      { type: "task_changed", userId: "u1", metadata: { num: 7, action: "create" } },
    ]);
  });

  it("יצירה בלי כותרת או עם סוג לא מוכר - 400 בלי יצירה ובלי אירוע", async () => {
    const { calls, deps } = collect();
    const handler = makeTaskPostHandler(deps);
    expect((await handler(form({ action: "create", type: "bug" }))).kind).toBe("error");
    expect((await handler(form({ action: "create", title: "א", type: "epic" }))).kind).toBe("error");
    expect(calls.created).toHaveLength(0);
    expect(calls.events).toHaveLength(0);
  });

  it("עדכון: מעביר את המספר והשדות, אחראי ריק פירושו ניקוי", async () => {
    const { calls, deps } = collect();
    const res = await makeTaskPostHandler(deps)(form({ action: "update", num: "14", status: "done", assignee: "" }));
    expect(res).toEqual({ kind: "ok", num: 14 });
    const u = calls.updated[0] as { num: number; input: { status: string; assignee: string } };
    expect(u.num).toBe(14);
    expect(u.input.status).toBe("done");
    expect(u.input.assignee).toBe("");
  });

  it("לא מחובר - 401, לא אדמין - 404", async () => {
    const { deps } = collect();
    const anon = makeTaskPostHandler({ ...deps, getRealUser: async () => null });
    expect(await anon(form({ action: "create", title: "א", type: "task" }))).toEqual({ kind: "error", status: 401, message: "נדרשת התחברות" });
    const notAdmin = makeTaskPostHandler({ ...deps, getRealUser: async () => owner });
    expect((await notAdmin(form({ action: "create", title: "א", type: "task" }))) ).toEqual({ kind: "error", status: 404, message: "לא נמצא" });
  });

  it("שגיאת ולידציה מהליבה חוזרת כ-400 עם ההודעה בעברית", async () => {
    const { deps } = collect();
    const failing = makeTaskPostHandler({
      ...deps,
      update: async () => { throw new Error("אין משימה מספר 99"); },
    });
    const res = await failing(form({ action: "update", num: "99", status: "done" }));
    expect(res).toEqual({ kind: "error", status: 400, message: "אין משימה מספר 99" });
  });
});
