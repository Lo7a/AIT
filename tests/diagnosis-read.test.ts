import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { getReport, listRecentDiagnoses, toModelView } from "../src/server/diagnosis-read";
import { MODEL_SECTIONS } from "../src/pipeline/model/business-model";
import type { ScanFindings } from "../src/pipeline/types";

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק בדיקה", rating: 4.4, reviewCount: 8 },
  partial: ["no_website"],
  meta: { startedAt: "2026-08-13T00:00:00Z", durationMs: 2700, placesCalls: 2, llmInputTokens: 900, llmOutputTokens: 500, estCostUsd: 0.06 },
};
const scores = { overall: 77, dimensions: [], topGaps: [], topStrengths: [] };
const model = {
  data: { profile: { name: "עסק בדיקה" } },
  fieldSources: { profile: ["scan"] },
  credits: { profile: 0.5, channels: 0, lead_flow: 0, scheduling: 0, service: 0, billing: 0, retention: 0, tools: 0, pains: 0, manual_tasks: 0 },
  completenessPct: 15,
};

const businessRow = { id: "b1", name: "עסק בדיקה", placeId: "p1", websiteKey: null, website: null, city: null, createdAt: new Date("2026-08-13") };

// diagnosis.findUnique/findMany כ-vi.fn (כמו tests/diagnosis-repo.test.ts) - כדי שהקריאה עצמה (limit, select) תהיה נבדקת, לא רק התוצאה
function fakeDb(diagnosisRow: unknown, listRows: unknown[] = []) {
  return {
    diagnosis: {
      findUnique: vi.fn().mockResolvedValue(diagnosisRow),
      findMany: vi.fn().mockResolvedValue(listRows),
    },
  };
}

function diagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1", businessId: "b1", status: "report_ready",
    createdAt: new Date("2026-08-13"), updatedAt: new Date("2026-08-13"),
    business: businessRow,
    scans: [{
      id: "s1", diagnosisId: "d1", findings, scores,
      narrative: { narrative: { headline: "כותרת", summary: "סיכום", gapExplanations: [] }, usage: { inputTokens: 1, outputTokens: 2 }, usedFallback: false },
      llmCost: new Prisma.Decimal("0"), apiCost: new Prisma.Decimal("0.06"), durationMs: 2700, createdAt: new Date("2026-08-13"),
    }],
    businessModel: { id: "m1", diagnosisId: "d1", ...model, updatedAt: new Date("2026-08-13") },
    ...overrides,
  };
}

// משימה 3-12, פריט 7: תיקון תואם ל-getInterviewState (interview-repo.ts) - שורת מודל שנשמרה
// לפני שסקציה חדשה נוספה ל-MODEL_SECTIONS הייתה מחזירה credits[section]===undefined, ו-
// undefined < 1 הוא false ב-JS - recommendNextStep היה מתייחס לסקציה כאילו כבר הושלמה
describe("toModelView - מילוי קרדיטים חסרים", () => {
  it("סקציה שחסרה ב-credits הגולמי מקבלת 0, לא undefined; סקציות קיימות לא נדרסות", () => {
    const raw = {
      data: {}, fieldSources: {},
      credits: { profile: 1 } as Record<string, number>, // כל שאר הסקציות חסרות בכוונה
      completenessPct: 10,
      updatedAt: new Date("2026-08-13"),
    };
    const view = toModelView(raw as never);
    for (const s of MODEL_SECTIONS) {
      expect(typeof view.credits[s]).toBe("number");
    }
    expect(view.credits.profile).toBe(1);
    expect(view.credits.channels).toBe(0);
    expect(view.credits.lead_flow).toBe(0);
  });
});

describe("getReport", () => {
  it("מחזיר null כשהאבחון לא קיים", async () => {
    expect(await getReport(fakeDb(null) as never, "אין")).toBeNull();
  });

  it("ממיר Decimal למספר וקורא findings/scores לטיפוסי הדומיין", async () => {
    const r = await getReport(fakeDb(diagRow()) as never, "d1");
    expect(r?.scan?.apiCost).toBe(0.06);
    expect(typeof r?.scan?.apiCost).toBe("number");
    expect(r?.scan?.llmCost).toBe(0);
    expect(typeof r?.scan?.llmCost).toBe("number");
    expect(r?.scan?.findings.business.name).toBe("עסק בדיקה");
    expect(r?.scan?.scores?.overall).toBe(77);
  });

  it("נרטיב חדש: usedFallback ו-usage נשמרים בתצוגה", async () => {
    const r = await getReport(fakeDb(diagRow()) as never, "d1");
    expect(r?.scan?.narrative?.usedFallback).toBe(false);
    expect(r?.scan?.narrative?.usage?.outputTokens).toBe(2);
  });

  it("נרטיב ישן (ReportNarrative ישיר, בלי מעטפת) - פרובננס null, הנרטיב עצמו נקרא", async () => {
    const row = diagRow();
    (row.scans[0] as { narrative: unknown }).narrative = { headline: "ישן", summary: "ס", gapExplanations: [] };
    const r = await getReport(fakeDb(row) as never, "d1");
    expect(r?.scan?.narrative?.narrative.headline).toBe("ישן");
    expect(r?.scan?.narrative?.usedFallback).toBeNull();
    expect(r?.scan?.narrative?.usage).toBeNull();
  });

  it("מעטפה חדשה בלי פרובננס (usedFallback/usage חסרים) - נשמר null, לא false/undefined", async () => {
    const row = diagRow();
    (row.scans[0] as { narrative: unknown }).narrative = {
      narrative: { headline: "h", summary: "s", gapExplanations: [] },
    };
    const r = await getReport(fakeDb(row) as never, "d1");
    expect(r?.scan?.narrative?.usedFallback).toBeNull();
    expect(r?.scan?.narrative?.usage).toBeNull();
  });

  it("מעטפה עם narrative מקונן פגום (null) - לא זריקה, מתדרדר לנרטיב null", async () => {
    const row = diagRow();
    (row.scans[0] as { narrative: unknown }).narrative = { narrative: null, usedFallback: true };
    const r = await getReport(fakeDb(row) as never, "d1");
    expect(r?.scan?.narrative).toBeNull();
  });

  it("מודל העסק משוחזר כולל credits, ו-nextStep מחושב ממנו", async () => {
    const r = await getReport(fakeDb(diagRow()) as never, "d1");
    expect(r?.model?.completenessPct).toBe(15);
    expect(r?.nextStep?.action).toBe("free_text"); // 15% מתחת לסף free_text
  });

  it("אבחון בלי סריקה (created) - scan null, לא זריקה", async () => {
    const r = await getReport(fakeDb(diagRow({ scans: [], businessModel: null, status: "created" })) as never, "d1");
    expect(r?.scan).toBeNull();
    expect(r?.model).toBeNull();
    expect(r?.nextStep).toBeNull();
    expect(r?.status).toBe("created");
  });

  it("findings פגום (בלי business/meta) - זריקה בקול, לא המשך שקט", async () => {
    const row = diagRow();
    (row.scans[0] as { findings: unknown }).findings = { garbage: true };
    await expect(getReport(fakeDb(row) as never, "d1")).rejects.toThrow(/פגומ/);
  });

  it("findings בלי meta (יש business) - זריקה בקול", async () => {
    const row = diagRow();
    (row.scans[0] as { findings: unknown }).findings = { business: { placeId: "p", name: "x" } };
    await expect(getReport(fakeDb(row) as never, "d1")).rejects.toThrow(/פגומ/);
  });
});

describe("listRecentDiagnoses", () => {
  it("ממפה לשורות רשימה עם שם עסק, סטטוס וציון כולל מהסריקה האחרונה, וקוראת ל-findMany עם ה-limit", async () => {
    const db = fakeDb(null, [diagRow()]);
    const rows = await listRecentDiagnoses(db as never, { limit: 8 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "d1", status: "report_ready", businessName: "עסק בדיקה", overall: 77 });
    expect(db.diagnosis.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
  });

  it("אבחון בלי סריקה - overall null", async () => {
    const rows = await listRecentDiagnoses(fakeDb(null, [diagRow({ scans: [] })]) as never, { limit: 8 });
    expect(rows[0].overall).toBeNull();
  });

  it("בלי limit - findMany בלי take, כל האבחונים חוזרים", async () => {
    const db = fakeDb(null, [diagRow()]);
    await listRecentDiagnoses(db as never);
    expect(db.diagnosis.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
  });
});
