import type { PrismaClient } from "@prisma/client";
import type { Confidence, Phase } from "../pipeline/roadmap/opportunity-score";

// שכבת השמירה של ה-Roadmap (אבן דרך 4, משימה 4): כתיבה אטומית (roadmap + כל פריטיו בטרנזקציה
// אחת) וקריאת "התצוגה האחרונה" בלבד. Roadmap חדש נוצר בכל חישוב מחדש (היסטוריה נשמרת - "מחושב
// מחדש" באפיון), אף פעם לא update-in-place; getRoadmapView תמיד מחזיר את החדש ביותר לאבחון נתון.

export interface RoadmapItemInput {
  catalogId: string;
  score: number;
  confidence: Confidence;
  phase: Phase;
}

export interface RoadmapBenchmarkView {
  id: string;
  metric: string;
  range: string;
  source: string;
  verifiedAt: Date;
}

// "requested" נכתב כשנוצר Brief על הפריט (משימה 7, "אני רוצה להטמיע את זה") - כאן עוד לא נכתב,
// אבל הטיפוס חי בגבול הזה כי getRoadmapView היא נקודת הקריאה היחידה שמחזירה אותו למסך
export type RoadmapItemStatus = "proposed" | "requested";

export interface RoadmapItemView {
  id: string;
  catalogId: string;
  score: number;
  confidence: Confidence;
  phase: Phase;
  status: RoadmapItemStatus;
  // שדות הקטלוג כלשונם - שמות/טווחי מחיר-חיסכון/מורכבות/זמן התקנה. מגיעים ב-string interpolation
  // בלבד מהקטלוג הנחקר (docs/research/2026-08-13-catalog-prices.md); אין כאן שום עיגול/חישוב
  // מספר - עקרון "אפס מספרים מומצאים" באפיון
  name: string;
  problem: string;
  solution: string;
  costRange: string;
  savingRange: string;
  complexity: string;
  installTime: string;
  benchmarks: RoadmapBenchmarkView[];
}

export interface RoadmapView {
  id: string;
  diagnosisId: string;
  createdAt: Date;
  items: RoadmapItemView[];
}

// טרנזקציה אינטראקטיבית (לא מערך) - כמו saveScanResult (diagnosis-repo.ts): כשל ביצירת פריט
// כלשהו (למשל catalogId שלא קיים) חייב לגלגל אחורה גם את שורת ה-roadmap עצמה שכבר נוצרה, לא רק
// את הפריטים שהספיקו להיווצר. סדר היצירה משקף את הסדר שהתקבל (score desc, מחושב אצל הקורא -
// scoreOpportunity/matchOpportunities) אך getRoadmapView לא נסמך עליו לקריאה: אין עמודת סדר/rank
// ב-RoadmapItem בסכמה, אז הקריאה ממיינת מפורשות (ראו getRoadmapView למטה)
export async function createRoadmap(
  prisma: PrismaClient,
  diagnosisId: string,
  items: RoadmapItemInput[],
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const roadmap = await tx.roadmap.create({ data: { diagnosisId } });
    for (const item of items) {
      await tx.roadmapItem.create({
        data: {
          roadmapId: roadmap.id,
          catalogId: item.catalogId,
          score: item.score,
          confidence: item.confidence,
          phase: item.phase,
        },
      });
    }
    return roadmap.id;
  });
}

// תצוגת ה-Roadmap האחרון לאבחון נתון: הכי חדש לפי createdAt, כל פריט מצורף לשורת הקטלוג שלו
// (שמות/טווחים/מורכבות/זמן התקנה כלשונם) ולכל הבנצ'מרקים ששייכים לאותו פריט קטלוג. הזיקה בין
// Benchmark ל-RoadmapItem אינה ישירה - Benchmark מצביע על catalogId בלבד (OpportunityCatalog),
// אז "רלוונטי" פירושו כל הבנצ'מרקים של אותה שורת קטלוג, ללא סינון נוסף (אין בסכמה מפתח עדין יותר).
// select צר בכוונה - לא גוררים embedding/conditions הכבדים של OpportunityCatalog, באותו עיקרון
// כמו listRecentDiagnoses (diagnosis-read.ts).
export async function getRoadmapView(prisma: PrismaClient, diagnosisId: string): Promise<RoadmapView | null> {
  const roadmap = await prisma.roadmap.findFirst({
    where: { diagnosisId },
    orderBy: { createdAt: "desc" },
  });
  if (!roadmap) return null;

  // סדר קריאה דטרמיניסטי ומפורש: score יורד (כפי שהקורא חישב), ואז id כשובר שוויון יציב - אין
  // עמודת rank/order ב-RoadmapItem בסכמה, אז לא נסמכים על סדר ההוספה בטבלה עצמה
  const items = await prisma.roadmapItem.findMany({
    where: { roadmapId: roadmap.id },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    select: {
      id: true, catalogId: true, score: true, confidence: true, phase: true, status: true,
      catalog: {
        select: {
          name: true, problem: true, solution: true, costRange: true, savingRange: true,
          complexity: true, installTime: true,
          benchmarks: { select: { id: true, metric: true, range: true, source: true, verifiedAt: true } },
        },
      },
    },
  });

  return {
    id: roadmap.id,
    diagnosisId: roadmap.diagnosisId,
    createdAt: roadmap.createdAt,
    items: items.map((it) => ({
      id: it.id,
      catalogId: it.catalogId,
      score: it.score,
      confidence: it.confidence as Confidence,
      phase: it.phase as Phase,
      status: it.status as RoadmapItemStatus,
      name: it.catalog.name,
      problem: it.catalog.problem,
      solution: it.catalog.solution,
      costRange: it.catalog.costRange,
      savingRange: it.catalog.savingRange,
      complexity: it.catalog.complexity,
      installTime: it.catalog.installTime,
      benchmarks: it.catalog.benchmarks.map((b) => ({
        id: b.id, metric: b.metric, range: b.range, source: b.source, verifiedAt: b.verifiedAt,
      })),
    })),
  };
}
