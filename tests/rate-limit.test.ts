import { describe, expect, it } from "vitest";
import { enforceRateLimit, RATE_RULES, type RateRule } from "../src/server/rate-limit";
import type { SessionUser } from "../src/server/auth/session";
import { makeFakeDb } from "./fakes/fake-db";

// הגבלת הקצב (rate-limit.ts): ספירת אירועי usage_events בחלון זמן, אדמין פטור, fail-open

const USER: SessionUser = { id: "user-1", authId: "a1", email: "a@example.com", role: "owner" };
const ADMIN: SessionUser = { id: "user-9", authId: "a9", email: "x@example.com", role: "admin" };
const RULE: RateRule = { type: "search", limit: 3, windowSeconds: 3600 };

function seedEvents(fake: ReturnType<typeof makeFakeDb>, n: number, createdAt: Date, userId = USER.id) {
  for (let i = 0; i < n; i++) {
    fake.usageEvents.push({
      id: `evt-${userId}-${createdAt.getTime()}-${i}`, type: RULE.type, userId, actorUserId: userId,
      entityType: null, entityId: null, metadata: null, createdAt,
    });
  }
}

describe("enforceRateLimit", () => {
  it("מתחת לגבול עובר; בגבול נחסם 429 עם הודעה עברית", async () => {
    const fake = makeFakeDb();
    const now = new Date("2026-08-16T12:00:00Z");
    seedEvents(fake, 2, new Date("2026-08-16T11:30:00Z"));
    expect(await enforceRateLimit(fake.db, USER, RULE, now)).toBeNull();
    seedEvents(fake, 1, new Date("2026-08-16T11:45:00Z"));
    const blocked = await enforceRateLimit(fake.db, USER, RULE, now);
    expect(blocked?.status).toBe(429);
    expect((await blocked!.json()).error).toContain("יותר מדי");
  });

  it("אירועים מחוץ לחלון ואירועים של משתמש אחר לא נספרים", async () => {
    const fake = makeFakeDb();
    const now = new Date("2026-08-16T12:00:00Z");
    seedEvents(fake, 5, new Date("2026-08-16T10:00:00Z"));            // לפני החלון
    seedEvents(fake, 5, new Date("2026-08-16T11:50:00Z"), "user-2");  // משתמש אחר
    expect(await enforceRateLimit(fake.db, USER, RULE, now)).toBeNull();
  });

  it("אדמין לא מוגבל גם מעל הגבול", async () => {
    const fake = makeFakeDb();
    const now = new Date("2026-08-16T12:00:00Z");
    seedEvents(fake, 10, new Date("2026-08-16T11:50:00Z"), ADMIN.id);
    expect(await enforceRateLimit(fake.db, ADMIN, RULE, now)).toBeNull();
  });

  it("fail-open: כשל ספירה מעביר את הבקשה (זמינות קודמת לחסימה)", async () => {
    const failing = { usageEvent: { count: async () => { throw new Error("db down"); } } };
    expect(await enforceRateLimit(failing, USER, RULE)).toBeNull();
  });

  it("כללי האמת מצביעים על סוגי אירועים שקיימים ביומן", () => {
    // שומר סנכרון: כל rule.type חייב להיות ערך חוקי של USAGE_EVENT_TYPES - נאכף בטיפוסים,
    // וכאן רק מוודאים שהחוקים סבירים (limit חיובי, חלון חיובי)
    for (const rule of Object.values(RATE_RULES)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
  });
});
