import { describe, expect, it } from "vitest";
import { resolveActingUser, isImpersonating, IMPERSONATE_COOKIE } from "../src/server/auth/impersonation";
import { makeImpersonateHandler } from "../src/server/api/admin-handlers";
import type { SessionUser } from "../src/server/auth/session";
import type { UsageEventInput } from "../src/server/usage-events";
import { makeFakeDb } from "./fakes/fake-db";

// מצב ההתחזות: ההכרעה הטהורה (רק אדמין הופך למישהו אחר; כל כשל נופל לזהות האמיתית)
// וה-handler של המתג (טופס start/stop, cookie, אירועי יומן) - הכול אופליין

const ADMIN: SessionUser = { id: "admin-1", authId: "a1", email: "admin@example.com", role: "admin" };
const OWNER: SessionUser = { id: "user-1", authId: "u1", email: "owner@example.com", role: "owner" };

function seedUser(fake: ReturnType<typeof makeFakeDb>, u: SessionUser) {
  fake.users.push({ id: u.id, authId: u.authId, email: u.email, role: u.role, createdAt: new Date(), updatedAt: new Date() });
}

describe("resolveActingUser", () => {
  it("אדמין עם target קיים - user הוא היעד, actor נשאר האדמין", async () => {
    const fake = makeFakeDb();
    seedUser(fake, OWNER);
    const acting = await resolveActingUser(fake.db, ADMIN, OWNER.id);
    expect(acting.user.id).toBe(OWNER.id);
    expect(acting.actor.id).toBe(ADMIN.id);
    expect(isImpersonating(acting)).toBe(true);
  });

  it("משתמש רגיל עם cookie של אחר - נשאר עצמו (אין מסלול הסלמה)", async () => {
    const fake = makeFakeDb();
    seedUser(fake, ADMIN);
    const acting = await resolveActingUser(fake.db, OWNER, ADMIN.id);
    expect(acting.user.id).toBe(OWNER.id);
    expect(isImpersonating(acting)).toBe(false);
  });

  it("target חסר, לא קיים, או עצמי - זהות אמיתית בשקט", async () => {
    const fake = makeFakeDb();
    for (const target of [null, "", "user-missing", ADMIN.id]) {
      const acting = await resolveActingUser(fake.db, ADMIN, target);
      expect(acting.user.id).toBe(ADMIN.id);
      expect(isImpersonating(acting)).toBe(false);
    }
  });
});

function formReq(fields: Record<string, string>, cookie?: string): Request {
  const body = new URLSearchParams(fields);
  return new Request("https://ait.example/api/admin/impersonate", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie != null ? { cookie } : {}),
    },
    body,
  });
}

function makeDeps(real: SessionUser | null, target: SessionUser | null) {
  const events: UsageEventInput[] = [];
  return {
    deps: {
      getRealUser: async () => real,
      findUserById: async (id: string) => (target != null && target.id === id ? target : null),
      emit: async (input: UsageEventInput) => { events.push(input); },
    },
    events,
  };
}

describe("makeImpersonateHandler", () => {
  it("start תקין: cookie נכתב, אירוע נרשם עם actor=אדמין, והביתה ב-303", async () => {
    const { deps, events } = makeDeps(ADMIN, OWNER);
    const res = await makeImpersonateHandler(deps)(formReq({ action: "start", userId: OWNER.id }));
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain(`${IMPERSONATE_COOKIE}=${OWNER.id}`);
    expect(events).toEqual([{ type: "impersonation_started", userId: OWNER.id, actorUserId: ADMIN.id }]);
  });

  it("stop: ה-cookie נמחק והעצירה נרשמת עם היעד מה-cookie הנוכחי", async () => {
    const { deps, events } = makeDeps(ADMIN, null);
    const res = await makeImpersonateHandler(deps)(
      formReq({ action: "stop" }, `${IMPERSONATE_COOKIE}=${OWNER.id}`),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(events).toEqual([{ type: "impersonation_stopped", userId: OWNER.id, actorUserId: ADMIN.id }]);
  });

  it("לא-אדמין מקבל 404 (כמו עמוד שלא קיים); אנונימי 401; target לא קיים 404; עצמי 400", async () => {
    const nonAdmin = makeDeps(OWNER, OWNER);
    expect((await makeImpersonateHandler(nonAdmin.deps)(formReq({ action: "start", userId: ADMIN.id }))).status).toBe(404);
    const anon = makeDeps(null, null);
    expect((await makeImpersonateHandler(anon.deps)(formReq({ action: "start", userId: OWNER.id }))).status).toBe(401);
    const missing = makeDeps(ADMIN, null);
    expect((await makeImpersonateHandler(missing.deps)(formReq({ action: "start", userId: "user-x" }))).status).toBe(404);
    const self = makeDeps(ADMIN, ADMIN);
    expect((await makeImpersonateHandler(self.deps)(formReq({ action: "start", userId: ADMIN.id }))).status).toBe(400);
  });

  it("פעולה לא מוכרת או חסרת userId - 400, בלי cookie ובלי אירוע", async () => {
    const { deps, events } = makeDeps(ADMIN, OWNER);
    const handler = makeImpersonateHandler(deps);
    expect((await handler(formReq({ action: "delete" }))).status).toBe(400);
    expect((await handler(formReq({ action: "start" }))).status).toBe(400);
    expect(events).toHaveLength(0);
  });
});
