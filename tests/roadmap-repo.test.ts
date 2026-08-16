import { describe, expect, it } from "vitest";
import { createRoadmap, getRoadmapView, loadCatalogLite } from "../src/server/roadmap-repo";
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
      { catalogId: "cat-1", score: 80, confidence: "high", phase: "automation", reasoning: "נימוק לפריט הראשון" },
      { catalogId: "cat-2", score: 60, confidence: "low", phase: "quick_wins", reasoning: null },
    ]);

    expect(id).toBeTruthy();
    expect(roadmaps).toHaveLength(1);
    expect(roadmaps[0].diagnosisId).toBe("d1");
    expect(roadmapItems).toHaveLength(2);
    expect(roadmapItems.every((it: any) => it.roadmapId === id)).toBe(true);
    expect(roadmapItems.find((it: any) => it.catalogId === "cat-1").reasoning).toBe("נימוק לפריט הראשון");
    expect(roadmapItems.find((it: any) => it.catalogId === "cat-2").reasoning).toBeNull();
  });

  it("אטומיות: כשל באמצע הטרנזקציה (catalogId שני לא קיים בקטלוג) לא משאיר לא roadmap ולא אף פריט", async () => {
    const { db, catalogs, diagnoses, roadmaps, roadmapItems } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1" });
    // cat-999 לא נזרע בקטלוג - מדמה כשל FK אמיתי של Postgres באמצע ה-INSERT-ים

    await expect(
      createRoadmap(db, "d1", [
        { catalogId: "cat-1", score: 80, confidence: "high", phase: "automation", reasoning: null },
        { catalogId: "cat-999", score: 60, confidence: "low", phase: "quick_wins", reasoning: null },
      ]),
    ).rejects.toThrow();

    expect(roadmaps).toHaveLength(0);
    expect(roadmapItems).toHaveLength(0);
  });
});

// loadCatalogLite שותפה בין run-roadmap.ts (בניית Roadmap מלאה) ו-report-highlights.ts (חישוב
// "מה מונח על השולחן" בזיכרון למסך הדוח) - אותה נורמליזציה הגנתית של conditions.gapKeys, נבדקת
// כאן פעם אחת במקום להישבר בשני מקומות
describe("loadCatalogLite", () => {
  it("ממפה שורת קטלוג תקינה לצורה המצומצמת המלאה", async () => {
    const { db, catalogs } = makeFakeDb() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    seedCatalog(catalogs, { id: "cat-1", name: "קביעת תורים אונליין" });
    catalogs[0].conditions = { gapKeys: ["online_booking"] };

    const rows = await loadCatalogLite(db);
    expect(rows).toEqual([{
      id: "cat-1", name: "קביעת תורים אונליין",
      problem: "כל תיאום דורש שיחת טלפון בשעות הפעילות",
      solution: "יומן תורים אונליין מוטמע באתר ובפרופיל גוגל",
      conditions: { gapKeys: ["online_booking"] },
      costRange: "100-500 בחודש", savingRange: "2-5 שעות תיאומים בשבוע",
      complexity: "low", installTime: "1-2 שבועות",
    }]);
  });

  it.each([
    ["conditions = null", null],
    ["conditions בלי gapKeys", { note: "טרם הוגדר" }],
    ["gapKeys שאינו מערך", { gapKeys: "online_booking" }],
    ["gapKeys עם ערכים לא-string מעורבים", { gapKeys: ["online_booking", 5, null] }],
  ])("שורת קטלוג פגומה (%s) - gapKeys מתנרמל בלי לזרוק", async (_label, conditions) => {
    const { db, catalogs } = makeFakeDb() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    seedCatalog(catalogs, { id: "cat-broken" });
    catalogs[0].conditions = conditions;

    const rows = await loadCatalogLite(db);
    expect(rows).toHaveLength(1);
    const expected = _label === "gapKeys עם ערכים לא-string מעורבים" ? ["online_booking"] : [];
    expect(rows[0].conditions.gapKeys).toEqual(expected);
  });

  it("קטלוג ריק -> מערך ריק", async () => {
    const { db } = makeFakeDb() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(await loadCatalogLite(db)).toEqual([]);
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

    await createRoadmap(db, "d1", [{ catalogId: "cat-1", score: 50, confidence: "low", phase: "automation", reasoning: null }]);
    const secondId = await createRoadmap(db, "d1", [
      { catalogId: "cat-2", score: 90, confidence: "high", phase: "ai", reasoning: null },
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

    await createRoadmap(db, "d1", [
      { catalogId: "cat-1", score: 70, confidence: "medium", phase: "ai", reasoning: "שאלות חוזרות מעמיסות - בוט עונה 24/7" },
    ]);
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
    expect(item.reasoning).toBe("שאלות חוזרות מעמיסות - בוט עונה 24/7");
    expect(item.benchmarks).toHaveLength(1);
    expect(item.benchmarks[0].source).toBe("achiya-automation.com");
    expect(item.benchmarks[0].metric).toBe("הקמת בוט וואטסאפ");
    expect(item.benchmarks[0].verifiedAt).toEqual(verifiedAt);
  });

  it("פריט קטלוג בלי אף בנצ'מרק - מערך ריק, לא שגיאה", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1" });
    await createRoadmap(db, "d1", [{ catalogId: "cat-1", score: 50, confidence: "low", phase: "automation", reasoning: null }]);
    const view = await getRoadmapView(db, "d1");
    expect(view!.items[0].benchmarks).toEqual([]);
    expect(view!.items[0].reasoning).toBeNull();
  });

  it("פריטים חוזרים בסדר יורד לפי score - סדר קריאה דטרמיניסטי", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-1", name: "א" });
    seedCatalog(catalogs, { id: "cat-2", name: "ב" });
    seedCatalog(catalogs, { id: "cat-3", name: "ג" });

    // כל השלושה לא-ai בכוונה - הבדיקה הזו על סדר ה-score בתוך שכבה אחת; שכבת ה-AI נבדקת בנפרד למטה
    await createRoadmap(db, "d1", [
      { catalogId: "cat-1", score: 40, confidence: "low", phase: "automation", reasoning: null },
      { catalogId: "cat-2", score: 90, confidence: "high", phase: "automation", reasoning: null },
      { catalogId: "cat-3", score: 65, confidence: "medium", phase: "quick_wins", reasoning: null },
    ]);

    const view = await getRoadmapView(db, "d1");
    expect(view?.items.map((it) => it.score)).toEqual([90, 65, 40]);
    // אותה השוואה שוב - הסדר לא משתנה בין קריאות (דטרמיניסטי, לא רק "יצא ככה הפעם")
    const view2 = await getRoadmapView(db, "d1");
    expect(view2?.items.map((it) => it.catalogId)).toEqual(view?.items.map((it) => it.catalogId));
  });

  // שוויון ציון: RoadmapItem.id בסכמה הוא uuid אקראי (@default(uuid())), אז "id כשובר שוויון"
  // יציב אך שרירותי - שני פריטים באותו ציון היו מתקבלים בסדר אקראי לכל Roadmap, ולא בסדר
  // שהקורא חישב (score יורד ואז שם הקטלוג - run-roadmap.ts). כאן סדר ההוספה הפוך לסדר השמות
  // בכוונה, כדי שהבדיקה תיפול אם הקריאה תיסמך על סדר ההוספה/ה-id במקום על השם
  it("שוויון בציון נשבר לפי שם הקטלוג, לא לפי סדר ההוספה או ה-id", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-b", name: "ניהול ומענה לביקורות" });
    seedCatalog(catalogs, { id: "cat-a", name: "איסוף ביקורות אוטומטי" });
    seedCatalog(catalogs, { id: "cat-top", name: "קביעת תורים אונליין" });

    // זוג התיקו (60=60) באותה שכבה (automation) בכוונה - שובר השוויון לפי שם נבדק בתוך שכבה,
    // וסדר ההוספה של הזוג הפוך לסדר האלפביתי כדי שהבדיקה תיפול אם הקריאה תיסמך על סדר ההוספה
    await createRoadmap(db, "d1", [
      { catalogId: "cat-top", score: 80, confidence: "high", phase: "automation", reasoning: null },
      { catalogId: "cat-b", score: 60, confidence: "high", phase: "automation", reasoning: null },
      { catalogId: "cat-a", score: 60, confidence: "low", phase: "automation", reasoning: null },
    ]);

    const view = await getRoadmapView(db, "d1");
    expect(view?.items.map((it) => it.name)).toEqual([
      "קביעת תורים אונליין",
      "איסוף ביקורות אוטומטי",
      "ניהול ומענה לביקורות",
    ]);
  });

  // החלטת מייסד 16.8 ("AI נמכר הכי טוב"): פריטי שלב ai מעל כולם, גם כשציונם נמוך יותר. המיון
  // בצד הקריאה (sortItems) - כך גם Roadmaps שנשמרו לפני ההחלטה נקראים בסדר החדש בלי בנייה מחדש
  it("AI קודם: פריט ai עם ציון נמוך יותר נקרא לפני כל הפריטים הלא-ai", async () => {
    const { db, catalogs, diagnoses } = makeFakeDb() as any;
    seedDiagnosis(diagnoses);
    seedCatalog(catalogs, { id: "cat-bot", name: "בוט וואטסאפ לשירות לקוחות" });
    seedCatalog(catalogs, { id: "cat-book", name: "קביעת תורים אונליין" });
    seedCatalog(catalogs, { id: "cat-gbp", name: "הקמת פרופיל Google Business" });

    await createRoadmap(db, "d1", [
      { catalogId: "cat-book", score: 90, confidence: "high", phase: "automation", reasoning: null },
      { catalogId: "cat-gbp", score: 70, confidence: "high", phase: "quick_wins", reasoning: null },
      { catalogId: "cat-bot", score: 45, confidence: "medium", phase: "ai", reasoning: null },
    ]);

    const view = await getRoadmapView(db, "d1");
    expect(view?.items.map((it) => it.name)).toEqual([
      "בוט וואטסאפ לשירות לקוחות",
      "קביעת תורים אונליין",
      "הקמת פרופיל Google Business",
    ]);
    // בתוך השכבה הלא-ai הסדר נשאר לפי score - ההחלטה מרימה את ai, לא משנה את השאר
    expect(view?.items.map((it) => it.score)).toEqual([45, 90, 70]);
  });
});
