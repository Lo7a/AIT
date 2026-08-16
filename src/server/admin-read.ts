import type { PrismaClient } from "@prisma/client";
import type { ScoreReport } from "../pipeline/score/types";

// צד הקריאה של מסכי האדמין (אבן דרך "לצאת החוצה", הרחבת המייסד: "מסכי ניהול, סטטיסטיקות,
// משתמשים ושימוש"): שאילתות רוחביות בלי תיחום בעלות - השער נמצא בעמוד (isAdmin בלבד).
// העיצוב placeholder כמו כל המסכים; הכוונה כאן היא שכבת נתונים יציבה שמסכי שלב ב יתלבשו עליה.

// עזר טהור (נבדק אופליין): ספירה לפי מפתח - הבסיס לכל הסטטיסטיקות הקטנות
export function countByKey<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

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

export async function getAdminOverview(prisma: PrismaClient, now: Date = new Date()): Promise<AdminOverview> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const [users, businesses, statusRows, scanAgg, eventRows] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.diagnosis.findMany({ select: { status: true } }),
    prisma.scan.aggregate({ _count: true, _sum: { llmCost: true, apiCost: true } }),
    prisma.usageEvent.findMany({ where: { createdAt: { gte: weekAgo } }, select: { type: true } }),
  ]);
  return {
    users,
    businesses,
    diagnosesByStatus: countByKey(statusRows, (r) => r.status),
    scans: scanAgg._count,
    scanCostUsd: Number(scanAgg._sum.llmCost ?? 0) + Number(scanAgg._sum.apiCost ?? 0),
    eventsByType7d: countByKey(eventRows, (r) => r.type),
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

export async function listAllDiagnoses(prisma: PrismaClient, limit = 100): Promise<AdminDiagnosisRow[]> {
  const rows = await prisma.diagnosis.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      business: { select: { name: true, owner: { select: { email: true } } } },
      scans: { orderBy: { createdAt: "desc" }, take: 1, select: { scores: true } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    businessName: d.business.name,
    ownerEmail: d.business.owner?.email ?? null,
    status: d.status,
    overall: ((d.scans[0]?.scores ?? null) as ScoreReport | null)?.overall ?? null,
    createdAt: d.createdAt,
  }));
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

export async function listUsersWithActivity(prisma: PrismaClient): Promise<AdminUserRow[]> {
  const [users, lastEvents] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { businesses: true, events: true } } },
    }),
    prisma.usageEvent.groupBy({ by: ["userId"], _max: { createdAt: true } }),
  ]);
  const lastByUser = new Map(lastEvents.map((e) => [e.userId, e._max.createdAt]));
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    businessCount: u._count.businesses,
    eventCount: u._count.events,
    lastEventAt: lastByUser.get(u.id) ?? null,
  }));
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

export async function listRecentEvents(prisma: PrismaClient, limit = 50): Promise<AdminEventRow[]> {
  const rows = await prisma.usageEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { email: true } },
      actor: { select: { email: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    type: e.type,
    userEmail: e.user?.email ?? null,
    actorEmail: e.actor?.email ?? null,
    entityType: e.entityType,
    entityId: e.entityId,
    createdAt: e.createdAt,
  }));
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
