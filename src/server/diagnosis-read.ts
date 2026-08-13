import type { PrismaClient } from "@prisma/client";
import type { ScanFindings } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import type { ReportNarrative } from "../pipeline/report/narrative";
import type { LlmUsage } from "../pipeline/llm/client";
import {
  recommendNextStep, type BusinessModel, type ModelSection, type FieldSource, type NextStepRecommendation,
} from "../pipeline/model/business-model";
import type { DiagnosisStatus } from "./status";

// צד הקריאה של שכבת השמירה (שער 2א, דרישה 1): Json → טיפוסי דומיין, Decimal → number.
// כל ההמרות קורות כאן, בגבול ה-repo — ל-RSC מגיעים רק טיפוסים סריאליזביליים.

export interface NarrativeView {
  narrative: ReportNarrative;
  usedFallback: boolean | null; // null = שורה מלפני שמירת הפרובננס (משימה 1) — לא ידוע
  usage: LlmUsage | null;
}

export interface ReportScanView {
  findings: ScanFindings;
  scores: ScoreReport | null;
  narrative: NarrativeView | null;
  llmCost: number;
  apiCost: number;
  durationMs: number;
  createdAt: Date;
}

export interface ReportBusinessView {
  id: string;
  name: string;
  placeId: string | null;
  website: string | null;
  city: string | null;
}

export interface ModelView extends BusinessModel { updatedAt: Date }

export interface ReportView {
  id: string;
  status: DiagnosisStatus;
  createdAt: Date;
  business: ReportBusinessView;
  scan: ReportScanView | null; // הסריקה האחרונה; null כשהאבחון עוד לא נסרק
  model: ModelView | null;
  nextStep: NextStepRecommendation | null; // מחושב בקריאה מהמודל — לא נשמר ב-DB
}

export interface DiagnosisListItem {
  id: string;
  status: DiagnosisStatus;
  createdAt: Date;
  businessName: string;
  overall: number | null; // מהסריקה האחרונה, אם קיימת
}

function toFindings(json: unknown): ScanFindings {
  const obj = json as Record<string, unknown> | null;
  if (obj == null || typeof obj !== "object" || !Object.hasOwn(obj, "business") || !Object.hasOwn(obj, "meta")) {
    throw new Error("שורת scan פגומה: findings בלי business/meta");
  }
  return json as ScanFindings;
}

function toNarrativeView(json: unknown): NarrativeView | null {
  if (json == null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (Object.hasOwn(obj, "narrative")) {
    // צורה חדשה (משימה 1): NarrativeResult מלא
    const nested = obj.narrative;
    if (nested == null || typeof nested !== "object") return null; // עטיפה פגומה — בלי נרטיב מקונן תקין, מתדרדר ל"אין נרטיב" ולא זריקה
    const r = obj as { narrative: ReportNarrative; usedFallback?: boolean; usage?: LlmUsage };
    return { narrative: r.narrative, usedFallback: r.usedFallback ?? null, usage: r.usage ?? null };
  }
  // צורה ישנה: ReportNarrative ישיר — בלי פרובננס (ראו הערת האינווריאנט ב-diagnosis-repo.ts)
  return { narrative: json as ReportNarrative, usedFallback: null, usage: null };
}

type ScanRowDb = {
  findings: unknown; scores: unknown; narrative: unknown;
  llmCost: unknown; apiCost: unknown; durationMs: number; createdAt: Date;
};

function toScanView(s: ScanRowDb): ReportScanView {
  return {
    findings: toFindings(s.findings),
    scores: (s.scores ?? null) as ScoreReport | null,
    narrative: toNarrativeView(s.narrative),
    llmCost: Number(s.llmCost ?? 0), // Prisma.Decimal → number, בגבול ה-repo
    apiCost: Number(s.apiCost ?? 0),
    durationMs: s.durationMs,
    createdAt: s.createdAt,
  };
}

type ModelRowDb = {
  data: unknown; fieldSources: unknown; credits: unknown; completenessPct: number; updatedAt: Date;
};

function toModelView(m: ModelRowDb): ModelView {
  return {
    data: m.data as Record<ModelSection, Record<string, unknown>>,
    fieldSources: m.fieldSources as Partial<Record<ModelSection, FieldSource[]>>,
    credits: m.credits as Record<ModelSection, number>,
    completenessPct: m.completenessPct,
    updatedAt: m.updatedAt,
  };
}

export async function getReport(prisma: PrismaClient, diagnosisId: string): Promise<ReportView | null> {
  const d = await prisma.diagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      business: true,
      scans: { orderBy: { createdAt: "desc" }, take: 1 },
      businessModel: true,
    },
  });
  if (!d) return null;
  const scan = d.scans[0] ? toScanView(d.scans[0]) : null;
  const model = d.businessModel ? toModelView(d.businessModel) : null;
  return {
    id: d.id,
    status: d.status as DiagnosisStatus,
    createdAt: d.createdAt,
    business: {
      id: d.business.id, name: d.business.name, placeId: d.business.placeId,
      website: d.business.website, city: d.business.city,
    },
    scan,
    model,
    nextStep: model ? recommendNextStep(model) : null,
  };
}

export async function listRecentDiagnoses(prisma: PrismaClient, limit = 10): Promise<DiagnosisListItem[]> {
  const rows = await prisma.diagnosis.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    // select צר — הרשימה צריכה רק שם עסק וציון כולל, לא לגרור findings/narrative רב-KB לכל שורה
    include: {
      business: { select: { name: true } },
      scans: { orderBy: { createdAt: "desc" }, take: 1, select: { scores: true } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    status: d.status as DiagnosisStatus,
    createdAt: d.createdAt,
    businessName: d.business.name,
    overall: ((d.scans[0]?.scores ?? null) as ScoreReport | null)?.overall ?? null,
  }));
}
