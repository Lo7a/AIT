import { describe, it, expect, vi } from "vitest";
import {
  toScanRow, llmCostUsd, transitionDiagnosis, createDiagnosisForBusiness, saveScanResult,
  enrichBusinessFromScan,
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
    expect(row.llmCost).toBe(0); // שכבת חינם בפיתוח - עלות ה-LLM אפס עד בחירת מודל ייצור
    expect(row.durationMs).toBe(20000);
  });

  it("allows null scores/narrative (scan saved even when scoring fails)", () => {
    const row = toScanRow(FINDINGS, null, null);
    expect(row.scores).toBeNull();
    expect(row.narrative).toBeNull();
  });

  it("passes findings.raw through as-is (payload גולמי, אבן דרך 4 משימה 0.7)", () => {
    const withRaw: ScanFindings = { ...FINDINGS, raw: { placeDetails: { id: "p1" }, crawledUrls: ["https://x.co.il"] } };
    const row = toScanRow(withRaw, null, null);
    expect(row.raw).toEqual({ placeDetails: { id: "p1" }, crawledUrls: ["https://x.co.il"] });
  });

  it("raw is null when findings has none (not undefined - explicit column value)", () => {
    expect(toScanRow(FINDINGS, null, null).raw).toBeNull();
  });
});

describe("toScanRow - פרובננס נרטיב", () => {
  it("שומר את NarrativeResult המלא כולל usedFallback ו-usage", () => {
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);
    expect(row.narrative?.usedFallback).toBe(false);
    expect(row.narrative?.usage.outputTokens).toBe(500);
  });

  it("narrative null נשאר null (סריקה בלי נרטיב)", () => {
    expect(toScanRow(FINDINGS, { overall: 70 } as never, null).narrative).toBeNull();
  });
});

describe("toScanRow - עלות", () => {
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

  it("narrative null - עדיין מחייב את טוקני הסריקה", () => {
    // meta.llmInputTokens (100) ב-$1/M = 0.0001 + meta.llmOutputTokens (50) ב-$5/M = 0.00025 → סה"כ 0.00035
    const row = toScanRow(FINDINGS, null, null, { usdPerMInput: 1, usdPerMOutput: 5 });
    expect(row.llmCost).toBeCloseTo(0.00035, 10);
  });
});

describe("llmCostUsd", () => {
  it("שכבת החינם של Gemini - עלות 0", () => {
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

// updateManyCount: כמה שורות updateMany "מצא ועדכן" - ברירת מחדל 1 (הצליח); 0 מדמה הפסד במרוץ
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

  it("מסלול website (no-GBP): upsert אטומי על websiteKey מנורמל - כתיבים שונים מתלכדים לאותו מפתח; name הוא create-only", async () => {
    for (const website of ["https://www.LavanGroup.co.il/", "lavangroup.co.il", "https://lavangroup.co.il/about"]) {
      const prisma = fakePrisma("created");
      await createDiagnosisForBusiness(prisma as never, { name: "lavan", placeId: "", website });
      const upsertCall = prisma.business.upsert.mock.calls[0][0] as {
        where: { websiteKey: string };
        create: { websiteKey: string };
        update: Record<string, unknown>;
      };
      expect(upsertCall.where).toEqual({ websiteKey: "lavangroup.co.il" });
      // Prisma הופך ל-INSERT..ON CONFLICT אטומי רק כש-create.<שדה ייחודי> תואם ל-where - אם רפקטור ישבור
      // את ההתאמה, הבדיקה הישנה (where בלבד) הייתה נשארת ירוקה בזמן שהאטומיות נפתחת מחדש
      expect(upsertCall.create.websiteKey).toEqual(upsertCall.where.websiteKey);
      // name לא ב-update: סריקה חוזרת של אותו אתר לא צריכה לשנות בשקט את השם שדוחות קודמים כבר מציגים
      expect(upsertCall.update).not.toHaveProperty("name");
    }
  });

  it("rejects when neither placeId nor website is given (would otherwise upsert with an empty key)", async () => {
    const prisma = fakePrisma("created");
    await expect(
      createDiagnosisForBusiness(prisma as never, { name: "לא ידוע" }),
    ).rejects.toThrow(/placeId או website/);
    expect(prisma.business.upsert).not.toHaveBeenCalled();
  });
});

const MODEL_HALF: BusinessModel = {
  data: Object.fromEntries(MODEL_SECTIONS.map((k) => [k, {}])) as BusinessModel["data"],
  fieldSources: {},
  credits: Object.fromEntries(MODEL_SECTIONS.map((k) => [k, 0.5])) as BusinessModel["credits"],
  completenessPct: 50,
};

// פייק לטרנזקציה אינטראקטיבית עם rollback אמיתי: כתיבות שנעשו בתוך ה-callback נמחקות אם
// ה-callback זרק. בלי זה אי אפשר לבדוק את הדרישה המרכזית - "כישלון מעבר הסטטוס לא משאיר
// שורת סריקה יתומה" (הבאג: saveScanResult ואז transitionDiagnosis כשני עגולי DB נפרדים)
function fakeTxPrisma(opts: { status?: string; statusUpdateCount?: number } = {}) {
  const scans: unknown[] = [];
  const models: unknown[] = [];
  const tx = {
    scan: { create: vi.fn(async (args: unknown) => { scans.push(args); return { id: "s1" }; }) },
    businessModelRow: { upsert: vi.fn(async (args: unknown) => { models.push(args); return { id: "bm1" }; }) },
    diagnosis: { updateMany: vi.fn().mockResolvedValue({ count: opts.statusUpdateCount ?? 1 }) },
  };
  const prisma = {
    diagnosis: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ status: opts.status ?? "scanned" }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      try {
        return await fn(tx);
      } catch (err) {
        scans.length = 0;
        models.length = 0;
        throw err;
      }
    }),
  };
  return { prisma, tx, scans, models };
}

describe("saveScanResult", () => {
  it("writes the scan and the business model atomically, with credits in both upsert branches", async () => {
    const { prisma, tx, scans } = fakeTxPrisma();
    const row = toScanRow(FINDINGS, { overall: 70 } as never, NARRATIVE_RESULT);

    await saveScanResult(prisma as never, "d1", row, MODEL_HALF);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(scans).toHaveLength(1);
    expect(tx.scan.create).toHaveBeenCalledWith({
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
    const upsertCall = tx.businessModelRow.upsert.mock.calls[0][0] as {
      update: { credits: unknown }; create: { credits: unknown };
    };
    expect(upsertCall.update.credits).toEqual(MODEL_HALF.credits);
    expect(upsertCall.create.credits).toEqual(MODEL_HALF.credits);
  });

  it("writes findings.raw to the scan row's raw column (payload גולמי, אבן דרך 4 משימה 0.7)", async () => {
    const { prisma, tx } = fakeTxPrisma();
    const withRaw: ScanFindings = { ...FINDINGS, raw: { placeDetails: { id: "p1" } } };
    const row = toScanRow(withRaw, null, null);

    await saveScanResult(prisma as never, "d1", row, { ...MODEL_HALF, completenessPct: 0 });

    const createCall = tx.scan.create.mock.calls[0][0] as { data: { raw: unknown } };
    expect(createCall.data.raw).toEqual({ placeDetails: { id: "p1" } });
  });

  it("מעביר את הסטטוס ל-report_ready בתוך אותה טרנזקציה, עם שומר-מרוץ על scanned", async () => {
    const { prisma, tx } = fakeTxPrisma();
    await saveScanResult(prisma as never, "d1", toScanRow(FINDINGS, null, null), MODEL_HALF);
    expect(tx.diagnosis.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "scanned" },
      data: { status: "report_ready" },
    });
  });

  it("כשל המעבר (count 0 = הפסד במרוץ) מגלגל אחורה גם את שורת הסריקה ואת מודל העסק", async () => {
    const { prisma, scans, models } = fakeTxPrisma({ statusUpdateCount: 0 });
    await expect(
      saveScanResult(prisma as never, "d1", toScanRow(FINDINGS, null, null), MODEL_HALF),
    ).rejects.toThrow(/במקביל/);
    expect(scans).toHaveLength(0);
    expect(models).toHaveLength(0);
  });

  it("סטטוס נוכחי שאינו scanned - נזרק לפני כל כתיבה (מכונת המצבים נשמרת)", async () => {
    const { prisma } = fakeTxPrisma({ status: "created" });
    await expect(
      saveScanResult(prisma as never, "d1", toScanRow(FINDINGS, null, null), MODEL_HALF),
    ).rejects.toThrow(/לא חוקי/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("enrichBusinessFromScan", () => {
  function fakePrismaBiz(currentCity: string | null) {
    return {
      business: {
        findUnique: vi.fn().mockResolvedValue({ city: currentCity }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("מעדכן phone+address ומחשב city מהכתובת כשלא היה city קודם", async () => {
    const prisma = fakePrismaBiz(null);
    await enrichBusinessFromScan(prisma as never, "b1", {
      phone: "04-1234567", address: "שדרות רגר 12, באר שבע, ישראל",
    });
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { phone: "04-1234567", address: "שדרות רגר 12, באר שבע, ישראל", city: "באר שבע" },
    });
  });

  it("דורס city קיים כש-cityOf מפיק ערך שונה (הכתובת הטרייה מהסריקה גוברת)", async () => {
    const prisma = fakePrismaBiz("עיר ישנה שגויה");
    await enrichBusinessFromScan(prisma as never, "b1", { address: "רגר 12, באר שבע, ישראל" });
    const call = prisma.business.update.mock.calls[0][0] as { data: { city?: string } };
    expect(call.data.city).toBe("באר שבע");
  });

  it("לא נוגע ב-city כש-cityOf מפיק בדיוק את אותו ערך (בלי כתיבה מיותרת)", async () => {
    const prisma = fakePrismaBiz("באר שבע");
    await enrichBusinessFromScan(prisma as never, "b1", { address: "רגר 12, באר שבע, ישראל" });
    const call = prisma.business.update.mock.calls[0][0] as { data: { city?: string } };
    expect(call.data).not.toHaveProperty("city");
  });

  it("לא דורס city ידני קיים כשאין כתובת בסריקה (findings.business.address חסר)", async () => {
    const prisma = fakePrismaBiz("עיר שהוקלדה ידנית");
    await enrichBusinessFromScan(prisma as never, "b1", { phone: "03-9999999" });
    expect(prisma.business.findUnique).not.toHaveBeenCalled(); // אין כתובת - אין אפילו צורך לקרוא city
    const call = prisma.business.update.mock.calls[0][0] as { data: { city?: string; phone?: string } };
    expect(call.data).not.toHaveProperty("city");
    expect(call.data.phone).toBe("03-9999999");
  });

  it("לא נוגע ב-city כש-cityOf לא מצליח לגזור ערך (כתובת בפורמט לא צפוי)", async () => {
    const prisma = fakePrismaBiz("עיר קיימת");
    await enrichBusinessFromScan(prisma as never, "b1", { address: "תל אביב" }); // בלי פסיקים - cityOf מחזיר null
    const call = prisma.business.update.mock.calls[0][0] as { data: { city?: string } };
    expect(call.data).not.toHaveProperty("city");
  });

  it("לא קורא ל-update בכלל כשאין שום שדה לעדכן", async () => {
    const prisma = fakePrismaBiz(null);
    await enrichBusinessFromScan(prisma as never, "b1", {});
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
});
