import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { getReport, listRecentDiagnoses } from "../src/server/diagnosis-read";
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

function fakeDb(diagnosisRow: unknown, listRows: unknown[] = []) {
  return {
    diagnosis: {
      findUnique: async () => diagnosisRow,
      findMany: async () => listRows,
    },
  } as never;
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

describe("getReport", () => {
  it("מחזיר null כשהאבחון לא קיים", async () => {
    expect(await getReport(fakeDb(null), "אין")).toBeNull();
  });

  it("ממיר Decimal למספר וקורא findings/scores לטיפוסי הדומיין", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.scan?.apiCost).toBe(0.06);
    expect(typeof r?.scan?.apiCost).toBe("number");
    expect(r?.scan?.findings.business.name).toBe("עסק בדיקה");
    expect(r?.scan?.scores?.overall).toBe(77);
  });

  it("נרטיב חדש: usedFallback ו-usage נשמרים בתצוגה", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.scan?.narrative?.usedFallback).toBe(false);
    expect(r?.scan?.narrative?.usage?.outputTokens).toBe(2);
  });

  it("נרטיב ישן (ReportNarrative ישיר, בלי מעטפת) — פרובננס null, הנרטיב עצמו נקרא", async () => {
    const row = diagRow();
    (row.scans[0] as { narrative: unknown }).narrative = { headline: "ישן", summary: "ס", gapExplanations: [] };
    const r = await getReport(fakeDb(row), "d1");
    expect(r?.scan?.narrative?.narrative.headline).toBe("ישן");
    expect(r?.scan?.narrative?.usedFallback).toBeNull();
    expect(r?.scan?.narrative?.usage).toBeNull();
  });

  it("מודל העסק משוחזר כולל credits, ו-nextStep מחושב ממנו", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.model?.completenessPct).toBe(15);
    expect(r?.nextStep?.action).toBe("free_text"); // 15% מתחת לסף free_text
  });

  it("אבחון בלי סריקה (created) — scan null, לא זריקה", async () => {
    const r = await getReport(fakeDb(diagRow({ scans: [], businessModel: null, status: "created" })), "d1");
    expect(r?.scan).toBeNull();
    expect(r?.model).toBeNull();
    expect(r?.nextStep).toBeNull();
    expect(r?.status).toBe("created");
  });

  it("findings פגום (בלי business) — זריקה בקול, לא המשך שקט", async () => {
    const row = diagRow();
    (row.scans[0] as { findings: unknown }).findings = { garbage: true };
    await expect(getReport(fakeDb(row), "d1")).rejects.toThrow(/פגומ/);
  });
});

describe("listRecentDiagnoses", () => {
  it("ממפה לשורות רשימה עם שם עסק, סטטוס וציון כולל מהסריקה האחרונה", async () => {
    const rows = await listRecentDiagnoses(fakeDb(null, [diagRow()]), 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "d1", status: "report_ready", businessName: "עסק בדיקה", overall: 77 });
  });

  it("אבחון בלי סריקה — overall null", async () => {
    const rows = await listRecentDiagnoses(fakeDb(null, [diagRow({ scans: [] })]), 8);
    expect(rows[0].overall).toBeNull();
  });
});
