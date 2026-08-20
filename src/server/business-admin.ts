import { Prisma, type PrismaClient } from "@prisma/client";
import { industryFromPlaces, type IndustryValue } from "../pipeline/industry";
import { pageWindow, paged, type Paged, type PageRequest } from "./paging";

// מסך העסקים בניהול (בקשת מייסד 20.8): כל עסק, כמה אבחונים יש לו, מתי האחרון, ולאיזה
// ענף הוא שייך.
//
// הענף אינו עמודה בטבלה - הוא נגזר מסוג העסק שגוגל החזיר בסריקה האחרונה
// (industry.ts). לכן הוא נשלף בשאילתה נפרדת וצרה: **רק** שדות ה-JSON שדרושים לגזירה,
// ורק לעסקים שבעמוד הנוכחי. שליפת findings המלא ל-25 עסקים הייתה מושכת מגה-בייטים
// של פילוח סריקה כדי להציג מילה אחת בכל שורה.

export interface BusinessAdminRow {
  id: string;
  name: string;
  city: string | null;
  website: string | null;
  ownerEmail: string | null;
  diagnoses: number;
  lastDiagnosisAt: Date | null;
  industry: IndustryValue;
}

export interface BusinessListQuery extends PageRequest {
  /** שם עסק, עיר, אתר או אימייל בעלים */
  q?: string;
  /** slug של ענף, או "unknown" לעסקים שלא זוהו */
  industry?: string;
}

/** סוג העסק לפי גוגל, לעסקים נתונים, מהסריקה האחרונה של כל אחד */
async function industryByBusiness(
  prisma: PrismaClient,
  ids: string[],
): Promise<Map<string, IndustryValue>> {
  const out = new Map<string, IndustryValue>();
  if (ids.length === 0) return out;

  // DISTINCT ON מחזיר שורה אחת לכל עסק - את הסריקה האחרונה שלו - בלי לשלוף את השאר.
  //
  // = any(...::uuid[]) ולא in (...): business_id הוא uuid בסכמה, והפרמטרים נשלחים
  // כטקסט, אז השוואה ישירה נופלת ב-"operator does not exist: uuid = text". ההמרה על
  // הפרמטר ולא על העמודה, כדי שהאינדקס על business_id יישאר שמיש
  const rows = await prisma.$queryRaw<{ business_id: string; primary_type: string | null; types: unknown }[]>`
    select distinct on (d.business_id)
           d.business_id,
           s.findings->'business'->>'primaryType' as primary_type,
           s.findings->'business'->'types'        as types
      from scans s
      join diagnoses d on d.id = s.diagnosis_id
     where d.business_id = any(${ids}::uuid[])
     order by d.business_id, s.created_at desc
  `;

  for (const r of rows) {
    const types = Array.isArray(r.types) ? r.types.filter((t): t is string => typeof t === "string") : undefined;
    out.set(r.business_id, industryFromPlaces(r.primary_type ?? undefined, types).slug);
  }
  return out;
}

export async function listBusinessesAdmin(
  prisma: PrismaClient,
  query: BusinessListQuery = {},
): Promise<Paged<BusinessAdminRow>> {
  const w = pageWindow(query, 25);

  const and: Prisma.BusinessWhereInput[] = [];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { website: { contains: q, mode: "insensitive" } },
        { owner: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.BusinessWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: w.skip,
      take: w.take,
      select: {
        id: true, name: true, city: true, website: true,
        owner: { select: { email: true } },
        _count: { select: { diagnoses: true } },
        diagnoses: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  const industries = await industryByBusiness(prisma, rows.map((r) => r.id));

  const mapped: BusinessAdminRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    website: r.website,
    ownerEmail: r.owner?.email ?? null,
    diagnoses: r._count.diagnoses,
    lastDiagnosisAt: r.diagnoses[0]?.createdAt ?? null,
    industry: industries.get(r.id) ?? "unknown",
  }));

  // סינון ענף אחרי הגזירה, כי הוא לא קיים כעמודה. המחיר: העימוד נספר לפני הסינון,
  // ולכן העמוד עשוי לצאת קצר מ-25 כשמסננים. ההצגה אומרת את זה במפורש במקום להעמיד
  // פנים שהמספר מדויק
  const filtered = query.industry ? mapped.filter((r) => r.industry === query.industry) : mapped;
  return paged(filtered, total, w);
}

export interface BusinessDetail {
  id: string;
  name: string;
  city: string | null;
  website: string | null;
  phone: string | null;
  ownerEmail: string | null;
  industry: IndustryValue;
  diagnoses: { id: string; status: string; createdAt: Date; overall: number | null }[];
}

export async function getBusinessAdmin(prisma: PrismaClient, id: string): Promise<BusinessDetail | null> {
  const b = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true, name: true, city: true, website: true, phone: true,
      owner: { select: { email: true } },
      diagnoses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, createdAt: true,
          scans: { orderBy: { createdAt: "desc" }, take: 1, select: { scores: true } },
        },
      },
    },
  });
  if (b == null) return null;

  const industries = await industryByBusiness(prisma, [id]);

  return {
    id: b.id,
    name: b.name,
    city: b.city,
    website: b.website,
    phone: b.phone,
    ownerEmail: b.owner?.email ?? null,
    industry: industries.get(id) ?? "unknown",
    diagnoses: b.diagnoses.map((d) => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      overall: ((d.scans[0]?.scores ?? null) as { overall?: number | null } | null)?.overall ?? null,
    })),
  };
}
