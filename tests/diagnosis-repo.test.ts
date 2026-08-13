import { describe, it, expect, vi } from "vitest";
import { toScanRow, transitionDiagnosis, createDiagnosisForBusiness } from "../src/server/diagnosis-repo";
import type { ScanFindings } from "../src/pipeline/types";

const FINDINGS: ScanFindings = {
  business: { placeId: "p1", name: "עסק", website: "https://x.co.il" },
  partial: [],
  meta: { startedAt: "2026-08-13T00:00:00Z", durationMs: 20000, placesCalls: 2, llmInputTokens: 100, llmOutputTokens: 50, estCostUsd: 0.06 },
};

describe("toScanRow", () => {
  it("maps findings/scores/narrative to the scans columns", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, { headline: "h" } as never);
    expect(row.findings).toEqual(FINDINGS);
    expect(row.scores).toEqual({ overall: 70 });
    expect(row.narrative).toEqual({ headline: "h" });
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

function fakePrisma(currentStatus: string) {
  return {
    diagnosis: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "d1", status: currentStatus }),
      update: vi.fn().mockResolvedValue({}),
    },
    business: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "b1" }),
      create: vi.fn().mockResolvedValue({ id: "b1" }),
    },
  };
}

describe("transitionDiagnosis", () => {
  it("updates when the transition is legal", async () => {
    const prisma = fakePrisma("created");
    await transitionDiagnosis(prisma as never, "d1", "scanning");
    expect(prisma.diagnosis.update).toHaveBeenCalledWith({
      where: { id: "d1" }, data: { status: "scanning" },
    });
  });

  it("throws and does NOT update on an illegal transition", async () => {
    const prisma = fakePrisma("created");
    await expect(transitionDiagnosis(prisma as never, "d1", "roadmap_ready")).rejects.toThrow(/לא חוקי/);
    expect(prisma.diagnosis.update).not.toHaveBeenCalled();
  });
});

describe("createDiagnosisForBusiness", () => {
  it("upserts by placeId when present", async () => {
    const prisma = fakePrisma("created");
    (prisma as Record<string, unknown>).diagnosis = {
      ...prisma.diagnosis, create: vi.fn().mockResolvedValue({ id: "d9" }),
    };
    const result = await createDiagnosisForBusiness(prisma as never, {
      name: "עסק", placeId: "p1", website: "https://x.co.il",
    });
    expect(prisma.business.upsert).toHaveBeenCalled();
    expect(result).toEqual({ businessId: "b1", diagnosisId: "d9" });
  });

  it("falls back to website lookup when placeId is empty (no-GBP path)", async () => {
    const prisma = fakePrisma("created");
    (prisma as Record<string, unknown>).diagnosis = {
      ...prisma.diagnosis, create: vi.fn().mockResolvedValue({ id: "d9" }),
    };
    await createDiagnosisForBusiness(prisma as never, { name: "lavan", placeId: "", website: "https://lavan.co.il/" });
    expect(prisma.business.findFirst).toHaveBeenCalledWith({ where: { website: "https://lavan.co.il/" } });
    expect(prisma.business.upsert).not.toHaveBeenCalled();
  });
});
