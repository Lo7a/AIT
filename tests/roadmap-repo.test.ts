import { describe, expect, it } from "vitest";
import { createRoadmap, getRoadmapView } from "../src/server/roadmap-repo";
import { makeFakeDb } from "./fakes/fake-db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedDiagnosis(diagnoses: any[], id = "d1", status = "report_ready") {
  diagnoses.push({ id, businessId: "b1", status, createdAt: new Date() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedCatalog(catalogs: any[], overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    id: overrides.id ?? "cat-1",
    name: overrides.name ?? "קביעת תורים אונליין",
    problem: overrides.problem ?? "כל תיאום דורש שיחת טלפון בשעות הפעילות",
    solution: overrides.solution ?? "יומן תורים אונליין מוטמע באתר ובפרופיל גוגל",
    costRange: overrides.costRange ?? "100-500 בחודש",
    savingRange: overrides.savingRange ?? "2-5 שעות תיאומים בשבוע",
    complexity: overrides.complexity ?? "low",
    installTime: overrides.installTime ?? "1-2 שבועות",
  };
  catalogs.push(row);
  return row;
}

describe("createRoadmap", () => {
  it("יוצר שורת roadmap אחת וכל פריטיה בקריאה אחת, מחזיר את מזהה ה-roadmap", async () => {
    const { db, catalogs, diagnoses, roadmaps, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1" });
    seedCatalog(catalogs, { id: "cat-2", name: "הקמת פרופיל Google Business" });

    const id = await createRoadmap(db, "d1", [
      { catalogId: "cat-1", score: 80, confidence: "high", phase: "automation" },
      { catalogId: "cat-2", score: 60, confidence: "low", phase: "quick_wins" },
    ]);

    expect(id).toBeTruthy();
    expect(roadmaps).toHaveLength(1);
    expect(roadmaps[0].diagnosisId).toBe("d1");
    expect(roadmapItems).toHaveLength(2);
    expect(roadmapItems.every((it: any) => it.roadmapId === id)).toBe(true);
  });

  it("אטומיות: כשל באמצע הטרנזקציה (catalogId שני לא קיים בקטלוג) לא משאיר לא roadmap ולא אף פריט", async () => {
    const { db, catalogs, diagnoses, roadmaps, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1" });
    // cat-999 לא נזרע בקטלוג - מדמה כשל FK אמיתי של Postgres באמצע ה-INSERT-ים

    await expect(
      createRoadmap(db, "d1", [
        { catalogId: "cat-1", score: 80, confidence: "high", phase: "automation" },
        { catalogId: "cat-999", score: 60, confidence: "low", phase: "quick_wins" },
      ]),
    ).rejects.toThrow();

    expect(roadmaps).toHaveLength(0);
    expect(roadmapItems).toHaveLength(0);
  });
});

describe("getRoadmapView", () => {
  it("אין roadmap בכלל לאבחון - null", async () => {
    const { db, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    expect(await getRoadmapView(db, "d1")).toBeNull();
  });

  it("שני roadmaps לאותו אבחון - getRoadmapView מחזיר רק את פריטי החדש ביותר", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1", name: "ראשון" });
    seedCatalog(catalogs, { id: "cat-2", name: "שני" });

    await createRoadmap(db, "d1", [{ catalogId: "cat-1", score: 50, confidence: "low", phase: "automation" }]);
    const secondId = await createRoadmap(db, "d1", [
      { catalogId: "cat-2", score: 90, confidence: "high", phase: "ai" },
    ]);

    const view = await getRoadmapView(db, "d1");
    expect(view?.id).toBe(secondId);
    expect(view?.items).toHaveLength(1);
    expect(view?.items[0].name).toBe("שני");
  });

  it("צירוף מלא: מחרוזות הקטלוג כלשונן על הפריט + בנצ'מרקים עם source ו-verifiedAt", async () => {
    const { db, catalogs, benchmarks, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, {
      id: "cat-1",
      name: "בוט וואטסאפ לשירות לקוחות",
      problem: "שאלות חוזרות מעמיסות על הטלפון",
      solution: "בוט וואטסאפ שעונה 24/7",
      costRange: "הקמה 2500-12000 + 100-900 לחודש",
      savingRange: "5-10 שעות מענה בשבוע",
      complexity: "medium",
      installTime: "1-6 שבועות לפי מורכבות",
    });
    const verifiedAt = new Date("2026-08-13T00:00:00Z");
    benchmarks.push({
      id: "bm-1", catalogId: "cat-1", metric: "הקמת בוט וואטסאפ", range: "2500-12000",
      source: "achiya-automation.com", verifiedAt,
    });

    await createRoadmap(db, "d1", [{ catalogId: "cat-1", score: 70, confidence: "medium", phase: "ai" }]);
    const view = await getRoadmapView(db, "d1");

    expect(view).not.toBeNull();
    const item = view!.items[0];
    expect(item.name).toBe("בוט וואטסאפ לשירות לקוחות");
    expect(item.problem).toBe("שאלות חוזרות מעמיסות על הטלפון");
    expect(item.solution).toBe("בוט וואטסאפ שעונה 24/7");
    expect(item.costRange).toBe("הקמה 2500-12000 + 100-900 לחודש");
    expect(item.savingRange).toBe("5-10 שעות מענה בשבוע");
    expect(item.complexity).toBe("medium");
    expect(item.installTime).toBe("1-6 שבועות לפי מורכבות");
    expect(item.confidence).toBe("medium");
    expect(item.phase).toBe("ai");
    expect(item.score).toBe(70);
    expect(item.status).toBe("proposed");
    expect(item.benchmarks).toHaveLength(1);
    expect(item.benchmarks[0].source).toBe("achiya-automation.com");
    expect(item.benchmarks[0].metric).toBe("הקמת בוט וואטסאפ");
    expect(item.benchmarks[0].verifiedAt).toEqual(verifiedAt);
  });

  it("פריט קטלוג בלי אף בנצ'מרק - מערך ריק, לא שגיאה", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1" });
    await createRoadmap(db, "d1", [{ catalogId: "cat-1", score: 50, confidence: "low", phase: "automation" }]);
    const view = await getRoadmapView(db, "d1");
    expect(view!.items[0].benchmarks).toEqual([]);
  });

  it("פריטים חוזרים בסדר יורד לפי score - סדר קריאה דטרמיניסטי", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1", name: "א" });
    seedCatalog(catalogs, { id: "cat-2", name: "ב" });
    seedCatalog(catalogs, { id: "cat-3", name: "ג" });

    await createRoadmap(db, "d1", [
      { catalogId: "cat-1", score: 40, confidence: "low", phase: "automation" },
      { catalogId: "cat-2", score: 90, confidence: "high", phase: "ai" },
      { catalogId: "cat-3", score: 65, confidence: "medium", phase: "quick_wins" },
    ]);

    const view = await getRoadmapView(db, "d1");
    expect(view?.items.map((it) => it.score)).toEqual([90, 65, 40]);
    // אותה השוואה שוב - הסדר לא משתנה בין קריאות (דטרמיניסטי, לא רק "יצא ככה הפעם")
    const view2 = await getRoadmapView(db, "d1");
    expect(view2?.items.map((it) => it.catalogId)).toEqual(view?.items.map((it) => it.catalogId));
  });
});
