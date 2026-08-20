import type { Prisma, PrismaClient } from "@prisma/client";
import { parseServiceType, type ServiceType } from "../pipeline/roadmap/service-type";
import { industriesOf } from "./roadmap-repo";
import { pageWindow, paged, type Paged, type PageRequest } from "./paging";

// שכבת הגישה לספרייה עבור מסכי הניהול. נפרדת מ-roadmap-repo.ts בכוונה: שם קוראים את
// הקטלוג *לצריכה* (התאמה לעסק, שדות מינימליים), וכאן קוראים וכותבים אותו *לניהול* -
// כולל פריטים מארוכבים, ספירת בנצ'מרקים, חיפוש ועימוד. מיזוג השניים היה מכריח כל
// קריאה בצינור לשאת שדות שאין לה בהם צורך.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PrismaClient | { opportunityCatalog: any; benchmark: any };

export const CATALOG_PAGE_SIZE = 20;

export interface CatalogAdminRow {
  id: string;
  name: string;
  problem: string;
  solution: string;
  serviceType: ServiceType | null;
  phase: string | null;
  industries: string[];
  gapKeys: string[];
  costRange: string;
  savingRange: string;
  complexity: string;
  installTime: string;
  archivedAt: Date | null;
  updatedAt: Date;
  benchmarkCount: number;
}

// אותו טיפוס עימוד של כל שאר מסכי הניהול (paging.ts) ולא צורה משלו - חמישה מסכים
// שמעמדים חייבים להתנהג זהה
export type CatalogListResult = Paged<CatalogAdminRow>;

export interface CatalogListQuery extends PageRequest {
  q?: string;
  serviceType?: string | null;
  industry?: string | null;
  /** ברירת המחדל מציגה רק פריטים פעילים - מארוכב הוא היסטוריה, לא מלאי */
  includeArchived?: boolean;
}

// conditions הוא Json בסכמה, ולכן כל קריאה ממנו מנורמלת ולא מונחת. אותה זהירות בדיוק
// כמו ב-matching.ts: קיים-אך-פגום אינו "חסר", והוא לא הופך פריט ענפי לפריט כללי
function readConditions(value: unknown): { gapKeys: string[]; industries: string[] } {
  const obj = (value ?? {}) as Record<string, unknown>;
  const gapKeys = Array.isArray(obj.gapKeys) ? obj.gapKeys.filter((k): k is string => typeof k === "string") : [];
  // ?? [] כי כאן צריך רשימה לתצוגה; ההבחנה בין ריק לחסר נחוצה רק בהתאמה עצמה
  return { gapKeys, industries: industriesOf(value) ?? [] };
}

function toRow(r: any): CatalogAdminRow {
  const { gapKeys, industries } = readConditions(r.conditions);
  return {
    id: r.id,
    name: r.name,
    problem: r.problem,
    solution: r.solution,
    serviceType: parseServiceType(r.serviceType),
    phase: typeof r.phase === "string" ? r.phase : null,
    industries,
    gapKeys,
    costRange: r.costRange,
    savingRange: r.savingRange,
    complexity: r.complexity,
    installTime: r.installTime,
    archivedAt: r.archivedAt ?? null,
    updatedAt: r.updatedAt,
    benchmarkCount: r._count?.benchmarks ?? 0,
  };
}

/**
 * רשימת הספרייה למסך הניהול: חיפוש חופשי, סינון לפי סוג שירות וענף, ועימוד.
 *
 * העימוד הוא offset ולא cursor במכוון: הספרייה היא עשרות פריטים ולא מיליונים, ומסך
 * ניהול צריך "עמוד 3" ומספר תוצאות כולל - שני דברים ש-cursor לא נותן. ספירה ורשימה
 * רצות בשאילתה אחת ($transaction) כדי לא לשלם שתי הלוך-חזור לפרנקפורט.
 */
export async function listCatalogAdmin(db: Db, query: CatalogListQuery = {}): Promise<CatalogListResult> {
  const w = pageWindow(query, CATALOG_PAGE_SIZE);

  const and: Prisma.OpportunityCatalogWhereInput[] = [];
  if (!query.includeArchived) and.push({ archivedAt: null });

  const q = query.q?.trim();
  if (q) {
    // חיפוש על שלושת שדות הטקסט שהאדמין באמת מחפש בהם. insensitive כי עברית ואנגלית
    // מעורבבות כאן, ושם פריט עשוי להיכתב באות גדולה או קטנה
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { problem: { contains: q, mode: "insensitive" } },
        { solution: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const serviceType = parseServiceType(query.serviceType);
  if (serviceType != null) and.push({ serviceType });

  if (query.industry) {
    // הסינון מילולי: פריט שהענף שלו מופיע ברשימה. פריט כללי (בלי industries) *אינו*
    // נכלל - במסך ניהול "הראה לי את פריטי המסעדות" פירושו הפריטים הענפיים, והפריטים
    // הכלליים נראים ממילא בלי סינון
    and.push({ conditions: { path: ["industries"], array_contains: [query.industry] } });
  }

  const where: Prisma.OpportunityCatalogWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    db.opportunityCatalog.count({ where }),
    db.opportunityCatalog.findMany({
      where,
      // מארוכבים לתחתית, ואז לפי סוג שירות ושם - כך הספרייה נקראת מסודרת גם בלי סינון
      orderBy: [{ archivedAt: "asc" }, { serviceType: "asc" }, { name: "asc" }],
      skip: w.skip,
      take: w.take,
      include: { _count: { select: { benchmarks: true } } },
    }),
  ]);

  return paged(rows.map(toRow), total, w);
}

export interface BenchmarkRow {
  id: string;
  metric: string;
  range: string;
  source: string;
  verifiedAt: Date;
}

export interface CatalogItemDetail extends CatalogAdminRow {
  benchmarks: BenchmarkRow[];
}

export async function getCatalogItemAdmin(db: Db, id: string): Promise<CatalogItemDetail | null> {
  const row = await db.opportunityCatalog.findUnique({
    where: { id },
    include: {
      _count: { select: { benchmarks: true } },
      benchmarks: { orderBy: { verifiedAt: "desc" } },
    },
  });
  if (row == null) return null;
  return {
    ...toRow(row),
    benchmarks: row.benchmarks.map((b: any) => ({
      id: b.id, metric: b.metric, range: b.range, source: b.source, verifiedAt: b.verifiedAt,
    })),
  };
}

/** כמה פריטים יש בכל סוג שירות - להצגת הקטגוריות עם מונה, בשאילתה אחת */
export async function catalogCountsByServiceType(
  db: Db,
  includeArchived = false,
): Promise<Record<string, number>> {
  const rows = await db.opportunityCatalog.groupBy({
    by: ["serviceType"],
    where: includeArchived ? {} : { archivedAt: null },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows as { serviceType: string | null; _count: { _all: number } }[]) {
    out[r.serviceType ?? ""] = r._count._all;
  }
  return out;
}
