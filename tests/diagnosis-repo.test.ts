import { describe, it, expect, vi } from "vitest";
import {
  toScanRow, llmCostUsd, transitionDiagnosis, createDiagnosisForBusiness, saveScanResult,
} from "../src/server/diagnosis-repo";
import type { ScanFindings } from "../src/pipeline/types";
import type { NarrativeResult } from "../src/pipeline/report/narrative";
import { MODEL_SECTIONS, type BusinessModel } from "../src/pipeline/model/business-model";

const FINDINGS: ScanFindings = {
  business: { placeId: "p1", name: "עסק", website: "https://x.co.il" },
  partial: [],
  meta: { startedAt: "2026-08-13T00:00:00Z", durationMs: 20000, placesCalls: 2, llmInputTokens: 100, llmOutputTokens: 50, estCostUsd: 0.06 },
};

const NARRATIVE_RESULT: NarrativeResult = {
  narrative: { headline: "כותרת", summary: "סיכום", gapExplanations: [] },
  usage: { inputTokens: 900, outputTokens: 500 },
  usedFallback: false,
};

describe("toScanRow", () => {
  it("maps findings/scores/narrative to the scans columns", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);
    expect(row.findings).toEqual(FINDINGS);
    expect(row.scores).toEqual({ overall: 70 });
    expect(row.narrative).toEqual(NARRATIVE_RESULT);
    expect(row.apiCost).toBe(0.06);
    expect(row.llmCost).toBe(0); // שכבת חינם בפיתוח — עלות ה-LLM אפס עד בחירת מודל ייצור
    expect(row.durationMs).toBe(20000);
  });

  it("allows null scores/narrative (scan saved even when scoring fails)", () => {
    const row = toScanRow(FINDINGS, null, null);
    expect(row.scores).toBeNull();
    expect(row.narrative).toBeNull();
  });
});

describe("toScanRow — פרובננס נרטיב", () => {
  it("שומר את NarrativeResult המלא כולל usedFallback ו-usage", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);
    expect(row.narrative?.usedFallback).toBe(false);
    expect(row.narrative?.usage.outputTokens).toBe(500);
  });

  it("narrative null נשאר null (סריקה בלי נרטיב)", () => {
    expect(toScanRow(FINDINGS, { overall: 70 } as never, null).narrative).toBeNull();
  });
});

describe("toScanRow — עלות", () => {
  it("מחשב עלות על סכום טוקני הסריקה והנרטיב (0 בשכבת החינם)", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);
    expect(row.llmCost).toBe(0);
  });

  it("מזריק תמחור ומוכיח שהעלות נספרת על סכום טוקני סריקה+נרטיב (לא רק סריקה או רק נרטיב)", () => {
    // in: meta.llmInputTokens (100) + NARRATIVE_RESULT.usage.inputTokens (900) = 1000, ב-$1/M = 0.001
    // out: meta.llmOutputTokens (50) + NARRATIVE_RESULT.usage.outputTokens (500) = 550, ב-$5/M = 0.00275
    // סה"כ = 0.00375
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT, { usdPerMInput: 1, usdPerMOutput: 5 });
    expect(row.llmCost).toBeCloseTo(0.00375, 10);
  });

  it("narrative null — עדיין מחייב את טוקני הסריקה", () => {
    // meta.llmInputTokens (100) ב-$1/M = 0.0001 + meta.llmOutputTokens (50) ב-$5/M = 0.00025 → סה"כ 0.00035
    const row = toScanRow(FINDINGS, null, null, { usdPerMInput: 1, usdPerMOutput: 5 });
    expect(row.llmCost).toBeCloseTo(0.00035, 10);
  });
});

describe("llmCostUsd", () => {
  it("שכבת החינם של Gemini — עלות 0", () => {
    expect(llmCostUsd({ inputTokens: 150_000, outputTokens: 15_000 })).toBe(0);
  });

  it("מחשב לפי מחיר למיליון טוקנים כשמזריקים תמחור", () => {
    // 100K in ב-$1/M + 10K out ב-$5/M = 0.1 + 0.05 = 0.15
    expect(llmCostUsd(
      { inputTokens: 100_000, outputTokens: 10_000 },
      { usdPerMInput: 1, usdPerMOutput: 5 },
    )).toBeCloseTo(0.15, 10);
  });
});

// updateManyCount: כמה שורות updateMany "מצא ועדכן" — ברירת מחדל 1 (הצליח); 0 מדמה הפסד במרוץ
function fakePrisma(currentStatus: string, updateManyCount = 1) {
  return {
    diagnosis: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "d1", status: currentStatus }),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      create: vi.fn().mockResolvedValue({ id: "d9" }),
    },
    business: {
      upsert: vi.fn().mockResolvedValue({ id: "b1" }),
    },
  };
}

describe("transitionDiagnosis", () => {
  it("updates when the transition is legal", async () => {
    const prisma = fakePrisma("created");
    await transitionDiagnosis(prisma as never, "d1", "scanning");
    expect(prisma.diagnosis.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "created" }, data: { status: "scanning" },
    });
  });

  it("throws and does NOT update on an illegal transition", async () => {
    const prisma = fakePrisma("created");
    await expect(transitionDiagnosis(prisma as never, "d1", "roadmap_ready")).rejects.toThrow(/לא חוקי/);
    expect(prisma.diagnosis.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the status changed concurrently (updateMany count 0 = lost the race)", async () => {
    const prisma = fakePrisma("created", 0);
    await expect(transitionDiagnosis(prisma as never, "d1", "scanning")).rejects.toThrow(/במקביל/);
  });
});

describe("createDiagnosisForBusiness", () => {
  it("upserts by placeId when present", async () => {
    const prisma = fakePrisma("created");
    const result = await createDiagnosisForBusiness(prisma as never, {
      name: "עסק", placeId: "p1", website: "https://x.co.il",
    });
    expect(prisma.business.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { placeId: "p1" } }),
    );
    expect(result).toEqual({ businessId: "b1", diagnosisId: "d9" });
  });

  it("falls back to website upsert when placeId is empty (no-GBP path)", async () => {
    const prisma = fakePrisma("created");
    await createDiagnosisForBusiness(prisma as never, { name: "lavan", placeId: "", website: "https://lavan.co.il/" });
    expect(prisma.business.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { websiteKey: "lavan.co.il" } }),
    );
  });

  it("מסלול website: upsert אטומי על websiteKey מנורמל — כתיבים שונים מתלכדים לשורה אחת", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "b1" });
    const db = {
      business: { upsert },
      diagnosis: { create: vi.fn().mockResolvedValue({ id: "d1" }) },
    } as never;
    await createDiagnosisForBusiness(db, { name: "lavangroup.co.il", website: "https://www.LavanGroup.co.il/" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertCall = upsert.mock.calls[0][0] as { where: unknown };
    expect(upsertCall.where).toEqual({ websiteKey: "lavangroup.co.il" });
  });

  it("rejects when neither placeId nor website is given (would otherwise upsert with an empty key)", async () => {
    const prisma = fakePrisma("created");
    await expect(
      createDiagnosisForBusiness(prisma as never, { name: "לא ידוע" }),
    ).rejects.toThrow(/placeId או website/);
    expect(prisma.business.upsert).not.toHaveBeenCalled();
  });
});

describe("saveScanResult", () => {
  it("writes the scan and the business model atomically, with credits in both upsert branches", async () => {
    const prisma = {
      scan: { create: vi.fn().mockResolvedValue({ id: "s1" }) },
      businessModelRow: { upsert: vi.fn().mockResolvedValue({ id: "bm1" }) },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);
    const model: BusinessModel = {
      data: Object.fromEntries(MODEL_SECTIONS.map((k) => [k, {}])) as BusinessModel["data"],
      fieldSources: {},
      credits: Object.fromEntries(MODEL_SECTIONS.map((k) => [k, 0.5])) as BusinessModel["credits"],
      completenessPct: 50,
    };

    await saveScanResult(prisma as never, "d1", row, model);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.scan.create).toHaveBeenCalledWith({
      data: {
        diagnosisId: "d1",
        findings: row.findings,
        scores: row.scores,
        narrative: row.narrative,
        llmCost: row.llmCost,
        apiCost: row.apiCost,
        durationMs: row.durationMs,
      },
    });
    const upsertCall = prisma.businessModelRow.upsert.mock.calls[0][0] as {
      update: { credits: unknown }; create: { credits: unknown };
    };
    expect(upsertCall.update.credits).toEqual(model.credits);
    expect(upsertCall.create.credits).toEqual(model.credits);
  });
});
