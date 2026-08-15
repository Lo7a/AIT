import { describe, expect, it } from "vitest";
import { findLatestDiagnosis } from "../src/server/diagnosis-lookup";
import { makeFakeDb } from "./fakes/fake-db";

describe("findLatestDiagnosis", () => {
  it("אין עסק תואם (placeId) - מחזיר null", async () => {
    const { db } = makeFakeDb();
    expect(await findLatestDiagnosis(db, { placeId: "p1" })).toBeNull();
  });

  it("אין עסק תואם (url) - מחזיר null", async () => {
    const { db } = makeFakeDb();
    expect(await findLatestDiagnosis(db, { url: "https://x.co.il" })).toBeNull();
  });

  it("לא placeId ולא url - מחזיר null בלי לגעת ב-DB", async () => {
    const { db } = makeFakeDb();
    expect(await findLatestDiagnosis(db, {})).toBeNull();
  });

  it("עסק קיים בלי אבחונים - מחזיר null", async () => {
    const { db, businesses } = makeFakeDb();
    businesses.push({
      id: "biz-1", name: "עסק", placeId: "p1", websiteKey: null, website: null, phone: null,
      address: null, city: null,
    });
    expect(await findLatestDiagnosis(db, { placeId: "p1" })).toBeNull();
  });

  it("מוצא לפי placeId ומחזיר את האבחון האחרון (לא את הישן) עם גיל בשניות", async () => {
    const { db, businesses, diagnoses } = makeFakeDb();
    businesses.push({
      id: "biz-1", name: "עסק", placeId: "p1", websiteKey: null, website: null, phone: null,
      address: null, city: null,
    });
    const now = new Date("2026-08-14T12:00:00.000Z");
    diagnoses.push({
      id: "diag-old", businessId: "biz-1", status: "report_ready",
      createdAt: new Date("2026-08-14T11:00:00.000Z"),
    });
    diagnoses.push({
      id: "diag-new", businessId: "biz-1", status: "scanning",
      createdAt: new Date("2026-08-14T11:59:00.000Z"),
    });
    const result = await findLatestDiagnosis(db, { placeId: "p1" }, now);
    expect(result).toEqual({ diagnosisId: "diag-new", status: "scanning", ageSeconds: 60 });
  });

  it("מוצא לפי url מנורמל (websiteKey) - כתיבים שונים של אותו אתר מגיעים לאותו עסק", async () => {
    const { db, businesses, diagnoses } = makeFakeDb();
    businesses.push({
      id: "biz-2", name: "עסק אתר", placeId: null, websiteKey: "x.co.il",
      website: "https://x.co.il", phone: null, address: null, city: null,
    });
    const now = new Date("2026-08-14T12:00:00.000Z");
    diagnoses.push({
      id: "diag-1", businessId: "biz-2", status: "report_ready",
      createdAt: new Date("2026-08-14T11:55:00.000Z"),
    });
    const result = await findLatestDiagnosis(db, { url: "https://www.x.co.il/about" }, now);
    expect(result).toEqual({ diagnosisId: "diag-1", status: "report_ready", ageSeconds: 300 });
  });

  it("url פסול - לא זורק, מחזיר null (normalize נכשל)", async () => {
    const { db } = makeFakeDb();
    expect(await findLatestDiagnosis(db, { url: "mailto:x@y.il" })).toBeNull();
  });
});
