import type { PrismaClient } from "@prisma/client";
import { phaseTierOf, type Confidence, type Phase } from "../pipeline/roadmap/opportunity-score";
import type { CatalogRowLite } from "../pipeline/roadmap/matching";

// שכבת השמירה של ה-Roadmap (אבן דרך 4, משימה 4): כתיבה אטומית (roadmap + כל פריטיו בטרנזקציה
// אחת) וקריאת "התצוגה האחרונה" בלבד. Roadmap חדש נוצר בכל חישוב מחדש (היסטוריה נשמרת - "מחושב
// מחדש" באפיון), אף פעם לא update-in-place; getRoadmapView תמיד מחזיר את החדש ביותר לאבחון נתון.

export interface RoadmapItemInput {
  catalogId: string;
  score: number;
  confidence: Confidence;
  phase: Phase;
  // משפט נימוק אחד בעברית (אבן דרך 4, משימה 5) - LLM מוגן או תבנית דטרמיניסטית fallback,
  // לעולם לא null בפועל (buildReasoning תמיד מייצר ערך) - הטיפוס nullable כדי לשקף את עמודת
  // ה-DB עצמה (reasoning String? בסכמה, אדיטיבי) ולהשאיר פתח לעתיד (backfill על שורות ישנות)
  reasoning: string | null;
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
  reasoning: string | null;
  benchmarks: RoadmapBenchmarkView[];
}

export interface RoadmapView {
  id: string;
  diagnosisId: string;
  createdAt: Date;
  items: RoadmapItemView[];
}

// conditions היא עמודת Json (schema.prisma) בלי אכיפת צורה ב-DB, ו-matching.ts מסתמך על gapKeys
// כמערך. קאסט עיוור הפך שורת קטלוג פגומה אחת (conditions ריק/בלי gapKeys) לכשל TypeError שהפיל
// את בניית ה-Roadmap של כל האבחונים במערכת (as-built, run-roadmap.ts). הנרמול כאן שומר על רדיוס
// הנזק בגודל הפריט: שורה פגומה מקבלת gapKeys ריק, ולכן פשוט לא מתאימה לשום פער.
function gapKeysOf(conditions: unknown): string[] {
  const keys = (conditions as { gapKeys?: unknown } | null)?.gapKeys;
  return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
}

// אותו נרמול בדיוק ל-industries (התניית ענף, 20.8), ומאותה סיבה. כאן הכשל השקט מסוכן יותר:
// שדה פגום שהופך ל-undefined הופך פריט **ענפי** לפריט **כללי**, כלומר תפריט QR לשרברב.
// לכן מערך שקיים אך אף איבר בו אינו מחרוזת מוחזר כמערך ריק ולא כ-undefined - פריט כזה לא
// יתאים לשום ענף, וזו ההידרדרות הבטוחה. undefined מוחזר רק כשהשדה באמת לא קיים
function industriesOf(conditions: unknown): string[] | undefined {
  const list = (conditions as { industries?: unknown } | null)?.industries;
  if (!Array.isArray(list)) return undefined;
  return list.filter((v): v is string => typeof v === "string");
}

// טעינה משותפת של שורת הקטלוג המצומצמת ל-matchOpportunities (matching.ts) - שני קוראים: הבנייה
// המלאה של Roadmap (run-roadmap.ts) והחישוב-בזיכרון-בלבד של "מה מונח על השולחן" למסך הדוח
// (report-highlights.ts, שלב א' "loss leads, score measures") צריכים בדיוק אותה שורה מצומצמת -
// select צר בכוונה, בלי embedding/benchmarks הכבדים
export async function loadCatalogLite(prisma: PrismaClient): Promise<CatalogRowLite[]> {
  const rows = await prisma.opportunityCatalog.findMany({
    select: {
      id: true, name: true, problem: true, solution: true, conditions: true,
      costRange: true, savingRange: true, complexity: true, installTime: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    problem: r.problem,
    solution: r.solution,
    conditions: {
      gapKeys: gapKeysOf(r.conditions),
      ...(industriesOf(r.conditions) != null ? { industries: industriesOf(r.conditions) } : {}),
    },
    costRange: r.costRange,
    savingRange: r.savingRange,
    complexity: r.complexity,
    installTime: r.installTime,
  }));
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
          reasoning: item.reasoning,
        },
      });
    }
    return roadmap.id;
  });
}

// אותו סדר בדיוק שהקורא חישב וכתב (run-roadmap.ts, compareAiFirstThenScoreThenName): שכבת AI
// קודם (phaseTierOf - החלטת מייסד 16.8, "AI נמכר הכי טוב"), ואז score יורד ואז שם הקטלוג.
// השוואת מחרוזות רגילה (לא localeCompare עם לוקאל) בכוונה - התוצאה זהה בכל סביבת ריצה.
// המיון כאן חל גם על Roadmaps שנשמרו לפני ההחלטה - הקריאה מרימה את פריטי ה-AI שלהם למעלה בלי
// צורך בבנייה מחדש
function sortItems(items: RoadmapItemView[]): RoadmapItemView[] {
  return [...items].sort((a, b) => {
    const tierDiff = phaseTierOf(a.phase) - phaseTierOf(b.phase);
    if (tierDiff !== 0) return tierDiff;
    if (b.score !== a.score) return b.score - a.score;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
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

  // סדר קריאה דטרמיניסטי ומפורש: score יורד (כפי שהקורא חישב), ואז id - אין עמודת rank/order
  // ב-RoadmapItem בסכמה, אז לא נסמכים על סדר ההוספה בטבלה עצמה. ה-id בסכמה הוא uuid אקראי
  // (@default(uuid())), ולכן הוא שובר שוויון יציב אך שרירותי - שני פריטים באותו ציון היו
  // מתקבלים בסדר אקראי לכל Roadmap ולא בסדר שהקורא חישב (סקירה: אומת על uuid-ים אמיתיים).
  // הסדר הסופי המחייב (שכבת AI קודם + שם קטלוג כשובר שוויון) נקבע בזיכרון ב-sortItems למטה,
  // לא כאן ב-SQL - גם כדי לא להיות תלוי בקולציית ה-DB לעברית, אותה השוואת מחרוזות בדיוק כמו
  // בצד הכתיבה (run-roadmap.ts)
  const items = await prisma.roadmapItem.findMany({
    where: { roadmapId: roadmap.id },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    select: {
      id: true, catalogId: true, score: true, confidence: true, phase: true, status: true, reasoning: true,
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
    items: sortItems(items.map((it) => ({
      id: it.id,
      catalogId: it.catalogId,
      score: it.score,
      confidence: it.confidence as Confidence,
      phase: it.phase as Phase,
      status: it.status as RoadmapItemStatus,
      reasoning: it.reasoning,
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
    }))),
  };
}
