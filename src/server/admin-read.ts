import type { Prisma, PrismaClient } from "@prisma/client";
import { pageWindow, paged, type Paged, type PageRequest } from "./paging";
import type { ScoreReport } from "../pipeline/score/types";

// צד הקריאה של מסכי האדמין (אבן דרך "לצאת החוצה", הרחבת המייסד: "מסכי ניהול, סטטיסטיקות,
// משתמשים ושימוש"): שאילתות רוחביות בלי תיחום בעלות - השער נמצא בעמוד (isAdmin בלבד).
// העיצוב placeholder כמו כל המסכים; הכוונה כאן היא שכבת נתונים יציבה שמסכי שלב ב יתלבשו עליה.

export interface AdminOverview {
  users: number;
  businesses: number;
  diagnosesByStatus: Record<string, number>;
  scans: number;
  // עלות סריקות מצטברת (USD) - llm_cost + api_cost על כל שורות הסריקה; Decimal -> number בגבול ה-repo
  scanCostUsd: number;
  // אירועי יומן בשבעת הימים האחרונים, לפי סוג - הדופק של המערכת
  eventsByType7d: Record<string, number>;
}

// שתי הספירות כאן היו findMany שמושך כל שורה ומונה אותה ב-JS: כל האבחונים במערכת,
// וכל אירועי היומן של השבוע. זה עבד על עשרות שורות והיה נעשה יקר יותר בכל יום -
// היומן במיוחד, כי הוא הטבלה שגדלה הכי מהר. עכשיו groupBy: המסד מחזיר שורה אחת לכל
// סוג עם הספירה, כלומר תשובה בגודל קבוע במקום בגודל הטבלה (תיקון יעילות 20.8)
export async function getAdminOverview(prisma: PrismaClient, now: Date = new Date()): Promise<AdminOverview> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const [users, businesses, statusGroups, scanAgg, eventGroups] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.diagnosis.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.scan.aggregate({ _count: true, _sum: { llmCost: true, apiCost: true } }),
    prisma.usageEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
  ]);

  const fromGroups = <K extends string>(
    groups: ({ _count: { _all: number } } & Record<K, string>)[],
    key: K,
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const g of groups) out[g[key]] = g._count._all;
    return out;
  };

  return {
    users,
    businesses,
    diagnosesByStatus: fromGroups(statusGroups, "status"),
    scans: scanAgg._count,
    scanCostUsd: Number(scanAgg._sum.llmCost ?? 0) + Number(scanAgg._sum.apiCost ?? 0),
    eventsByType7d: fromGroups(eventGroups, "type"),
  };
}

export interface AdminDiagnosisRow {
  id: string;
  businessName: string;
  ownerEmail: string | null; // null = שורה ללא בעלים (נתוני טסט ותיקים)
  status: string;
  overall: number | null;
  createdAt: Date;
}

export interface DiagnosisListQuery extends PageRequest {
  /** שם עסק או אימייל בעלים */
  q?: string;
  status?: string;
}

// עד 20.8 נשלפו כאן 100 השורות האחרונות תמיד, בלי דרך להגיע לישנות מהן ובלי לדעת כמה
// יש בסך הכול. עכשיו עימוד אמיתי: הספירה והשורות רצות במקביל, והחיפוש מצטמצם במסד
// ולא בזיכרון של השרת
export async function listAllDiagnoses(
  prisma: PrismaClient,
  query: DiagnosisListQuery = {},
): Promise<Paged<AdminDiagnosisRow>> {
  const w = pageWindow(query, 25);

  const and: Prisma.DiagnosisWhereInput[] = [];
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { business: { name: { contains: q, mode: "insensitive" } } },
        { business: { owner: { email: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (query.status) and.push({ status: query.status });
  const where: Prisma.DiagnosisWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.diagnosis.count({ where }),
    prisma.diagnosis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: w.skip,
      take: w.take,
      include: {
        business: { select: { name: true, owner: { select: { email: true } } } },
        scans: { orderBy: { createdAt: "desc" }, take: 1, select: { scores: true } },
      },
    }),
  ]);

  return paged(
    rows.map((d) => ({
      id: d.id,
      businessName: d.business.name,
      ownerEmail: d.business.owner?.email ?? null,
      status: d.status,
      overall: ((d.scans[0]?.scores ?? null) as ScoreReport | null)?.overall ?? null,
      createdAt: d.createdAt,
    })),
    total,
    w,
  );
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: string;
  createdAt: Date;
  businessCount: number;
  eventCount: number;
  lastEventAt: Date | null; // הפעולה האחרונה ביומן - "מתי נראה לאחרונה"
}

export interface UserListQuery extends PageRequest {
  q?: string;
  role?: string;
}

// שתי בעיות יעילות תוקנו כאן ב-20.8, ושתיהן היו גדלות עם המוצר:
// 1. כל המשתמשים נשלפו תמיד, בלי עימוד.
// 2. ה-groupBy על היומן רץ על **כל** האירועים במערכת כדי לדעת "מתי נראה לאחרונה" -
//    סריקה מלאה של הטבלה שגדלה הכי מהר. עכשיו הוא מצומצם למזהי העמוד הנוכחי בלבד.
export async function listUsersWithActivity(
  prisma: PrismaClient,
  query: UserListQuery = {},
): Promise<Paged<AdminUserRow>> {
  const w = pageWindow(query, 25);

  const and: Prisma.UserWhereInput[] = [];
  const q = query.q?.trim();
  if (q) and.push({ email: { contains: q, mode: "insensitive" } });
  if (query.role) and.push({ role: query.role });
  const where: Prisma.UserWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: w.skip,
      take: w.take,
      include: { _count: { select: { businesses: true, events: true } } },
    }),
  ]);

  const ids = users.map((u) => u.id);
  const lastEvents = ids.length === 0
    ? []
    : await prisma.usageEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: ids } },
        _max: { createdAt: true },
      });
  const lastByUser = new Map(lastEvents.map((e) => [e.userId, e._max.createdAt]));

  return paged(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      businessCount: u._count.businesses,
      eventCount: u._count.events,
      lastEventAt: lastByUser.get(u.id) ?? null,
    })),
    total,
    w,
  );
}

export interface AdminEventRow {
  id: string;
  type: string;
  userEmail: string | null;
  // מי ביצע בפועל - שונה מ-userEmail רק בפעולת התחזות של אדמין (וכך ההתחזות גלויה ביומן)
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
}

export interface EventListQuery extends PageRequest {
  type?: string;
  /** אימייל של מי שהפעולה בהקשרו או של מי שביצע אותה */
  q?: string;
}

// היומן הוא הטבלה שגדלה הכי מהר במערכת, ועד 20.8 המסך הראה 50 שורות אחרונות בלי דרך
// להגיע לישנות מהן. עימוד וסינון לפי סוג הופכים אותו למשהו שאפשר באמת לחקור בו
export async function listRecentEvents(
  prisma: PrismaClient,
  query: EventListQuery = {},
): Promise<Paged<AdminEventRow>> {
  const w = pageWindow(query, 50);

  const and: Prisma.UsageEventWhereInput[] = [];
  if (query.type) and.push({ type: query.type });
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { user: { email: { contains: q, mode: "insensitive" } } },
        { actor: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.UsageEventWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.usageEvent.count({ where }),
    prisma.usageEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: w.skip,
      take: w.take,
      include: {
        user: { select: { email: true } },
        actor: { select: { email: true } },
      },
    }),
  ]);

  return paged(
    rows.map((e) => ({
      id: e.id,
      type: e.type,
      userEmail: e.user?.email ?? null,
      actorEmail: e.actor?.email ?? null,
      entityType: e.entityType,
      entityId: e.entityId,
      createdAt: e.createdAt,
    })),
    total,
    w,
  );
}

// ארכיון הקריאות החיצוניות (הכרעת מייסד 17.8): סיכומי שימוש וטוקנים למסך האדמין.
// הגרסה הראשונה מציגה סיכומים לפי שירות+הקשר; סינונים, ריבוי בחירות ופילוח פר-משתמש -
// אחרי בחירת העיצוב (הכרעת מייסד). האגרגציה רצה ב-JS על שורות 7 הימים האחרונים - נכון
// לסקייל הנוכחי; כשהנפח יגדל עוברים ל-groupBy בצד המסד (השאילתה כבר מסוננת לפי אינדקס)
export interface AdminExternalCallStat {
  service: string;
  context: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  avgDurationMs: number;
}

export interface AdminExternalCallsSummary {
  last7d: AdminExternalCallStat[]; // ממוין: הכי הרבה קריאות קודם
  todayCalls: number; // ביממה האחרונה
  todayTokens: number; // נכנסים+יוצאים ביממה האחרונה
}

interface ExternalCallRowLite {
  service: string; context: string; ok: boolean; durationMs: number;
  inputTokens: number | null; outputTokens: number | null; createdAt: Date;
}

// עזר טהור (נבדק אופליין) - כל הלוגיקה כאן, השאילתה למטה דקה
export interface ExternalCallGroup {
  service: string;
  context: string;
  ok: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalDurationMs: number;
}

/**
 * מיזוג קבוצות ה-groupBy לשורת סטטיסטיקה אחת לכל שירות+הקשר.
 *
 * המסד מקבץ לפי service+context+ok, ולכן כל צמד מגיע כשתי שורות לכל היותר (הצליח,
 * נכשל) - המיזוג כאן מחבר אותן. הפונקציה נשארה טהורה ונבדקת אופליין; מה שהשתנה ב-20.8
 * הוא הקלט: קודם היא קיבלה **כל שורת קריאה** של השבוע, וזה גדל עם כל סריקה
 */
export function aggregateExternalCalls(
  groups: ExternalCallGroup[],
  today: { calls: number; tokens: number },
): AdminExternalCallsSummary {
  const byKey = new Map<string, AdminExternalCallStat & { totalDurationMs: number }>();
  for (const g of groups) {
    const key = `${g.service}:${g.context}`;
    const stat = byKey.get(key) ?? {
      service: g.service, context: g.context, calls: 0, failed: 0,
      inputTokens: 0, outputTokens: 0, avgDurationMs: 0, totalDurationMs: 0,
    };
    stat.calls += g.calls;
    if (!g.ok) stat.failed += g.calls;
    stat.inputTokens += g.inputTokens;
    stat.outputTokens += g.outputTokens;
    stat.totalDurationMs += g.totalDurationMs;
    byKey.set(key, stat);
  }
  const last7d = [...byKey.values()]
    .map(({ totalDurationMs, ...stat }) => ({
      ...stat,
      // calls לעולם אינו אפס כאן: קבוצה נוצרת רק כשיש לה שורות
      avgDurationMs: stat.calls === 0 ? 0 : Math.round(totalDurationMs / stat.calls),
    }))
    .sort((a, b) => b.calls - a.calls);
  return { last7d, todayCalls: today.calls, todayTokens: today.tokens };
}


// עד 20.8 נשלפה כאן **כל שורת קריאה חיצונית של השבוע** והאגרגציה רצה ב-JS. כל סריקה
// מייצרת כמה שורות כאלה, כלומר הבקשה הזו גדלה בקצב השימוש - בדיוק הדבר שאסור שיהיה
// במסך שנפתח כל יום. עכשיו המסד מקבץ, והתשובה היא בגודל מספר צמדי שירות+הקשר: קבוע
export async function getExternalCallsSummary(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<AdminExternalCallsSummary> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const [groups, today] = await Promise.all([
    prisma.externalCall.groupBy({
      by: ["service", "context", "ok"],
      where: { createdAt: { gte: weekAgo } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, durationMs: true },
    }),
    prisma.externalCall.aggregate({
      where: { createdAt: { gte: dayAgo } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  return aggregateExternalCalls(
    groups.map((g) => ({
      service: g.service,
      context: g.context,
      ok: g.ok,
      calls: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      totalDurationMs: g._sum.durationMs ?? 0,
    })),
    {
      calls: today._count._all,
      tokens: (today._sum.inputTokens ?? 0) + (today._sum.outputTokens ?? 0),
    },
  );
}


// דריסות ההגדרות הקיימות עבור מסך המגבלות (admin) - מפתח -> ערך, רק למפתחות המבוקשים
export async function listSettingOverrides(prisma: PrismaClient, keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface AdminBriefRow {
  id: string;
  itemName: string;
  businessName: string;
  sentAt: Date | null; // null = נוצר אך שליחתו נכשלה/טרם נשלח
  createdAt: Date;
}

export async function listRecentBriefs(prisma: PrismaClient, limit = 20): Promise<AdminBriefRow[]> {
  const rows = await prisma.brief.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      roadmapItem: {
        select: {
          catalog: { select: { name: true } },
          roadmap: { select: { diagnosis: { select: { business: { select: { name: true } } } } } },
        },
      },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    itemName: b.roadmapItem.catalog.name,
    businessName: b.roadmapItem.roadmap.diagnosis.business.name,
    sentAt: b.sentAt,
    createdAt: b.createdAt,
  }));
}
