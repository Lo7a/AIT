import { describe, expect, it } from "vitest";
import { emitUsageEvent, usageEventForDiagnoseEvent } from "../src/server/usage-events";
import { makeFakeDb } from "./fakes/fake-db";

// יומן הפעולות (usage-events.ts): התפר היחיד לכתיבה - רישום שנכשל לעולם לא מפיל את הפעולה,
// actor ברירת מחדל = המשתמש עצמו (ההפרדה קיימת מהיום לטובת מצב ההתחזות של האדמין)

describe("emitUsageEvent", () => {
  it("כותב שורה מלאה; actorUserId ברירת מחדל = userId (פעולה עצמית)", async () => {
    const { db, usageEvents } = makeFakeDb();
    await emitUsageEvent(db, {
      type: "report_viewed", userId: "user-1", entityType: "diagnosis", entityId: "diag-1",
      metadata: { source: "test" },
    });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      type: "report_viewed", userId: "user-1", actorUserId: "user-1",
      entityType: "diagnosis", entityId: "diag-1", metadata: { source: "test" },
    });
  });

  it("actor שונה (התחזות עתידית) נשמר כמו שהוא", async () => {
    const { db, usageEvents } = makeFakeDb();
    await emitUsageEvent(db, { type: "login", userId: "user-1", actorUserId: "admin-9" });
    expect(usageEvents[0]).toMatchObject({ userId: "user-1", actorUserId: "admin-9" });
  });

  it("כשל כתיבה נבלע - הפעולה המתועדת לא נפגעת", async () => {
    const failing = { usageEvent: { create: async () => { throw new Error("db down"); } } };
    await expect(emitUsageEvent(failing, { type: "login", userId: "user-1" })).resolves.toBeUndefined();
  });
});

describe("usageEventForDiagnoseEvent", () => {
  it("created -> diagnosis_created, done -> scan_completed, כל השאר לא נרשמים", () => {
    expect(usageEventForDiagnoseEvent({ type: "created", diagnosisId: "d1" }, "u1")).toMatchObject({
      type: "diagnosis_created", userId: "u1", entityType: "diagnosis", entityId: "d1",
    });
    expect(usageEventForDiagnoseEvent({ type: "done", diagnosisId: "d1" }, "u1")).toMatchObject({
      type: "scan_completed", entityId: "d1",
    });
    expect(usageEventForDiagnoseEvent({ type: "step" }, "u1")).toBeNull();
    expect(usageEventForDiagnoseEvent({ type: "error" }, "u1")).toBeNull();
    // created בלי diagnosisId (לא אמור לקרות) - עדיף לא לרשום מאשר שורה חסרת ישות
    expect(usageEventForDiagnoseEvent({ type: "created" }, "u1")).toBeNull();
  });
});
