# תוכנית אבן דרך 2ב — מסכים 1–3 (כניסה, סריקה חיה, דוח)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** אפליקציית Next.js (באותו ריפו) עם שלושת המסכים הראשונים של המשפך — כניסה, סריקה חיה משודרת, ודוח מלא — מעל הצנרת והמנועים של 2א, אחרי סגירת חמש דרישות המוכנות משער 2א.

**Architecture:** חבילה אחת (לא monorepo): Next.js App Router נכנס ל-`src/app` לצד `src/pipeline` ו-`src/server` הקיימים; ה-RSC וה-route handlers מייבאים ישירות את שכבת השרת. לב השינוי: חילוץ האורקסטרציה של האבחון מ-`cli-diagnose.ts` למודול שרת משותף `runDiagnosis` שפולט אירועי התקדמות — ה-CLI והמסך החי צורכים את אותם אירועים. הסריקה החיה משודרת כ-NDJSON על תגובת POST (לא SSE/EventSource — EventSource תומך רק ב-GET); ניתוק לקוח באמצע לא עוצר את הסריקה בשרת — עקרון "הכול נשמר" (אפיון 3.1).

**Tech Stack:** Next.js 15 (App Router, RSC) + React 19 + Tailwind CSS 4, TypeScript strict, Prisma 6 (נעול — לא לשדרג ל-7), Supabase Frankfurt, vitest (אופליין — אף בדיקה לא נוגעת ב-DB אמיתי או ב-API חי).

---

## מיפוי לדרישות המוכנות משער 2א (docs/milestone-2a-gate.md, סעיף "מוכנות ל-2ב")

| דרישה | משימה |
|---|---|
| 1. צד הקריאה של שכבת השמירה (getters + דה-סריאליזציה + Decimal→number) | משימה 2 |
| 2. Transaction Pooler | **מחוץ לתכולה** — שינוי קונפיג בלבד בזמן deploy ל-Vercel; מקומית החיבור הישיר (5432) תקין |
| 3. זהות עסק אטומית (מפתח מנורמל ייחודי לאתר) | משימה 3 |
| 4. חילוץ שכבת התצוגה מה-CLI + איחוד parseArgs | משימה 4 |
| 5. שמירת מקור הנרטיב (usedFallback) ועלות LLM אמיתית | משימה 1 |

**מחוץ לתכולה (בכוונה):** deploy ל-Vercel; מסך 4 (ראיון — אבן דרך 3); מסך 5 (Roadmap — אבן דרך 4); Auth (שימוש פנימי בלבד — שני המייסדים, localhost); onDelete policies (נשאר RESTRICT); רענון הקטלוג ממחקר המחירים (מסלול נפרד שרץ במקביל).

**פתוח לטנטי (מסקירת משימה 1, לטיפול כשייבחר מודל ייצור):** `Scan.llmCost` הוא `Decimal(10, 4)` — עלויות תת-סנטיות יתעגלו (0.00375 → 0.0038; מתחת ל-0.00005 → 0). עלות-לאבחון היא KPI (אפיון 9.6) — כשמדליקים תמחור אמיתי, להרחיב את הסקייל (למשל Decimal(12, 6)) במיגרציה.

**פתוח לטנטי (מסקירת משימה 3, רלוונטי רק לסביבה טרייה):** ה-backfill במיגרציית website_key משתמש ברג'קסים תלויי-רישיות — סוטה מ-websiteKeyOf על קלטים אקזוטיים ("HTTPS://..." לא יוסר). כל הנתונים הריאליים מנורמלים זהה (אומת חי), והמיגרציה שהוחלה לא תיערך לעולם; אם המיגרציות ירוצו אי-פעם על דאטהסט אחר עם שורות כאלה — להוסיף מיגרציית המשך עם דגל 'i' ברג'קסים.

**כללי עבודה מחייבים (מ-2א):**
- כל משימה: בדיקות אופליין בלבד; `npm test` + `npm run typecheck` ירוקים לפני commit.
- אם `prisma migrate` מבקש reset/drop — **לעצור מיד** ולהסלים, לא לאשר.
- אסור לכתוב תווי כיווניות (U+200E/U+200F/U+202A-E/U+2066-9) בשום קובץ.
- אין טקסט ביקורות גולמי ואין שמות כותבים בשום פלט או עמוד.
- commit אחרי כל משימה, עם `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### משימה 1: שמירת פרובננס הנרטיב ועלות LLM אמיתית (דרישה 5) ✅

> **As-built (7f43746 + 801f4ee + 496ac22):** בוצע כמתוכנן, ועוד שני שיפורים מסקירות: (1) סוקר הספק הריץ מבחן מוטציה וגילה שסכום הטוקנים (סריקה+נרטיב) לא נצפה מבחוץ כשהתמחור 0 — נוסף פרמטר `pricing` אופציונלי רביעי ל-`toScanRow` ובדיקה עם תמחור מוזרק שהורגת את המוטציה (אומת: 7/8 מוטציות מתות). (2) סוקר האיכות: נוספה בדיקת narrative-null עם תמחור מוזרק, `LlmPricing` interface + `Readonly`, ותיעוד אינווריאנט העמודה הדו-צורתית של scans.narrative לטובת משימה 2. פתוח לטנטי שנרשם למעלה: דיוק `Decimal(10,4)` של llm_cost.

עמודת `narrative` (Json) תשמור מעכשיו את `NarrativeResult` המלא — `{narrative, usage, usedFallback}` — במקום `ReportNarrative` בלבד. `llmCost` מפסיק להיות 0 קשיח ועובר דרך פונקציית תמחור אחת עם מחירי המודל (כרגע 0 — שכבת חינם; כש-A/B יבחר מודל ייצור משנים שני קבועים ותו לא). אין שינוי סכמה — העמודות כבר קיימות.

**Files:**
- Modify: `src/server/diagnosis-repo.ts` (ScanRow, toScanRow, ייבוא טיפוסים)
- Modify: `src/cli-diagnose.ts` (אתר קריאה אחד של toScanRow)
- Test: `tests/diagnosis-repo.test.ts`

- [ ] **Step 1: בדיקות נכשלות ל-toScanRow החדש**

להוסיף ל-`tests/diagnosis-repo.test.ts` (ולעדכן בדיקות toScanRow קיימות שמעבירות `ReportNarrative` — הן מעבירות מעכשיו `NarrativeResult`):

```ts
import { toScanRow, llmCostUsd } from "../src/server/diagnosis-repo";
import type { NarrativeResult } from "../src/pipeline/report/narrative";

const narrativeResult: NarrativeResult = {
  narrative: { headline: "כותרת", summary: "סיכום", gapExplanations: [] },
  usage: { inputTokens: 900, outputTokens: 500 },
  usedFallback: false,
};

describe("toScanRow — פרובננס נרטיב", () => {
  it("שומר את NarrativeResult המלא כולל usedFallback ו-usage", () => {
    const row = toScanRow(findings, score, narrativeResult); // findings/score — פיקסצ'רים קיימים בקובץ
    expect(row.narrative).toEqual(narrativeResult);
    expect(row.narrative?.usedFallback).toBe(false);
    expect(row.narrative?.usage.outputTokens).toBe(500);
  });

  it("narrative null נשאר null (סריקה בלי נרטיב)", () => {
    expect(toScanRow(findings, score, null).narrative).toBeNull();
  });
});

describe("llmCostUsd", () => {
  it("שכבת החינם של Gemini — עלות 0", () => {
    expect(llmCostUsd({ inputTokens: 150_000, outputTokens: 15_000 })).toBe(0);
  });

  it("מחשב לפי מחיר למיליון טוקנים כשמזריקים תמחור", () => {
    // 100K in ב-$1/M + 10K out ב-$5/M = 0.1 + 0.05 = 0.15
    expect(llmCostUsd(
      { inputTokens: 100_000, outputTokens: 10_000 },
      { usdPerMInput: 1, usdPerMOutput: 5 },
    )).toBeCloseTo(0.15, 10);
  });

  it("toScanRow מסכם טוקני סריקה + טוקני נרטיב לעלות (0 בשכבת חינם, אבל הסכום נבדק דרך ההזרקה)", () => {
    // meta של הפיקסצ'ר: llmInputTokens/llmOutputTokens — העלות מחושבת על הסכום עם הנרטיב
    const row = toScanRow(findings, score, narrativeResult);
    expect(row.llmCost).toBe(0); // קבועי שכבת החינם
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/diagnosis-repo.test.ts`
Expected: FAIL — `llmCostUsd` לא קיים; טיפוס narrative לא תואם.

- [ ] **Step 3: מימוש ב-diagnosis-repo.ts**

```ts
import type { NarrativeResult } from "../pipeline/report/narrative";
import type { LlmUsage } from "../pipeline/llm/client";

// תמחור LLM: שכבת החינם של Gemini = 0. כשייבחר מודל ייצור (אפיון 9.3) מעדכנים את שני
// הקבועים כאן — llm_cost יתחיל להיצבר אמת בלי לגעת בשום קוד אחר. עלות-לאבחון היא KPI (אפיון 9.6)
export const LLM_PRICING = { usdPerMInput: 0, usdPerMOutput: 0 };

export function llmCostUsd(usage: LlmUsage, pricing = LLM_PRICING): number {
  return (usage.inputTokens * pricing.usdPerMInput + usage.outputTokens * pricing.usdPerMOutput) / 1_000_000;
}

export interface ScanRow {
  findings: ScanFindings;
  scores: ScoreReport | null;
  narrative: NarrativeResult | null; // כולל usage + usedFallback — פרובננס הנרטיב (שער 2א, דרישה 5)
  llmCost: number;
  apiCost: number;
  durationMs: number;
}

export function toScanRow(
  findings: ScanFindings,
  scores: ScoreReport | null,
  narrative: NarrativeResult | null,
): ScanRow {
  const usage: LlmUsage = {
    inputTokens: findings.meta.llmInputTokens + (narrative?.usage.inputTokens ?? 0),
    outputTokens: findings.meta.llmOutputTokens + (narrative?.usage.outputTokens ?? 0),
  };
  return {
    findings,
    scores,
    narrative,
    llmCost: llmCostUsd(usage),
    apiCost: findings.meta.estCostUsd,
    durationMs: findings.meta.durationMs,
  };
}
```

הייבוא של `ReportNarrative` ב-diagnosis-repo.ts מוחלף ב-`NarrativeResult`. `saveScanResult` לא משתנה (העמודה Json — מקבלת את האובייקט המורחב כמו שהוא).

ב-`src/cli-diagnose.ts` שורת השמירה משתנה מ:
```ts
await saveScanResult(prisma, created.diagnosisId, toScanRow(scan, score, narrative.narrative), model);
```
ל:
```ts
await saveScanResult(prisma, created.diagnosisId, toScanRow(scan, score, narrative), model);
```

- [ ] **Step 4: הרצה ירוקה**

Run: `npx vitest run tests/diagnosis-repo.test.ts` ואז `npm test` + `npm run typecheck`
Expected: PASS הכול.

- [ ] **Step 5: Commit**

```bash
git add src/server/diagnosis-repo.ts src/cli-diagnose.ts tests/diagnosis-repo.test.ts
git commit -m "feat(2b-1): persist narrative provenance (usedFallback+usage) and real llmCost seam"
```

---

### משימה 2: צד הקריאה של שכבת השמירה (דרישה 1) ✅

> **As-built (e9969d0 + 4939192):** בוצע כמתוכנן. תוספות מהסקירות: guard לעטיפת נרטיב פגומה (narrative מקונן null/לא-אובייקט → תצוגת null במקום TypeError ברינדור); listRecentDiagnoses עבר ל-select מצומצם (business.name + scores בלבד — בלי לגרור findings/narrative של קילובייטים לשורת רשימה); ModelView כטיפוס נקוב; בדיקות ל"עטיפה בלי פרובננס = null" (הורג מוטנטים של ?? false/undefined — מלכודת ה-RSC), ל-guard של meta בנפרד מ-business, ול-take: limit דרך vi.fn (המוסכמה של קובצי הבדיקות האחים). 12 בדיקות במודול, 187 סה"כ.

מודול חדש `src/server/diagnosis-read.ts`: getters טיפוסיים ל-UI — `getReport` (אבחון + עסק + הסריקה האחרונה + מודל העסק) ו-`listRecentDiagnoses` (רשימת "המשך מאיפה שהפסקת" למסך 1). דה-סריאליזציה מ-Json לטיפוסי הדומיין עם בדיקות צורה שנכשלות בקול, המרת Decimal→number בגבול ה-repo (Decimal לא עובר גבול RSC), ונרמול שורות narrative ישנות (מלפני משימה 1) שאין להן פרובננס.

**Files:**
- Create: `src/server/diagnosis-read.ts`
- Test: `tests/diagnosis-read.test.ts`

- [ ] **Step 1: בדיקות נכשלות**

`tests/diagnosis-read.test.ts` (fake prisma — אף נגיעה ב-DB):

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { getReport, listRecentDiagnoses } from "../src/server/diagnosis-read";
import type { ScanFindings } from "../src/pipeline/types";

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק בדיקה", rating: 4.4, reviewCount: 8 },
  partial: ["no_website"],
  meta: { startedAt: "2026-08-13T00:00:00Z", durationMs: 2700, placesCalls: 2, llmInputTokens: 900, llmOutputTokens: 500, estCostUsd: 0.06 },
};
const scores = { overall: 77, dimensions: [], topGaps: [], topStrengths: [] };
const model = {
  data: { profile: { name: "עסק בדיקה" } },
  fieldSources: { profile: ["scan"] },
  credits: { profile: 0.5, channels: 0, lead_flow: 0, scheduling: 0, service: 0, billing: 0, retention: 0, tools: 0, pains: 0, manual_tasks: 0 },
  completenessPct: 15,
};

const businessRow = { id: "b1", name: "עסק בדיקה", placeId: "p1", websiteKey: null, website: null, city: null, createdAt: new Date("2026-08-13") };

function fakeDb(diagnosisRow: unknown, listRows: unknown[] = []) {
  return {
    diagnosis: {
      findUnique: async () => diagnosisRow,
      findMany: async () => listRows,
    },
  } as never;
}

function diagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1", businessId: "b1", status: "report_ready",
    createdAt: new Date("2026-08-13"), updatedAt: new Date("2026-08-13"),
    business: businessRow,
    scans: [{
      id: "s1", diagnosisId: "d1", findings, scores,
      narrative: { narrative: { headline: "כותרת", summary: "סיכום", gapExplanations: [] }, usage: { inputTokens: 1, outputTokens: 2 }, usedFallback: false },
      llmCost: new Prisma.Decimal("0"), apiCost: new Prisma.Decimal("0.06"), durationMs: 2700, createdAt: new Date("2026-08-13"),
    }],
    businessModel: { id: "m1", diagnosisId: "d1", ...model, updatedAt: new Date("2026-08-13") },
    ...overrides,
  };
}

describe("getReport", () => {
  it("מחזיר null כשהאבחון לא קיים", async () => {
    expect(await getReport(fakeDb(null), "אין")).toBeNull();
  });

  it("ממיר Decimal למספר וקורא findings/scores לטיפוסי הדומיין", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.scan?.apiCost).toBe(0.06);
    expect(typeof r?.scan?.apiCost).toBe("number");
    expect(r?.scan?.findings.business.name).toBe("עסק בדיקה");
    expect(r?.scan?.scores?.overall).toBe(77);
  });

  it("נרטיב חדש: usedFallback ו-usage נשמרים בתצוגה", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.scan?.narrative?.usedFallback).toBe(false);
    expect(r?.scan?.narrative?.usage?.outputTokens).toBe(2);
  });

  it("נרטיב ישן (ReportNarrative ישיר, בלי מעטפת) — פרובננס null, הנרטיב עצמו נקרא", async () => {
    const row = diagRow();
    (row.scans[0] as { narrative: unknown }).narrative = { headline: "ישן", summary: "ס", gapExplanations: [] };
    const r = await getReport(fakeDb(row), "d1");
    expect(r?.scan?.narrative?.narrative.headline).toBe("ישן");
    expect(r?.scan?.narrative?.usedFallback).toBeNull();
    expect(r?.scan?.narrative?.usage).toBeNull();
  });

  it("מודל העסק משוחזר כולל credits, ו-nextStep מחושב ממנו", async () => {
    const r = await getReport(fakeDb(diagRow()), "d1");
    expect(r?.model?.completenessPct).toBe(15);
    expect(r?.nextStep?.action).toBe("free_text"); // 15% <= סף free_text
  });

  it("אבחון בלי סריקה (created) — scan null, לא זריקה", async () => {
    const r = await getReport(fakeDb(diagRow({ scans: [], businessModel: null })), "d1");
    expect(r?.scan).toBeNull();
    expect(r?.model).toBeNull();
    expect(r?.nextStep).toBeNull();
    expect(r?.status).toBe("created");
  });

  it("findings פגום (בלי business) — זריקה בקול, לא המשך שקט", async () => {
    const row = diagRow();
    (row.scans[0] as { findings: unknown }).findings = { garbage: true };
    await expect(getReport(fakeDb(row), "d1")).rejects.toThrow(/פגומ/);
  });
});

describe("listRecentDiagnoses", () => {
  it("ממפה לשורות רשימה עם שם עסק, סטטוס וציון כולל מהסריקה האחרונה", async () => {
    const rows = await listRecentDiagnoses(fakeDb(null, [diagRow()]), 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "d1", status: "report_ready", businessName: "עסק בדיקה", overall: 77 });
  });

  it("אבחון בלי סריקה — overall null", async () => {
    const rows = await listRecentDiagnoses(fakeDb(null, [diagRow({ scans: [] })]), 8);
    expect(rows[0].overall).toBeNull();
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/diagnosis-read.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **Step 3: מימוש `src/server/diagnosis-read.ts`**

```ts
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

export interface ReportView {
  id: string;
  status: DiagnosisStatus;
  createdAt: Date;
  business: ReportBusinessView;
  scan: ReportScanView | null; // הסריקה האחרונה; null כשהאבחון עוד לא נסרק
  model: (BusinessModel & { updatedAt: Date }) | null;
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
  if (json == null || typeof json !== "object"
    || !Object.hasOwn(json, "business") || !Object.hasOwn(json, "meta")) {
    throw new Error("שורת scan פגומה: findings בלי business/meta");
  }
  return json as ScanFindings;
}

function toNarrativeView(json: unknown): NarrativeView | null {
  if (json == null || typeof json !== "object") return null;
  if (Object.hasOwn(json, "narrative")) {
    // צורה חדשה (משימה 1): NarrativeResult מלא
    const r = json as { narrative: ReportNarrative; usedFallback?: boolean; usage?: LlmUsage };
    return { narrative: r.narrative, usedFallback: r.usedFallback ?? null, usage: r.usage ?? null };
  }
  // צורה ישנה: ReportNarrative ישיר — בלי פרובננס
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

function toModelView(m: ModelRowDb): BusinessModel & { updatedAt: Date } {
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
    include: { business: true, scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return rows.map((d) => ({
    id: d.id,
    status: d.status as DiagnosisStatus,
    createdAt: d.createdAt,
    businessName: d.business.name,
    overall: ((d.scans[0]?.scores ?? null) as ScoreReport | null)?.overall ?? null,
  }));
}
```

הערה למממש: הפיקסצ'ר בבדיקות כולל `websiteKey` בשורת העסק — השדה נוסף לסכמה רק במשימה 3. עד אז השדה המיותר בפיקסצ'ר לא מפריע (ה-fake לא עובר דרך Prisma). אם ה-typecheck מתלונן — להסיר את `websiteKey` מהפיקסצ'ר ולהחזירו במשימה 3.

- [ ] **Step 4: הרצה ירוקה**

Run: `npx vitest run tests/diagnosis-read.test.ts` ואז `npm test` + `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/diagnosis-read.ts tests/diagnosis-read.test.ts
git commit -m "feat(2b-2): typed read-side repo - getReport/listRecentDiagnoses with Json+Decimal deserialization"
```

---

### משימה 3: זהות עסק אטומית לאתר-בלבד (דרישה 3) ✅

> **As-built (0fd50ae + d1c8f7f):** בוצע, עם סטייה טכנית אחת: `migrate dev --create-only` דורש TTY ולא רץ בסביבה לא-אינטראקטיבית — ה-SQL יוצר ב-`migrate diff` אופליין, הועבר ידנית לתיקיית מיגרציה, והוחל ב-`migrate deploy` (שלעולם לא מציע reset). אומת: status עדכני, diff חי מול הסכמה = ריק (אפס דריפט), backfill נכון על שורת lavangroup. תיקונים מסקירת האיכות: `name` הוצא מ-update (שם שייך ליצירה — סריקה חוזרת לא משכתבת דוחות ישנים); `website` נשמר כ-origin יציב ולא href; בדיקה מצמידה `create.websiteKey === where.websiteKey` (תנאי המסלול האטומי של Prisma); `normalizeSiteUrl` הועבר למודול עלה `src/pipeline/site-url.ts` (בלי גרירת cheerio לראוטים של Next) עם re-export תאימות מ-scan-website.

`findFirst+create` במסלול `--url` אינו אטומי ואין unique על website — שתי ריצות מקבילות יוצרות שני עסקים, וכתיבים שונים של אותו אתר ("https://www.x.co.il/" מול "x.co.il") מתפצלים לשורות שונות. הפתרון: עמודת `website_key` ייחודית (host מנורמל: lowercase, בלי www) + upsert עליה.

**Files:**
- Create: `src/server/website-key.ts`
- Modify: `prisma/schema.prisma` (שדה websiteKey ב-Business)
- Create: `prisma/migrations/<timestamp>_business_website_key/migration.sql` (דרך `--create-only` + עריכה)
- Modify: `src/server/diagnosis-repo.ts` (מסלול website ב-createDiagnosisForBusiness)
- Test: `tests/website-key.test.ts`, עדכון `tests/diagnosis-repo.test.ts`

- [ ] **Step 1: בדיקות נכשלות ל-websiteKeyOf**

`tests/website-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { websiteKeyOf } from "../src/server/website-key";

describe("websiteKeyOf", () => {
  it("מנרמל סכמה, www, רישיות וסלאש סופי לאותו מפתח", () => {
    for (const input of [
      "https://www.lavangroup.co.il/",
      "http://LavanGroup.co.il",
      "lavangroup.co.il",
      "https://lavangroup.co.il/about",
    ]) {
      expect(websiteKeyOf(input)).toBe("lavangroup.co.il");
    }
  });

  it("path נזרק בכוונה — עסק = דומיין ב-MVP", () => {
    expect(websiteKeyOf("https://x.co.il/deep/page?q=1")).toBe("x.co.il");
  });

  it("תת-דומיין שונה = מפתח שונה", () => {
    expect(websiteKeyOf("https://shop.x.co.il")).toBe("shop.x.co.il");
  });

  it("סכמה לא נתמכת נדחית (מהנרמול המשותף)", () => {
    expect(() => websiteKeyOf("mailto:a@b.co.il")).toThrow();
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/website-key.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **Step 3: מימוש `src/server/website-key.ts`**

```ts
import { normalizeSiteUrl } from "../pipeline/scan-website";

// מפתח הזהות של עסק אתר-בלבד (שער 2א, דרישה 3): host מנורמל — lowercase, בלי www.
// ה-path נזרק בכוונה: ב-MVP עסק = דומיין (שני עמודים באותו דומיין הם אותו עסק);
// תת-דומיינים שונים נשארים מפתחות שונים (חנות מול אתר תדמית יכולים להיות עסקים שונים).
export function websiteKeyOf(input: string): string {
  return normalizeSiteUrl(input).hostname.toLowerCase().replace(/^www\./, "");
}
```

Run: `npx vitest run tests/website-key.test.ts` — Expected: PASS.

- [ ] **Step 4: סכמה + מיגרציה עם backfill**

ב-`prisma/schema.prisma`, מודל Business:

```prisma
model Business {
  id         String      @id @default(uuid()) @db.Uuid
  name       String
  placeId    String?     @unique @map("place_id")
  // זהות עסק אתר-בלבד: host מנורמל (websiteKeyOf) — upsert אטומי במקום findFirst+create
  websiteKey String?     @unique @map("website_key")
  website    String?
  city       String?
  createdAt  DateTime    @default(now()) @map("created_at")
  diagnoses  Diagnosis[]

  @@map("businesses")
}
```

יצירת המיגרציה בלי להריץ אותה:

Run: `npx prisma migrate dev --name business_website_key --create-only`
Expected: נוצרה תיקיית מיגרציה חדשה עם ALTER TABLE + CREATE UNIQUE INDEX. **אם Prisma מבקש reset — לעצור ולהסלים.**

לערוך את קובץ המיגרציה שנוצר ולהוסיף backfill **בין** ה-ALTER ל-CREATE INDEX (שורת lavangroup הקיימת חייבת מפתח לפני שה-unique נאכף, אחרת הריצה הבאה תיצור כפיל):

```sql
-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "website_key" TEXT;

-- Backfill: עסקים אתר-בלבד קיימים (יש website, אין place_id) מקבלים מפתח מנורמל —
-- אותו נרמול כמו websiteKeyOf: הסרת סכמה, חיתוך ב-'/', הסרת www, lowercase
UPDATE "businesses"
SET "website_key" = lower(regexp_replace(split_part(regexp_replace("website", '^https?://', ''), '/', 1), '^www\.', ''))
WHERE "website" IS NOT NULL AND "place_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_website_key_key" ON "businesses"("website_key");
```

Run: `npx prisma migrate dev`
Expected: המיגרציה חלה על Supabase בלי reset. לוודא: `npx prisma migrate status` — עדכני.

- [ ] **Step 5: בדיקה נכשלת ל-upsert במסלול website**

לעדכן ב-`tests/diagnosis-repo.test.ts` את בדיקות מסלול ה-website של `createDiagnosisForBusiness` (ה-fake הקיים בקובץ מחליף findFirst/create ב-upsert):

```ts
it("מסלול website: upsert אטומי על websiteKey מנורמל — כתיבים שונים מתלכדים לשורה אחת", async () => {
  const upsertCalls: unknown[] = [];
  const db = {
    business: {
      upsert: async (args: { where: { websiteKey?: string } }) => {
        upsertCalls.push(args);
        return { id: "b1" };
      },
    },
    diagnosis: { create: async () => ({ id: "d1" }) },
  } as never;
  await createDiagnosisForBusiness(db, { name: "lavangroup.co.il", website: "https://www.LavanGroup.co.il/" });
  expect(upsertCalls).toHaveLength(1);
  expect((upsertCalls[0] as { where: { websiteKey: string } }).where.websiteKey).toBe("lavangroup.co.il");
});

it("בלי placeId ובלי website — עדיין נזרקת שגיאת מזהה", async () => {
  await expect(createDiagnosisForBusiness({} as never, { name: "x" })).rejects.toThrow(/placeId או website/);
});
```

Run: `npx vitest run tests/diagnosis-repo.test.ts` — Expected: FAIL (עדיין findFirst).

- [ ] **Step 6: מימוש ב-diagnosis-repo.ts**

מחליפים את בלוק ה-`else if (input.website)` ב-`createDiagnosisForBusiness`:

```ts
  } else if (input.website) {
    // מסלול אתר-בלבד (no_gbp): upsert אטומי על מפתח מנורמל — כתיבים שונים של אותו אתר
    // מתלכדים לשורה אחת, ושתי ריצות מקבילות לא יוצרות כפיל (שער 2א, דרישה 3)
    const key = websiteKeyOf(input.website);
    const business = await prisma.business.upsert({
      where: { websiteKey: key },
      update: { name: input.name, website: input.website, city: input.city },
      create: { name: input.name, websiteKey: key, website: input.website, city: input.city },
    });
    businessId = business.id;
  } else {
```

ולהוסיף למעלה: `import { websiteKeyOf } from "./website-key";`

הערה: מסלול ה-placeId לא נוגע ב-websiteKey בכוונה — איחוד זהויות בין עסק שנסרק פעם ב---url ופעם דרך Places הוא בעיה נפרדת (אבן דרך 3+), לא פותרים אותה כאן.

- [ ] **Step 7: הרצה ירוקה + אימות DB חי קצר**

Run: `npm test` + `npm run typecheck` — Expected: PASS.

אימות backfill (סקריפט tsx חד-פעמי, נמחק אחרי):
```ts
// scripts/tmp-check-key.ts — להריץ עם npx tsx, למחוק אחרי
import { prisma } from "../src/server/db";
const rows = await prisma.business.findMany({ select: { name: true, websiteKey: true, placeId: true } });
console.log(rows);
await prisma.$disconnect();
```
Expected: שורת lavangroup עם `websiteKey: "lavangroup.co.il"`; עסקי Places עם `websiteKey: null`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/website-key.ts src/server/diagnosis-repo.ts tests/website-key.test.ts tests/diagnosis-repo.test.ts
git commit -m "feat(2b-3): atomic website-only business identity - unique normalized website_key + backfill"
```

---

### משימה 4: חילוץ שכבת התצוגה מה-CLI + איחוד parseArgs (דרישה 4) ✅

> **As-built (7754e50 + bcac89a):** בוצע כמתוכנן — ההעברה הוכחה ברמת בייטים (diff ריק מול הקוד שנמחק). מסקירת האיכות: DATA_TAG נגזר עכשיו מ-DATA_STATUS_LABEL (עריכת תווית לא תפצל CLI/UI); הודעת --pick חסר-ערך נוסחה ניטרלית-לפקודה (הפרסר משותף ל-scan/diagnose); הוכרע שהקצה הטיפוסי-בלבד pipeline→server (DiagnosisStatus) מקובל ל-MVP — server/status.ts הוא עלה בלי תלויות, והתקדים לתיקון (מודול עלה + re-export) קיים אם יופיע אי-פעם import ערכי.

`formatDiagnosisSummary` ו-`DATA_TAG` יושבים היום בקובץ שמייבא prisma/fs ומריץ main — ה-UI לא יכול לייבא ממנו. מחלצים למודול תצוגה טהור `src/pipeline/report/presenter.ts`, ומוסיפים בו את מילוני התצוגה שהמסכים יצטרכו (תוויות סטטוס, תוויות דגלים, טון ציון). את `parseArgs` מאחדים ב-`cli-shared.ts` — שני ה-CLI משתמשים באותו פרסר.

**Files:**
- Create: `src/pipeline/report/presenter.ts`
- Modify: `src/cli-diagnose.ts` (מסירים formatDiagnosisSummary/DATA_TAG/parseArgs — מייבאים)
- Modify: `src/cli-shared.ts` (parseArgs עובר לכאן)
- Modify: `src/cli.ts` (משתמש ב-parseArgs המשותף; דוחה --url)
- Test: `tests/cli-format.test.ts`, `tests/cli-diagnose-args.test.ts` (עדכון ייבואים + בדיקות חדשות)

- [ ] **Step 1: בדיקות — עדכון ייבואים ובדיקות חדשות**

ב-`tests/cli-format.test.ts`: לשנות את הייבוא ל-`import { formatDiagnosisSummary } from "../src/pipeline/report/presenter";` (התוכן נשאר — ההתנהגות לא משתנה). להוסיף:

```ts
import { DATA_STATUS_LABEL, DIAGNOSIS_STATUS_LABEL, PARTIAL_FLAG_LABEL, scoreTone } from "../src/pipeline/report/presenter";

describe("מילוני תצוגה", () => {
  it("תווית לכל סטטוס אבחון", () => {
    for (const s of ["created", "scanning", "scanned", "report_ready", "interviewing", "roadmap_ready"] as const) {
      expect(DIAGNOSIS_STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it("תווית לכל דגל partial", () => {
    for (const f of ["no_website", "few_reviews", "no_review_text", "crawl_failed", "pagespeed_failed", "review_analysis_failed", "js_rendered", "no_gbp"] as const) {
      expect(PARTIAL_FLAG_LABEL[f]).toBeTruthy();
    }
  });

  it("scoreTone: סף 75 ירוק, 50 בינוני, מתחת אדום, null לא ידוע", () => {
    expect(scoreTone(75)).toBe("good");
    expect(scoreTone(74)).toBe("mid");
    expect(scoreTone(50)).toBe("mid");
    expect(scoreTone(49)).toBe("low");
    expect(scoreTone(null)).toBe("unknown");
  });

  it("DATA_STATUS_LABEL תואם לתגי ה-CLI הקיימים", () => {
    expect(DATA_STATUS_LABEL.partial).toBe("מידע חלקי");
    expect(DATA_STATUS_LABEL.none).toBe("אין מידע");
  });
});
```

ב-`tests/cli-diagnose-args.test.ts`: ייבוא מ-`../src/cli-shared`; כל הבדיקות הקיימות נשארות. להוסיף:

```ts
it("cli.ts (scan) משתמש באותו פרסר — --url מתקבל כשדה ומודחה על ידי scan", () => {
  const parsed = parseArgs(["מאפייה", "--url", "https://x.co.il"]);
  expect(parsed.url).toBe("https://x.co.il"); // הפרסר מזהה; ההחלטה לדחות היא של scan
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/cli-format.test.ts tests/cli-diagnose-args.test.ts`
Expected: FAIL — presenter לא קיים, parseArgs לא ב-cli-shared.

- [ ] **Step 3: מימוש**

`src/pipeline/report/presenter.ts` — מודול תצוגה טהור (בלי prisma, בלי fs, בלי fetch):

```ts
import type { ScoreReport, DataStatus } from "../score/types";
import type { PartialFlag } from "../types";
import type { BusinessModel, NextStepRecommendation } from "../model/business-model";
import type { DiagnosisStatus } from "../../server/status";

// שכבת תצוגה משותפת ל-CLI ולמסכים (שער 2א, דרישה 4) — טהורה, נבדקת אופליין

export const DATA_TAG: Record<string, string> = { partial: " (מידע חלקי)", none: " (אין מידע)" };

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  full: "מידע מלא",
  partial: "מידע חלקי",
  none: "אין מידע",
};

export const DIAGNOSIS_STATUS_LABEL: Record<DiagnosisStatus, string> = {
  created: "נוצר — טרם נסרק",
  scanning: "בסריקה",
  scanned: "נסרק — מחשבים דוח",
  report_ready: "דוח מוכן",
  interviewing: "בראיון",
  roadmap_ready: "Roadmap מוכן",
};

export const PARTIAL_FLAG_LABEL: Record<PartialFlag, string> = {
  no_website: "אין אתר לעסק",
  few_reviews: "מעט ביקורות",
  no_review_text: "אין טקסט ביקורות לניתוח",
  crawl_failed: "קריאת האתר נכשלה",
  pagespeed_failed: "בדיקת המהירות נכשלה",
  review_analysis_failed: "ניתוח הביקורות נכשל",
  js_rendered: "האתר מרונדר ב-JavaScript — אותות חלקיים",
  no_gbp: "העסק לא נמצא בגוגל מפות",
};

export type ScoreToneKind = "good" | "mid" | "low" | "unknown";

export function scoreTone(score: number | null): ScoreToneKind {
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 50) return "mid";
  return "low";
}

export function formatDiagnosisSummary(
  score: ScoreReport,
  model: BusinessModel,
  nextStep: NextStepRecommendation,
): string {
  // הועתק אחד-לאחד מ-cli-diagnose.ts — אותה התנהגות, מקום ניטרלי
  const lines: string[] = [];
  lines.push(score.overall == null ? "ציון כולל: אין מספיק מידע" : `ציון כולל: ${score.overall}/100`);
  for (const d of score.dimensions) {
    const tag = DATA_TAG[d.dataStatus] ?? "";
    lines.push(`  ${d.label}: ${d.score ?? "—"}${tag}`);
  }
  if (score.topGaps.length > 0) {
    lines.push("פערים מובילים:");
    for (const g of score.topGaps) lines.push(`  ✗ ${g.text}`);
  } else if (score.overall != null) {
    lines.push("לא נמצאו פערים מהותיים בסריקה — בסיס דיגיטלי חזק.");
  }
  if (score.topStrengths.length > 0) {
    lines.push("מה עובד טוב:");
    for (const s of score.topStrengths) lines.push(`  ✓ ${s.text}`);
  }
  lines.push(`שלמות האבחון: ${model.completenessPct}% · הצעד הבא: ${nextStep.reason}`);
  return lines.join("\n");
}
```

(ההערות המקוריות ליד הענף של "בסיס דיגיטלי חזק" ב-cli-diagnose עוברות יחד עם הקוד.)

`src/cli-shared.ts` — להוסיף את parseArgs (מועבר אחד-לאחד מ-cli-diagnose.ts כולל ההערות; אותו קוד בדיוק, כולל ParsedArgs):

```ts
export interface ParsedArgs {
  query: string;
  pick?: number;
  url?: string;
  error?: string; // הודעת שגיאה בעברית — הקוראים בודקים ויוצאים לפני כל קריאת API כשהיא מוגדרת
}

export function parseArgs(argv: string[]): ParsedArgs { /* הגוף המלא מ-cli-diagnose.ts, ללא שינוי */ }
```

`src/cli-diagnose.ts`: מסירים את DATA_TAG, formatDiagnosisSummary, ParsedArgs ו-parseArgs; מייבאים:
```ts
import { pickCandidate, parseArgs } from "./cli-shared";
import { formatDiagnosisSummary } from "./pipeline/report/presenter";
```
(שאר הקובץ ללא שינוי; ה-re-export לא נדרש — הבדיקות עודכנו לייבא מהמקורות החדשים.)

`src/cli.ts`: מחליפים את ה-parseArgs המקומי בשימוש במשותף:

```ts
import { pickCandidate, parseArgs } from "./cli-shared";

async function main() {
  const cliStart = Date.now();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.log(`❌ ${parsed.error}`);
    process.exit(1);
  }
  if (parsed.url) {
    console.log("--url נתמך רק ב-diagnose: npm run diagnose -- --url https://…");
    process.exit(1);
  }
  const { query, pick } = parsed;
  if (!query) {
    console.log('שימוש: npm run scan -- "שם העסק והעיר" [--pick N]');
    process.exit(1);
  }
  // ... ההמשך ללא שינוי
}
```
(הפונקציה המקומית parseArgs והבדיקה הידנית `!Number.isInteger(pick)` נמחקות — הפרסר המשותף כבר דוחה.)

- [ ] **Step 4: הרצה ירוקה**

Run: `npm test` + `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/report/presenter.ts src/cli-shared.ts src/cli.ts src/cli-diagnose.ts tests/cli-format.test.ts tests/cli-diagnose-args.test.ts
git commit -m "refactor(2b-4): extract pure presenter module + unify parseArgs across CLIs"
```

---

### משימה 5: חילוץ runDiagnosis מה-CLI + אירועי התקדמות ✅

> **As-built (56243ae + 776b5d0):** בוצע כמתוכנן (עם התאמות משימה 3: name=websiteKeyOf, website=origin), הצנרת לא נגעה, ה-CLI נשאר זהה בייט-בייט בפלט. עשן חי: אופטיקה בק 73/100 עם שורות התקדמות זורמות. סקירת האיכות תפסה באג קריטי-לעתיד לפני שפגש צרכן: emit לא-מוגן הפך זריקת onEvent (ניתוק דפדפן) לדגלי partial שקריים שנשמרים או ל-DiagnoseFailed שהורס אבחון מוצלח — נוסף guard בחוזה מתועד ("onEvent לעולם לא מפיל את האורקסטרציה"), detailOf הוצא מה-try, failDetail מדויק למפתחות פטאליים, אירועי "לעסק אין אתר" ל-crawl/pagespeed כשאין אתר (מסך 2 יסביר את הרשימה הקצרה), ו-4 בדיקות חדשות: צרכן-זורק, כשל-revert משמר שגיאה מקורית, done-אחרי-backfill (נצפה מתוך onEvent), ואירועי דילוג. 206 בדיקות. הערה למשימה 8: לצמצם את טיפוס DiagnoseRunner ל-Promise<{diagnosisId: string}>.

לב 2ב. האורקסטרציה (יצירה→scanning→סריקה→scanned→ציונים/מודל/נרטיב→שמירה→report_ready→backfill) עוברת מ-`cli-diagnose.ts` ל-`src/server/run-diagnosis.ts`, עם אירועי התקדמות למסך הסריקה החיה. את האירועים הפר-מקור משיגים **בלי לגעת בצנרת**: עוטפים את ה-deps המוזרקים של runScan/scanWebsiteOnly — כל dep פולט step/step_done סביב הקריאה. ה-CLI הופך לצרכן דק של אותם אירועים.

**Files:**
- Create: `src/server/diagnose-events.ts` (טיפוסים בלבד — בטוח לייבוא type-only מצד לקוח)
- Create: `src/server/run-diagnosis.ts`
- Modify: `src/cli-diagnose.ts` (main מתכווץ לצרכן)
- Test: `tests/run-diagnosis.test.ts`, `tests/fakes/fake-db.ts`

- [ ] **Step 1: טיפוסי האירועים — `src/server/diagnose-events.ts`**

```ts
// אירועי התקדמות של אבחון — מודול טיפוסים בלבד (בלי ייבוא קוד שרת):
// מיובא type-only גם מצד הלקוח של מסך הסריקה החיה
export type DiagnoseStepKey =
  | "details"    // פרטי העסק מגוגל
  | "crawl"      // קריאת האתר
  | "pagespeed"  // בדיקת מהירות
  | "reviews"    // ניתוח ביקורות
  | "score"      // חישוב ציונים ומודל עסק
  | "narrative"  // כתיבת הנרטיב
  | "save";      // שמירה

export type DiagnoseEvent =
  | { type: "created"; diagnosisId: string; businessName: string }
  | { type: "step"; key: DiagnoseStepKey; label: string }
  | { type: "step_done"; key: DiagnoseStepKey; ok: boolean; detail?: string }
  | { type: "done"; diagnosisId: string }
  | { type: "error"; message: string };
```

- [ ] **Step 2: בדיקות נכשלות — `tests/fakes/fake-db.ts` + `tests/run-diagnosis.test.ts`**

`tests/fakes/fake-db.ts` — fake prisma עם state, משרת את בדיקות ה-runner (אף נגיעה ב-DB אמיתי):

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeBizRow {
  id: string; name: string; placeId: string | null; websiteKey: string | null;
  website: string | null; city: string | null;
}

export function makeFakeDb() {
  const businesses: FakeBizRow[] = [];
  const diagnoses: { id: string; businessId: string; status: string }[] = [];
  const scans: any[] = [];
  const models: any[] = [];
  const transitions: string[] = []; // "from→to" לפי סדר — לב האסרטים על מכונת המצבים
  let nextId = 1;
  const genId = (p: string) => `${p}-${nextId++}`;

  const db = {
    business: {
      upsert: async ({ where, update, create }: any) => {
        const found = businesses.find(
          (b) => (where.placeId != null && b.placeId === where.placeId)
            || (where.websiteKey != null && b.websiteKey === where.websiteKey),
        );
        if (found) { Object.assign(found, update); return { ...found }; }
        const row: FakeBizRow = {
          id: genId("biz"), placeId: null, websiteKey: null, website: null, city: null, ...create,
        };
        businesses.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const b = businesses.find((x) => x.id === where.id);
        if (!b) throw new Error("business not found");
        Object.assign(b, data);
        return { ...b };
      },
    },
    diagnosis: {
      create: async ({ data }: any) => {
        const row = { id: genId("diag"), businessId: data.businessId, status: "created" };
        diagnoses.push(row);
        return { ...row };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const d = diagnoses.find((x) => x.id === where.id);
        if (!d) throw new Error("diagnosis not found");
        return { status: d.status };
      },
      updateMany: async ({ where, data }: any) => {
        const d = diagnoses.find((x) => x.id === where.id && x.status === where.status);
        if (!d) return { count: 0 };
        transitions.push(`${where.status}→${data.status}`);
        d.status = data.status;
        return { count: 1 };
      },
    },
    scan: { create: async ({ data }: any) => { scans.push(data); return { id: genId("scan"), ...data }; } },
    businessModelRow: {
      upsert: async ({ where, create }: any) => { models.push({ where, create }); return { id: genId("bm") }; },
    },
    $transaction: async (arr: Promise<unknown>[]) => Promise.all(arr),
  };

  return { db: db as any, businesses, diagnoses, scans, models, transitions };
}
```

`tests/run-diagnosis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runDiagnosis, DiagnoseFailed } from "../src/server/run-diagnosis";
import type { DiagnoseEvent } from "../src/server/diagnose-events";
import type { ScanDeps } from "../src/pipeline/scan";
import type { WebsiteOnlyDeps } from "../src/pipeline/scan-website";
import { makeFakeDb } from "./fakes/fake-db";

const happyScanDeps: ScanDeps = {
  details: async () => ({
    placeId: "p1", name: "עסק בדיקה", website: "https://x.co.il", phone: "03-1234567",
    rating: 4.4, reviewCount: 8,
    reviews: [{ rating: 5, text: "שירות" }],
  }),
  crawl: async () => ({
    pagesCrawled: 3, crawledUrls: ["https://x.co.il"], hasContactForm: true, hasWhatsappLink: false,
    hasPhoneLink: true, hasEmailLink: false, hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: true, platform: "wordpress",
  }),
  pagespeed: async () => ({ performanceScore: 60, lcpMs: 4000 }),
  analyzeReviews: async () => ({
    insights: { totalAnalyzed: 1, positiveThemes: [{ theme: "שירות אדיב", count: 1 }], problemThemes: [] },
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
};

// נרטיב מוזרק: מחזיר JSON תקין כדי לא להפעיל LLM חי; הבדיקות לא תלויות בפרטי ה-guard
const fakeComplete = async () => ({
  data: { headline: "כותרת", summary: "סיכום", gapExplanations: [] },
  usage: { inputTokens: 10, outputTokens: 10 },
});

function collect() {
  const events: DiagnoseEvent[] = [];
  return { events, onEvent: (e: DiagnoseEvent) => events.push(e) };
}

describe("runDiagnosis — מסלול Places", () => {
  it("מסיים ב-report_ready עם סדר מעברים מלא ופולט אירועים בסדר הנכון", async () => {
    const { db, transitions, scans, businesses } = makeFakeDb();
    const { events, onEvent } = collect();
    const outcome = await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק בדיקה" }, {
      onEvent, scanDeps: happyScanDeps, narrativeOptions: { complete: fakeComplete },
    });

    expect(transitions).toEqual(["created→scanning", "scanning→scanned", "scanned→report_ready"]);
    expect(outcome.score.overall).not.toBeNull();
    expect(outcome.diagnosisId).toBeTruthy();
    expect(scans).toHaveLength(1);
    // פרובננס הנרטיב נשמר (משימה 1)
    expect(scans[0].narrative).toHaveProperty("usedFallback");

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("created");
    expect(types[types.length - 1]).toBe("done");
    const stepKeys = events.filter((e) => e.type === "step").map((e) => (e as { key: string }).key);
    expect(stepKeys[0]).toBe("details");
    expect(stepKeys).toEqual(expect.arrayContaining(["crawl", "pagespeed", "reviews", "score", "narrative", "save"]));

    // backfill: האתר שהתגלה בסריקה נכתב לשורת העסק
    expect(businesses[0].website).toBe("https://x.co.il");
  });

  it("כישלון פרטי העסק — חזרה ל-created, השגיאה המקורית נזרקת, אין scan", async () => {
    const { db, transitions, scans } = makeFakeDb();
    const deps: ScanDeps = { ...happyScanDeps, details: async () => { throw new Error("Places נפל"); } };
    await expect(runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק" }, {
      scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    })).rejects.toThrow("Places נפל");
    expect(transitions).toEqual(["created→scanning", "scanning→created"]);
    expect(scans).toHaveLength(0);
  });

  it("dep בודד שנופל (crawl) לא מפיל אבחון — נגמר report_ready עם step_done ok:false", async () => {
    const { db, transitions } = makeFakeDb();
    const { events, onEvent } = collect();
    const deps: ScanDeps = { ...happyScanDeps, crawl: async () => { throw new Error("timeout"); } };
    await runDiagnosis(db, { kind: "places", placeId: "p1", name: "עסק" }, {
      onEvent, scanDeps: deps, narrativeOptions: { complete: fakeComplete },
    });
    expect(transitions[transitions.length - 1]).toBe("scanned→report_ready");
    const crawlDone = events.find((e) => e.type === "step_done" && e.key === "crawl");
    expect(crawlDone).toMatchObject({ ok: false });
  });
});

describe("runDiagnosis — מסלול URL", () => {
  const happyWebDeps: WebsiteOnlyDeps = {
    crawl: happyScanDeps.crawl,
    pagespeed: happyScanDeps.pagespeed,
  };

  it("מסיים ב-report_ready; העסק נוצר עם websiteKey", async () => {
    const { db, transitions, businesses } = makeFakeDb();
    await runDiagnosis(db, { kind: "url", url: "https://www.x.co.il/" }, {
      websiteDeps: happyWebDeps, narrativeOptions: { complete: fakeComplete },
    });
    expect(transitions).toEqual(["created→scanning", "scanning→scanned", "scanned→report_ready"]);
    expect(businesses[0].websiteKey).toBe("x.co.il");
  });

  it("כישלון כפול (crawl+PSI) — DiagnoseFailed, חזרה ל-created, אין scan", async () => {
    const { db, transitions, scans } = makeFakeDb();
    const deps: WebsiteOnlyDeps = {
      crawl: async () => { throw new Error("down"); },
      pagespeed: async () => { throw new Error("down"); },
    };
    await expect(runDiagnosis(db, { kind: "url", url: "https://x.co.il" }, {
      websiteDeps: deps, narrativeOptions: { complete: fakeComplete },
    })).rejects.toThrow(DiagnoseFailed);
    // הכישלון הכפול מזוהה בתוך ה-try, לפני המעבר ל-scanned — בדיוק כמו ב-CLI הנוכחי
    // (scanned→created אינו מעבר חוקי במכונת המצבים)
    expect(transitions).toEqual(["created→scanning", "scanning→created"]);
    expect(scans).toHaveLength(0);
  });

  it("url לא תקין — נזרק לפני כל כתיבה ל-DB", async () => {
    const { db, diagnoses } = makeFakeDb();
    await expect(runDiagnosis(db, { kind: "url", url: "mailto:x@y.co.il" }, {}))
      .rejects.toThrow();
    expect(diagnoses).toHaveLength(0);
  });
});
```

- [ ] **Step 3: להריץ ולוודא כישלון**

Run: `npx vitest run tests/run-diagnosis.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **Step 4: מימוש `src/server/run-diagnosis.ts`**

```ts
import type { PrismaClient } from "@prisma/client";
import { runScan, defaultDeps, type ScanDeps } from "../pipeline/scan";
import {
  scanWebsiteOnly, defaultWebsiteOnlyDeps, normalizeSiteUrl, type WebsiteOnlyDeps,
} from "../pipeline/scan-website";
import { scoreFindings } from "../pipeline/score/engine";
import { DIMENSIONS } from "../pipeline/score/dimensions";
import {
  deriveBusinessModel, recommendNextStep, type BusinessModel, type NextStepRecommendation,
} from "../pipeline/model/business-model";
import { generateNarrative, type NarrativeOptions, type NarrativeResult } from "../pipeline/report/narrative";
import type { ScanFindings } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import { createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow } from "./diagnosis-repo";
import type { DiagnoseEvent, DiagnoseStepKey } from "./diagnose-events";

// האורקסטרציה המלאה של אבחון — חולצה מ-cli-diagnose.ts כדי שה-CLI ומסך הסריקה החיה
// יריצו את אותו קוד בדיוק. אירועי ההתקדמות נפלטים בעטיפת ה-deps — הצנרת עצמה לא השתנתה.

export type DiagnoseTarget =
  | { kind: "places"; placeId: string; name: string; city?: string }
  | { kind: "url"; url: string };

export interface DiagnoseOutcome {
  diagnosisId: string;
  businessId: string;
  findings: ScanFindings;
  score: ScoreReport;
  model: BusinessModel;
  nextStep: NextStepRecommendation;
  narrative: NarrativeResult;
}

export interface RunDiagnosisOptions {
  onEvent?: (e: DiagnoseEvent) => void;
  scanDeps?: ScanDeps;           // הזרקה בבדיקות — ברירת מחדל: הצנרת החיה
  websiteDeps?: WebsiteOnlyDeps;
  narrativeOptions?: NarrativeOptions;
}

// הסריקה נכשלה כולה והאבחון הוחזר ל-created — הודעה עברית ידידותית למסך/CLI
export class DiagnoseFailed extends Error {}

type Emit = (e: DiagnoseEvent) => void;

async function step<T>(
  emit: Emit, key: DiagnoseStepKey, label: string,
  fn: () => Promise<T>, detailOf: (r: T) => string,
): Promise<T> {
  emit({ type: "step", key, label });
  try {
    const result = await fn();
    emit({ type: "step_done", key, ok: true, detail: detailOf(result) });
    return result;
  } catch (err) {
    // dep שנפל הופך בצנרת לדגל partial (חוץ מ-details שהוא פטאלי — runScan יפיל את הכול והאירוע error יסגור)
    emit({ type: "step_done", key, ok: false, detail: "לא הצליח — ממשיכים בלי המקור הזה" });
    throw err;
  }
}

function wrapScanDeps(base: ScanDeps, emit: Emit): ScanDeps {
  return {
    details: (placeId) => step(emit, "details", "מאתרים את פרטי העסק בגוגל", () => base.details(placeId),
      (d) => d.reviewCount != null ? `נמצאו ${d.reviewCount} ביקורות ודירוג ${d.rating ?? "ללא"}` : "פרטי העסק התקבלו"),
    crawl: (u) => step(emit, "crawl", "קוראים את האתר", () => base.crawl(u),
      (s) => `נסרקו ${s.pagesCrawled} עמודים`),
    pagespeed: (u) => step(emit, "pagespeed", "בודקים מהירות טעינה במובייל", () => base.pagespeed(u),
      (p) => p.performanceScore != null ? `ציון ביצועים ${p.performanceScore}/100` : "אין נתון ביצועים"),
    analyzeReviews: (r) => step(emit, "reviews", "מנתחים את הביקורות", () => base.analyzeReviews(r),
      (x) => x.insights.totalAnalyzed > 0 ? `נותחו ${x.insights.totalAnalyzed} ביקורות` : "אין טקסט ביקורות לניתוח"),
  };
}

function wrapWebsiteDeps(base: WebsiteOnlyDeps, emit: Emit): WebsiteOnlyDeps {
  return {
    crawl: (u) => step(emit, "crawl", "קוראים את האתר", () => base.crawl(u),
      (s) => `נסרקו ${s.pagesCrawled} עמודים`),
    pagespeed: (u) => step(emit, "pagespeed", "בודקים מהירות טעינה במובייל", () => base.pagespeed(u),
      (p) => p.performanceScore != null ? `ציון ביצועים ${p.performanceScore}/100` : "אין נתון ביצועים"),
  };
}

export async function runDiagnosis(
  prisma: PrismaClient,
  target: DiagnoseTarget,
  opts: RunDiagnosisOptions = {},
): Promise<DiagnoseOutcome> {
  const emit: Emit = opts.onEvent ?? (() => {});

  // נרמול URL לפני כל כתיבה ל-DB — כתובת פסולה נכשלת מוקדם ונקי
  const siteUrl = target.kind === "url" ? normalizeSiteUrl(target.url) : undefined;

  // שלב 1: יצירת עסק + אבחון (created)
  const created = await createDiagnosisForBusiness(prisma, siteUrl
    ? { name: siteUrl.hostname.replace(/^www\./, ""), website: siteUrl.href }
    : { name: (target as { name: string }).name, placeId: (target as { placeId: string }).placeId, city: (target as { city?: string }).city });
  const businessName = siteUrl ? siteUrl.hostname.replace(/^www\./, "") : (target as { name: string }).name;
  emit({ type: "created", diagnosisId: created.diagnosisId, businessName });

  // שלב 2: סריקה תחת scanning; כל כישלון מחזיר ל-created עם השגיאה המקורית
  await transitionDiagnosis(prisma, created.diagnosisId, "scanning");
  let findings: ScanFindings;
  try {
    findings = siteUrl
      ? await scanWebsiteOnly(siteUrl.href, wrapWebsiteDeps(opts.websiteDeps ?? defaultWebsiteOnlyDeps, emit))
      : await runScan((target as { placeId: string }).placeId,
          wrapScanDeps(opts.scanDeps ?? defaultDeps, emit), { priorPlacesCalls: 1 });

    // מסלול URL: כישלון כפול (גם crawl וגם PSI) = אין שום ממצא — נבדק לפני scanned
    if (siteUrl && findings.partial.includes("crawl_failed") && findings.partial.includes("pagespeed_failed")) {
      throw new DiagnoseFailed("שני המקורות נכשלו — אין ממצאים לאבחון");
    }
  } catch (err) {
    try {
      await transitionDiagnosis(prisma, created.diagnosisId, "created");
    } catch (revertErr) {
      // ההחזרה נכשלה (race) — לא בולעים, אבל השגיאה שממשיכה היא שגיאת הסריקה המקורית
      console.error("נכשל גם ניסיון החזרת הסטטוס ל-created:", revertErr instanceof Error ? revertErr.message : revertErr);
    }
    throw err;
  }
  await transitionDiagnosis(prisma, created.diagnosisId, "scanned");

  // שלב 3: ציונים, מודל עסק, נרטיב (נרטיב שנכשל לא מפיל — fallback בפנים)
  const { score, model, nextStep } = await stepScore(emit, findings);
  const narrative = await step(emit, "narrative", "כותבים את הדוח",
    () => generateNarrative(findings, score, opts.narrativeOptions),
    (n) => n.usedFallback ? "נרטיב תבנית (LLM לא אושר)" : "הנרטיב מוכן");

  // שלב 4: שמירה אטומית ומעבר ל-report_ready
  await step(emit, "save", "שומרים את האבחון", async () => {
    await saveScanResult(prisma, created.diagnosisId, toScanRow(findings, score, narrative), model);
    await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");
  }, () => "האבחון נשמר");

  // שלב 5: backfill האתר שהתגלה — קוסמטי, אחרי report_ready, כשל לא מפיל אבחון ששולם.
  // רק במסלול Places (ב-url האתר נשמר כבר ביצירה).
  if (!siteUrl && findings.business.website) {
    try {
      await prisma.business.update({
        where: { id: created.businessId },
        data: { website: findings.business.website },
      });
    } catch (err) {
      console.error("עדכון האתר בשורת העסק נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  emit({ type: "done", diagnosisId: created.diagnosisId });
  return {
    diagnosisId: created.diagnosisId, businessId: created.businessId,
    findings, score, model, nextStep, narrative,
  };
}

async function stepScore(emit: Emit, findings: ScanFindings) {
  emit({ type: "step", key: "score", label: "מחשבים ציונים ומודל עסק" });
  const score = scoreFindings(DIMENSIONS, findings);
  const model = deriveBusinessModel(findings);
  const nextStep = recommendNextStep(model);
  emit({
    type: "step_done", key: "score", ok: true,
    detail: score.overall == null ? "אין מספיק מידע לציון כולל" : `ציון כולל ${score.overall}/100`,
  });
  return { score, model, nextStep };
}
```

הערת חתימה למממש: אם `generateNarrative` בקוד הקיים מקבל options בפרמטר שלישי בשם/צורה אחרים — להתאים לקריאה הקיימת ב-cli-diagnose.ts (היא המקור הקובע), לא לשנות את הצנרת.

- [ ] **Step 5: לצמצם את `src/cli-diagnose.ts` לצרכן**

main() אחרי שלב ה-pick (שלבים 2–5.5 הישנים נמחקים כולם) הופך ל:

```ts
import { runDiagnosis, DiagnoseFailed, type DiagnoseTarget } from "./server/run-diagnosis";
import type { DiagnoseEvent } from "./server/diagnose-events";

function printEvent(e: DiagnoseEvent): void {
  switch (e.type) {
    case "created": console.log(`📋 אבחון ${e.diagnosisId} נוצר`); break;
    case "step": console.log(`⏳ ${e.label}…`); break;
    case "step_done": console.log(`   ${e.ok ? "✓" : "✗"} ${e.detail ?? ""}`); break;
    // done/error מטופלים בזרימה הראשית — אין צורך להדפיס כאן
    case "done": case "error": break;
  }
}
```

בגוף main(), במקום כל שלבי 2–5.5:

```ts
  const targetInput: DiagnoseTarget = siteUrl
    ? { kind: "url", url: siteUrl.href }
    : { kind: "places", placeId: candidate!.placeId, name: candidate!.name };

  let outcome;
  try {
    outcome = await runDiagnosis(prisma, targetInput, { onEvent: printEvent });
  } catch (err) {
    if (err instanceof DiagnoseFailed) {
      console.log(`❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const { findings: scan, score, model, nextStep, narrative } = outcome;
```

שלב הפלט (קובץ + summary) נשאר כמו היום, על המשתנים שחולצו (השורות מ-`mkdirSync` והלאה — ללא שינוי, כולל פורמט ה-summary). הבדיקה `if (!query && !url)`, נרמול ה-URL המוקדם והודעותיו — נשארים ב-CLI (נרמול כפול עם ה-runner הוא זול ואידמפוטנטי).

- [ ] **Step 6: הרצה ירוקה**

Run: `npx vitest run tests/run-diagnosis.test.ts` ואז `npm test` + `npm run typecheck`
Expected: PASS הכול (כולל כל בדיקות ה-CLI הקיימות).

- [ ] **Step 7: עשן חי אחד (זול — Places בלבד)**

Run: `npm run diagnose -- "אופטיקה בק עפולה"`
Expected: זרימת אירועים מודפסת (⏳/✓), מסתיים ב-report_ready עם summary זהה במבנהו לקודם. עלות ~$0.06.

- [ ] **Step 8: Commit**

```bash
git add src/server/diagnose-events.ts src/server/run-diagnosis.ts src/cli-diagnose.ts tests/run-diagnosis.test.ts tests/fakes/fake-db.ts
git commit -m "feat(2b-5): extract runDiagnosis orchestrator with progress events; CLI becomes thin consumer"
```

---

### משימה 6: שלד Next.js — התקנה, קונפיג, RTL, פריסה ✅

> **As-built (1da121f + d58079d):** next@15.5.23 / react@19.2.8 / tailwind@4.3.3. Next הוסיף אוטומטית allowJs+exclude ל-tsconfig (מוטציות סטנדרטיות, נבדקו — no-op בריפו הזה). tsbuildinfo נוסף ל-gitignore. אומת אמפירית: dotenv של ה-CLI לא דורס את טעינת ה-env של Next (override=false) — עדיפות Next תמיד גוברת; אזהרה עתידית: .env.local ייקרא רק ע"י Next ולא ע"י ה-CLI — לא ליצור כזה בלי יישור שניהם. typecheck שורד גם checkout נקי בלי .next (נבדק). tsconfig מכסה מעכשיו גם את tests+prisma ב-next build — קובץ בדיקה שבור מפיל build (צימוד מודע). תזכורת שנבדקה: reactStrictMode:false הוא רק הפחתת רעש — ההגנה האמיתית נגד ירי-כפול של סריקה בתשלום היא ה-guard ברמת המודול שחובה לממש במשימה 10.

Next.js 15 נכנס לחבילה הקיימת: `src/app` לצד `src/pipeline`/`src/server`. בלי workspace, בלי מונורפו — RSC מייבא את שכבת השרת ישירות.

**Files:**
- Modify: `package.json` (deps + scripts), `tsconfig.json`, `.gitignore`
- Create: `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (placeholder — מוחלף במשימה 9)

- [ ] **Step 1: התקנות**

Run:
```bash
npm install next@15 react@19 react-dom@19
npm install -D tailwindcss@4 @tailwindcss/postcss@4 postcss @types/react @types/react-dom
```
Expected: מותקן בלי שגיאות peer.

- [ ] **Step 2: קונפיג**

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma לא עובר bundling של Next — נשאר external בצד השרת
  serverExternalPackages: ["@prisma/client"],
  // StrictMode מריץ effects פעמיים ב-dev — אצלנו effect אחד יורה סריקה בתשלום (Places).
  // הגנת ה-module-level במסך הסריקה היא ההגנה האמיתית; זה מוריד את הרעש
  reactStrictMode: false,
};

export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIT — אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר — ותוך דקה יש אבחון",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (placeholder זמני):
```tsx
export default function HomePage() {
  return <main className="p-10 text-xl">AIT — בקרוב</main>;
}
```

`package.json` scripts — להוסיף:
```json
"dev": "next dev",
"build": "next build",
"start": "next start"
```

`.gitignore` — להוסיף שורה: `.next/`

`tsconfig.json` — מוחלף ב:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "jsx": "preserve",
    "isolatedModules": true,
    "incremental": true,
    "lib": ["dom", "dom.iterable", "ES2022"],
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "tests", "prisma", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
שימו לב: `"types": ["node"]` הוסר בכוונה — הוא היה חוסם את הטיפוסים הגלובליים של React (JSX namespace); `"prisma"` נוסף ל-include — סוגר את הפתוח הידוע של seed.ts מחוץ ל-typecheck.

- [ ] **Step 3: build ראשון + אימות**

Run: `npm run build`
Expected: build ירוק; נוצר `next-env.d.ts` (לקומיט).

Run: `npm test` ואז `npm run typecheck`
Expected: PASS — כל 168+ הבדיקות הקיימות ירוקות; typecheck נקי כולל prisma/seed.ts.

Run (עשן dev): להריץ `npm run dev` ברקע, ואז `Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object -ExpandProperty StatusCode`
Expected: 200 ותוכן "AIT — בקרוב". לעצור את השרת אחרי הבדיקה.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs next-env.d.ts .gitignore src/app
git commit -m "feat(2b-6): Next.js 15 + Tailwind 4 scaffold, RTL Hebrew layout, single-package architecture"
```

---

### משימה 7: API חיפוש עסק

route handler דק מעל `searchBusiness` הקיים, בתבנית factory כדי שהבדיקות יזריקו חיפוש מזויף (אף בדיקה לא קוראת ל-Places).

**Files:**
- Create: `src/server/api/search-handler.ts`
- Create: `src/app/api/search/route.ts`
- Test: `tests/search-handler.test.ts`

- [ ] **Step 1: בדיקות נכשלות**

`tests/search-handler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeSearchHandler } from "../src/server/api/search-handler";
import type { BusinessCandidate } from "../src/pipeline/types";

const candidates: BusinessCandidate[] = [
  { placeId: "p1", name: "אופטיקה בק", address: "עפולה", rating: 4.9, reviewCount: 80 },
];

function req(body: unknown): Request {
  return new Request("http://test/api/search", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("makeSearchHandler", () => {
  it("מחזיר מועמדים לשאילתה תקינה", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(req({ query: "אופטיקה בק עפולה" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates });
  });

  it("חותך ל-5 מועמדים לכל היותר", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...candidates[0], placeId: `p${i}` }));
    const handler = makeSearchHandler(async () => many);
    const res = await handler(req({ query: "מאפייה" }));
    expect((await res.json()).candidates).toHaveLength(5);
  });

  it("שאילתה קצרה מדי — 400 עם הודעה עברית", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(req({ query: "א" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/שם עסק/);
  });

  it("גוף לא-JSON — 400, לא זריקה", async () => {
    const handler = makeSearchHandler(async () => candidates);
    const res = await handler(new Request("http://test/api/search", { method: "POST", body: "לא json" }));
    expect(res.status).toBe(400);
  });

  it("כשל Places — 502 עם ההודעה", async () => {
    const handler = makeSearchHandler(async () => { throw new Error("quota"); });
    const res = await handler(req({ query: "מאפייה תל אביב" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("quota");
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/search-handler.test.ts`
Expected: FAIL — המודול לא קיים.

- [ ] **Step 3: מימוש**

`src/server/api/search-handler.ts`:

```ts
import type { BusinessCandidate } from "../../pipeline/types";

const MAX_CANDIDATES = 5; // תואם ל-MAX_LISTED_CANDIDATES של ה-CLI

// factory — ה-route מזריק את searchBusiness החי, הבדיקות מזריקות fake
export function makeSearchHandler(search: (q: string) => Promise<BusinessCandidate[]>) {
  return async function handle(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "גוף הבקשה חייב להיות JSON" }, { status: 400 });
    }
    const query = typeof body === "object" && body !== null && "query" in body
      ? String((body as { query: unknown }).query ?? "").trim()
      : "";
    if (query.length < 2 || query.length > 120) {
      return Response.json({ error: "יש להזין שם עסק (2 עד 120 תווים)" }, { status: 400 });
    }
    try {
      const candidates = (await search(query)).slice(0, MAX_CANDIDATES);
      return Response.json({ candidates });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "החיפוש נכשל" },
        { status: 502 },
      );
    }
  };
}
```

`src/app/api/search/route.ts`:

```ts
import { searchBusiness } from "../../../pipeline/google/places";
import { makeSearchHandler } from "../../../server/api/search-handler";

export const POST = makeSearchHandler(searchBusiness);
```

- [ ] **Step 4: הרצה ירוקה**

Run: `npx vitest run tests/search-handler.test.ts` ואז `npm test` + `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/search-handler.ts src/app/api/search/route.ts tests/search-handler.test.ts
git commit -m "feat(2b-7): business search API route with injectable handler"
```

---

### משימה 8: API אבחון מוזרם (NDJSON)

route שמריץ `runDiagnosis` ומזרים כל `DiagnoseEvent` כשורת JSON. עמידות לניתוק: אם הלקוח רענן/סגר — הכתיבה לזרם נכשלת בשקט אבל **הסריקה ממשיכה עד report_ready** (עקרון "הכול נשמר"; האבחון יופיע ברשימת "אבחונים אחרונים").

**Files:**
- Create: `src/server/api/diagnose-stream.ts`
- Create: `src/app/api/diagnose/route.ts`
- Test: `tests/diagnose-stream.test.ts`

- [ ] **Step 1: בדיקות נכשלות**

`tests/diagnose-stream.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDiagnoseHandler, parseDiagnoseBody } from "../src/server/api/diagnose-stream";
import type { DiagnoseEvent } from "../src/server/diagnose-events";
import type { DiagnoseTarget } from "../src/server/run-diagnosis";

function req(body: unknown): Request {
  return new Request("http://test/api/diagnose", { method: "POST", body: JSON.stringify(body) });
}

async function eventsOf(res: Response): Promise<DiagnoseEvent[]> {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("parseDiagnoseBody", () => {
  it("מסלול Places: placeId + name", () => {
    expect(parseDiagnoseBody({ placeId: "p1", name: "עסק" }))
      .toEqual({ kind: "places", placeId: "p1", name: "עסק", city: undefined });
  });

  it("מסלול URL: מנרמל ומחזיר href", () => {
    const t = parseDiagnoseBody({ url: "www.x.co.il" });
    expect(t).toEqual({ kind: "url", url: "https://www.x.co.il/" });
  });

  it("url פסול — שגיאה עברית, לא זריקה", () => {
    expect(parseDiagnoseBody({ url: "mailto:x@y.il" })).toMatchObject({ error: expect.stringContaining("כתובת") });
  });

  it("גם וגם / לא כלום — שגיאה", () => {
    expect(parseDiagnoseBody({})).toHaveProperty("error");
    expect(parseDiagnoseBody({ placeId: "p", name: "x", url: "https://x.co.il" })).toHaveProperty("error");
  });

  it("placeId בלי name — שגיאה", () => {
    expect(parseDiagnoseBody({ placeId: "p1" })).toHaveProperty("error");
  });
});

describe("makeDiagnoseHandler", () => {
  // ה-runner (runDiagnosis) הוא האחראי הבלעדי לאירוע done — הוא פולט אותו אחרי ה-backfill.
  // ה-handler רק מזרים וסוגר; לכן ה-fake כאן פולט done בעצמו, וה-handler לא מוסיף אחד משלו
  it("מזרים את האירועים כפי שנפלטו ומסיים בסגירת הזרם", async () => {
    const handler = makeDiagnoseHandler(async (_t: DiagnoseTarget, onEvent) => {
      onEvent({ type: "created", diagnosisId: "d1", businessName: "עסק" });
      onEvent({ type: "step", key: "details", label: "מאתרים" });
      onEvent({ type: "done", diagnosisId: "d1" });
      return { diagnosisId: "d1" } as never;
    });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await eventsOf(res);
    expect(events.map((e) => e.type)).toEqual(["created", "step", "done"]);
    expect(events[2]).toEqual({ type: "done", diagnosisId: "d1" });
  });

  it("runner שנכשל — אירוע error בזרם (לא 500)", async () => {
    const handler = makeDiagnoseHandler(async () => { throw new Error("הסריקה קרסה"); });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    const events = await eventsOf(res);
    expect(events[events.length - 1]).toEqual({ type: "error", message: "הסריקה קרסה" });
  });

  it("גוף פסול — 400 JSON רגיל, בלי להריץ סריקה", async () => {
    let ran = false;
    const handler = makeDiagnoseHandler(async () => { ran = true; return { diagnosisId: "x" } as never; });
    const res = await handler(req({}));
    expect(res.status).toBe(400);
    expect(ran).toBe(false);
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון**

Run: `npx vitest run tests/diagnose-stream.test.ts`
Expected: FAIL.

- [ ] **Step 3: מימוש**

`src/server/api/diagnose-stream.ts`:

```ts
import { normalizeSiteUrl } from "../../pipeline/scan-website";
import type { DiagnoseEvent } from "../diagnose-events";
import type { DiagnoseOutcome, DiagnoseTarget } from "../run-diagnosis";

export type DiagnoseRunner = (
  target: DiagnoseTarget,
  onEvent: (e: DiagnoseEvent) => void,
) => Promise<DiagnoseOutcome>;

export function parseDiagnoseBody(body: unknown): DiagnoseTarget | { error: string } {
  if (body == null || typeof body !== "object") return { error: "גוף הבקשה חייב להיות JSON" };
  const b = body as { placeId?: unknown; name?: unknown; city?: unknown; url?: unknown };
  const hasPlace = typeof b.placeId === "string" && b.placeId.length > 0;
  const hasUrl = typeof b.url === "string" && b.url.length > 0;
  if (hasPlace === hasUrl) return { error: "יש לשלוח placeId+name או url — בדיוק אחד מהם" };
  if (hasUrl) {
    try {
      return { kind: "url", url: normalizeSiteUrl(b.url as string).href };
    } catch (err) {
      return { error: `כתובת האתר לא תקינה: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (typeof b.name !== "string" || b.name.length === 0) return { error: "מסלול Places דורש גם name" };
  return {
    kind: "places", placeId: b.placeId as string, name: b.name,
    city: typeof b.city === "string" && b.city ? b.city : undefined,
  };
}

export function makeDiagnoseHandler(run: DiagnoseRunner) {
  return async function handle(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "גוף הבקשה חייב להיות JSON" }, { status: 400 });
    }
    const target = parseDiagnoseBody(body);
    if ("error" in target) return Response.json(target, { status: 400 });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        let closed = false;
        // emit עמיד לניתוק: המשתמש רענן? enqueue ייכשל, נסמן closed — אבל הסריקה ממשיכה
        // עד report_ready. עקרון "הכול נשמר" (אפיון 3.1): האבחון יופיע ב"אבחונים אחרונים"
        const emit = (e: DiagnoseEvent) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
          } catch {
            closed = true;
          }
        };
        // done נפלט על ידי ה-runner עצמו (הוא האחראי הבלעדי לאירוע) — כאן רק error וסגירה
        run(target, emit)
          .catch((err) => emit({ type: "error", message: err instanceof Error ? err.message : "האבחון נכשל" }))
          .finally(() => {
            if (!closed) {
              try { controller.close(); } catch { /* כבר נסגר */ }
            }
          });
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  };
}
```

`src/app/api/diagnose/route.ts`:

```ts
import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";

// סריקה מלאה יכולה לקחת עד ~90 שניות (תקציב PSI) — רלוונטי ל-Vercel בעתיד, לא מקומית
export const maxDuration = 300;

export const POST = makeDiagnoseHandler((target, onEvent) => runDiagnosis(prisma, target, { onEvent }));
```

- [ ] **Step 4: הרצה ירוקה**

Run: `npx vitest run tests/diagnose-stream.test.ts` ואז `npm test` + `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/diagnose-stream.ts src/app/api/diagnose/route.ts tests/diagnose-stream.test.ts
git commit -m "feat(2b-8): NDJSON streaming diagnose API - disconnect-resilient, scan survives refresh"
```

---

### משימה 9: מסך 1 — כניסה

שדה אחד (שם עסק או כתובת אתר) + עיר אופציונלית, זיהוי אוטומטי של קלט-URL, רשימת מועמדים מ-Places, ורשימת "אבחונים אחרונים" (עקרון 3.1 — ממשיכים מאיפה שהפסקנו).

**Files:**
- Replace: `src/app/page.tsx`
- Create: `src/app/search-box.tsx`
- Test: `tests/url-detect.test.ts` (הלוגיקה הטהורה; ה-JSX נבדק בשער החי)

- [ ] **Step 1: בדיקה נכשלת לזיהוי URL**

הזיהוי חייב להיות פונקציה טהורה מיובאת (לא inline בקומפוננטה). `tests/url-detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { looksLikeUrl } from "../src/app/url-detect";

describe("looksLikeUrl", () => {
  it.each(["lavangroup.co.il", "https://x.co.il", "www.x.com", "x.co.il/about"])(
    "מזהה כתובת: %s", (s) => expect(looksLikeUrl(s)).toBe(true),
  );
  it.each(["מאפיית לחמים", "אופטיקה בק עפולה", "פיצה. משהו", "st. george"])(
    "לא מזהה שם עסק: %s", (s) => expect(looksLikeUrl(s)).toBe(false),
  );
});
```

- [ ] **Step 2: להריץ ולוודא כישלון, ואז לממש `src/app/url-detect.ts`**

```ts
// קלט הוא "כתובת אתר" רק אם הוא טוקן יחיד (בלי רווחים) עם נקודה ו-TLD בסופו,
// או שהוא מתחיל ב-http. "פיצה. משהו" ו-"st. george" הם שמות עסק — יש בהם רווח
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  return !/\s/.test(s) && /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(s);
}
```

Run: `npx vitest run tests/url-detect.test.ts` — Expected: PASS.

- [ ] **Step 3: `src/app/search-box.tsx` (client)**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksLikeUrl } from "./url-detect";
import type { BusinessCandidate } from "../pipeline/types";

export function SearchBox() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [city, setCity] = useState("");
  const [candidates, setCandidates] = useState<BusinessCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToScan(params: URLSearchParams) {
    router.push(`/scan?${params.toString()}`);
  }

  function chooseCandidate(c: BusinessCandidate) {
    goToScan(new URLSearchParams({ placeId: c.placeId, name: c.name }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidates(null);
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setError("יש להזין שם עסק או כתובת אתר");
      return;
    }
    if (looksLikeUrl(trimmed)) {
      goToScan(new URLSearchParams({ url: trimmed }));
      return;
    }
    setBusy(true);
    try {
      const query = city.trim() ? `${trimmed} ${city.trim()}` : trimmed;
      const res = await fetch("/api/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { candidates?: BusinessCandidate[]; error?: string };
      if (!res.ok || !data.candidates) {
        setError(data.error ?? "החיפוש נכשל — נסו שוב");
        return;
      }
      if (data.candidates.length === 0) {
        setError("לא נמצא עסק מתאים. נסו לנסח אחרת או להוסיף עיר.");
        return;
      }
      if (data.candidates.length === 1) {
        chooseCandidate(data.candidates[0]);
        return;
      }
      setCandidates(data.candidates);
    } catch {
      setError("החיפוש נכשל — נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שם העסק או כתובת האתר"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="עיר (לא חובה)"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-blue-500 focus:outline-none sm:w-40"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "מחפשים…" : "אבחן את העסק שלי"}
        </button>
      </form>

      {error && <p className="mt-3 text-red-600">{error}</p>}

      {candidates && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {candidates.map((c) => (
            <li key={c.placeId}>
              <button
                type="button"
                onClick={() => chooseCandidate(c)}
                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-sm text-slate-500">{c.address}</span>
                </span>
                {c.rating != null && (
                  <span className="text-sm text-slate-600">{c.rating} ★ ({c.reviewCount ?? 0})</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/app/page.tsx` (RSC)**

```tsx
import Link from "next/link";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { DIAGNOSIS_STATUS_LABEL } from "../pipeline/report/presenter";
import { SearchBox } from "./search-box";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה — בלי קאש סטטי

export default async function HomePage() {
  const recent = await listRecentDiagnoses(prisma, 8);
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-bold">אבחון דיגיטלי לעסק שלך</h1>
      <p className="mt-3 text-lg text-slate-600">
        שם העסק או כתובת האתר — ותוך דקה יש דוח: מה עובד, מה חסר, ומה שווה לתקן קודם.
      </p>
      <SearchBox />

      {recent.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold text-slate-700">אבחונים אחרונים</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="font-medium">{d.businessName}</span>
                  <span className="mr-2 text-sm text-slate-500">
                    {DIAGNOSIS_STATUS_LABEL[d.status]}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {d.overall != null && <span className="text-sm font-semibold">{d.overall}/100</span>}
                  {d.status === "report_ready" && (
                    <Link href={`/report/${d.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      לדוח ←
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: אימות**

Run: `npm test` + `npm run typecheck` + `npm run build`
Expected: PASS. בדיקה ידנית ב-dev: העמוד עולה, שלושת האבחונים הקיימים מופיעים ברשימה עם ציוניהם (73/77/71), חיפוש "אופטיקה בק עפולה" מחזיר מועמד ומנווט ל-/scan (המסך עוד לא קיים — 404 זה בסדר בשלב זה), קלט "lavangroup.co.il" מנווט ל-/scan?url=….

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/search-box.tsx src/app/url-detect.ts tests/url-detect.test.ts
git commit -m "feat(2b-9): entry screen - unified name/URL input, candidate picker, recent diagnoses"
```

---

### משימה 10: מסך 2 — סריקה חיה

עמוד `/scan` צורך את זרם ה-NDJSON ומציג שורה-אחר-שורה. בסיום — ניווט לדוח. הגנה קריטית: **module-level guard** נגד ירי כפול של סריקה בתשלום (remount ,double-effect, ניווט חוזר).

**Files:**
- Create: `src/app/scan/page.tsx`
- Create: `src/app/scan/scan-runner.tsx`
- Create: `src/app/ndjson.ts` (פרסר הזרם — טהור ונבדק)
- Test: `tests/ndjson.test.ts`

- [ ] **Step 1: בדיקה נכשלת לפרסר NDJSON**

`tests/ndjson.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NdjsonParser } from "../src/app/ndjson";

describe("NdjsonParser", () => {
  it("מפרק צ'אנקים שלמים לשורות JSON", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("שומר שורה חתוכה בין צ'אנקים", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('{"a"')).toEqual([]);
    expect(p.push(':1}\n')).toEqual([{ a: 1 }]);
  });

  it("flush מחזיר שארית אחרונה בלי newline סוגר", () => {
    const p = new NdjsonParser<{ a: number }>();
    p.push('{"a":3}');
    expect(p.flush()).toEqual([{ a: 3 }]);
  });

  it("שורה פגומה נזרקת בשקט (לא מפילה את הזרם)", () => {
    const p = new NdjsonParser<{ a: number }>();
    expect(p.push('לא json\n{"a":4}\n')).toEqual([{ a: 4 }]);
  });
});
```

- [ ] **Step 2: להריץ ולוודא כישלון, ואז לממש `src/app/ndjson.ts`**

```ts
// פרסר NDJSON אינקרמנטלי: צ'אנקים מגיעים חתוכים באמצע שורה — צוברים buffer ופולטים שורות שלמות.
// שורה שאינה JSON תקין נזרקת בשקט: זרם חלקי עדיף על מסך שנתקע על צ'אנק פגום
export class NdjsonParser<T> {
  private buffer = "";

  push(chunk: string): T[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return parseLines<T>(lines);
  }

  flush(): T[] {
    const rest = this.buffer;
    this.buffer = "";
    return parseLines<T>([rest]);
  }
}

function parseLines<T>(lines: string[]): T[] {
  const out: T[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // שורה פגומה — מדלגים
    }
  }
  return out;
}
```

Run: `npx vitest run tests/ndjson.test.ts` — Expected: PASS.

- [ ] **Step 3: `src/app/scan/scan-runner.tsx` (client)**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NdjsonParser } from "../ndjson";
import type { DiagnoseEvent } from "../../server/diagnose-events";

interface StepLine {
  key: string;
  label: string;
  done: boolean;
  ok?: boolean;
  detail?: string;
}

// הגנה ברמת המודול נגד ירי כפול של סריקה בתשלום: remount (StrictMode/ניווט) לא מאפס אותה.
// המפתח הוא היעד — ניווט לסריקה של יעד אחר כן יורה מחדש
const startedTargets = new Set<string>();

export function ScanRunner({ target }: { target: { placeId?: string; name?: string; url?: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState("מתחילים…");
  const [lines, setLines] = useState<StepLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const targetKey = JSON.stringify(target);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || startedTargets.has(targetKey)) return;
    startedRef.current = true;
    startedTargets.add(targetKey);

    const apply = (e: DiagnoseEvent) => {
      switch (e.type) {
        case "created":
          setTitle(`מאבחנים את ${e.businessName}`);
          break;
        case "step":
          setLines((prev) => [...prev, { key: e.key, label: e.label, done: false }]);
          break;
        case "step_done":
          setLines((prev) => prev.map((l) => l.key === e.key ? { ...l, done: true, ok: e.ok, detail: e.detail } : l));
          break;
        case "done":
          startedTargets.delete(targetKey); // אפשר לאבחן שוב את אותו עסק בעתיד
          router.replace(`/report/${e.diagnosisId}`);
          break;
        case "error":
          startedTargets.delete(targetKey);
          setError(e.message);
          break;
      }
    };

    (async () => {
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST", headers: { "content-type": "application/json" }, body: targetKey,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          startedTargets.delete(targetKey);
          setError(data?.error ?? "האבחון נכשל — נסו שוב");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new NdjsonParser<DiagnoseEvent>();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const e of parser.push(decoder.decode(value, { stream: true }))) apply(e);
        }
        for (const e of parser.flush()) apply(e);
      } catch {
        startedTargets.delete(targetKey);
        setError("החיבור נקטע — ייתכן שהסריקה ממשיכה ברקע; בדקו את הרשימה בעמוד הראשי בעוד דקה");
      }
    })();
  }, [targetKey, router]);

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-slate-500">בדרך כלל לוקח פחות מדקה</p>

      <ul className="mt-8 space-y-3">
        {lines.map((l) => (
          <li key={l.key} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="mt-0.5 text-lg">
              {!l.done ? <span className="inline-block animate-pulse">⏳</span> : l.ok ? "✓" : "✗"}
            </span>
            <span>
              <span className={l.done && l.ok === false ? "text-slate-400" : ""}>{l.label}</span>
              {l.detail && <span className="block text-sm text-slate-500">{l.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">{error}</p>
          <a href="/" className="mt-2 inline-block text-sm text-blue-600 hover:underline">חזרה לעמוד הראשי</a>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: `src/app/scan/page.tsx`**

```tsx
import { ScanRunner } from "./scan-runner";

// searchParams ב-Next 15 הוא Promise; העמוד דינמי מטבעו
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ placeId?: string; name?: string; url?: string }>;
}) {
  const params = await searchParams;
  const hasPlace = !!params.placeId && !!params.name;
  const hasUrl = !!params.url;
  if (!hasPlace && !hasUrl) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-red-600">חסר יעד לאבחון.</p>
        <a href="/" className="text-blue-600 hover:underline">חזרה לעמוד הראשי</a>
      </main>
    );
  }
  const target = hasUrl
    ? { url: params.url }
    : { placeId: params.placeId, name: params.name };
  return <ScanRunner target={target} />;
}
```

- [ ] **Step 5: אימות**

Run: `npm test` + `npm run typecheck` + `npm run build`
Expected: PASS. בדיקת dev חיה אחת (זולה): מהעמוד הראשי לחפש "בית מאפה ברכת רחל באר שבע" → מסך הסריקה מציג שורות שמופיעות בהדרגה (פרטי עסק → ביקורות → ציונים → נרטיב → שמירה) → ניווט אוטומטי ל-/report/<id> (404 עד משימה 11 — זה בסדר; ה-id נראה ב-URL). לוודא ב-DB שנוצר אבחון אחד בלבד (לא כפול).

- [ ] **Step 6: Commit**

```bash
git add src/app/scan src/app/ndjson.ts tests/ndjson.test.ts
git commit -m "feat(2b-10): live scan screen - NDJSON stream consumer with double-fire guard"
```

---

### משימה 11: מסך 3 — הדוח הראשוני

RSC שקורא מ-`getReport` ומרנדר: באנר no_gbp (ממצא-על), נרטיב (כותרת+סיכום+תג fallback), ציון כולל, חמשת הממדים עם שקיפות מלאה (הרחבת `<details>` — כל חוק עם ✓/✗/לא-נבדק ונקודות; "כל ציון ניתן להסבר בלחיצה"), פערים מובילים עם הסברי הנרטיב, חוזקות, מד שלמות + CTA (ראיון/Roadmap מנוטרלים — אבני דרך 3/4), ומטא-שורה (משך, עלות, דגלים).

**עקרון אסימטריית הראיות נשמר אוטומטית:** המסך מרנדר אך ורק את `RuleResult`-ים מהמנוע (known/earned/text) — אף היסק חדש לא קורה בשכבת התצוגה.

**Files:**
- Create: `src/app/report/[id]/page.tsx`
- Create: `src/app/report/[id]/not-found.tsx`

- [ ] **Step 1: `src/app/report/[id]/not-found.tsx`**

```tsx
export default function ReportNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">האבחון לא נמצא</h1>
      <p className="mt-2 text-slate-600">ייתכן שהקישור שגוי או שהאבחון טרם הושלם.</p>
      <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">חזרה לעמוד הראשי</a>
    </main>
  );
}
```

- [ ] **Step 2: `src/app/report/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "../../../server/db";
import { getReport } from "../../../server/diagnosis-read";
import {
  DATA_STATUS_LABEL, PARTIAL_FLAG_LABEL, scoreTone, type ScoreToneKind,
} from "../../../pipeline/report/presenter";
import type { DimensionScore, Highlight } from "../../../pipeline/score/types";

export const dynamic = "force-dynamic";

const TONE_TEXT: Record<ScoreToneKind, string> = {
  good: "text-emerald-700", mid: "text-amber-600", low: "text-red-600", unknown: "text-slate-400",
};
const TONE_BAR: Record<ScoreToneKind, string> = {
  good: "bg-emerald-500", mid: "bg-amber-500", low: "bg-red-500", unknown: "bg-slate-300",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(prisma, id).catch(() => null);
  if (!report || !report.scan) notFound();
  const { scan, model, nextStep, business } = report;
  const scores = scan.scores;
  const narrative = scan.narrative;
  const noGbp = scan.findings.partial.includes("no_gbp");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <a href="/" className="text-sm text-blue-600 hover:underline">→ אבחון חדש</a>
      <h1 className="mt-2 text-3xl font-bold">{business.name}</h1>
      {business.website && (
        <p className="mt-1 text-sm text-slate-500">{business.website}</p>
      )}

      {noGbp && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-700">העסק לא נמצא בגוגל מפות</p>
          <p className="mt-1 text-sm text-red-600">
            לקוחות שמחפשים בסביבה פשוט לא רואים אותו — זה הפער הדיגיטלי המשמעותי ביותר שמצאנו.
          </p>
        </div>
      )}

      {narrative && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{narrative.narrative.headline}</h2>
          <p className="mt-2 leading-relaxed text-slate-700">{narrative.narrative.summary}</p>
          {narrative.usedFallback === true && (
            <p className="mt-3 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              נרטיב תבנית — נכתב בלי מודל שפה
            </p>
          )}
        </section>
      )}

      {scores && (
        <section className="mt-6">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-semibold text-slate-700">הציון הדיגיטלי</h2>
            <p className={`text-5xl font-bold ${TONE_TEXT[scoreTone(scores.overall)]}`}>
              {scores.overall ?? "—"}
              <span className="text-lg font-normal text-slate-400">/100</span>
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {scores.dimensions.map((d) => <DimensionCard key={d.key} d={d} />)}
          </div>
        </section>
      )}

      {scores && scores.topGaps.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-700">הפערים המובילים</h2>
          <ul className="mt-3 space-y-2">
            {scores.topGaps.map((g) => (
              <GapItem key={g.ruleKey} gap={g}
                explanation={narrative?.narrative.gapExplanations.find((x) => x.ruleKey === g.ruleKey)?.explanation} />
            ))}
          </ul>
        </section>
      )}

      {scores && scores.topStrengths.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-700">מה עובד טוב</h2>
          <ul className="mt-3 space-y-2">
            {scores.topStrengths.map((s) => (
              <li key={s.ruleKey} className="flex gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800">
                <span>✓</span><span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {model && nextStep && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">שלמות האבחון</h2>
            <span className="text-2xl font-bold">{model.completenessPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${model.completenessPct}%` }} />
          </div>
          <p className="mt-3 text-slate-600">{nextStep.reason}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled className="cursor-not-allowed rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white opacity-40" title="אבן דרך 3">
              רוצה תוצאה מדויקת יותר? בוא נדבר 5 דקות (בקרוב)
            </button>
            <button disabled className="cursor-not-allowed rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-500 opacity-60" title="אבן דרך 4">
              דלג ל-Roadmap (בקרוב)
            </button>
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        <p>
          משך סריקה: {(scan.durationMs / 1000).toFixed(1)} שניות
          {" · "}עלות APIs: ${scan.apiCost.toFixed(3)}
          {" · "}עלות LLM: ${scan.llmCost.toFixed(3)}
        </p>
        {scan.findings.partial.length > 0 && (
          <p className="mt-1">
            הערות איסוף: {scan.findings.partial.map((f) => PARTIAL_FLAG_LABEL[f]).join(" · ")}
          </p>
        )}
      </footer>
    </main>
  );
}

function DimensionCard({ d }: { d: DimensionScore }) {
  const tone = scoreTone(d.score);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{d.label}</h3>
        <span className={`text-xl font-bold ${TONE_TEXT[tone]}`}>{d.score ?? "—"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${d.score ?? 0}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{DATA_STATUS_LABEL[d.dataStatus]}</p>
      {/* שקיפות מתודולוגיה (אפיון מסך 3): כל ציון ניתן להסבר בלחיצה — details נטיבי, בלי JS */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-blue-600 hover:underline">איך חושב הציון?</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {d.rules.map((r) => (
            <li key={r.key} className={r.known ? (r.earned ? "text-emerald-700" : "text-red-600") : "text-slate-400"}>
              {r.known ? (r.earned ? "✓ " : "✗ ") : "· "}
              {r.known ? r.text : `לא נבדק — אין מידע (${r.key})`}
              <span className="text-xs text-slate-400"> · {r.points} נק'</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function GapItem({ gap, explanation }: { gap: Highlight; explanation?: string }) {
  return (
    <li className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
      <p className="flex gap-2 font-medium text-red-700"><span>✗</span><span>{gap.text}</span></p>
      {explanation && explanation !== gap.text && (
        <p className="mt-1 pr-6 text-sm text-red-600">{explanation}</p>
      )}
    </li>
  );
}
```

- [ ] **Step 3: אימות**

Run: `npm test` + `npm run typecheck` + `npm run build`
Expected: PASS. בדיקת dev: לפתוח את `/report/<id>` של שלושת האבחונים הקיימים (ה-id-ים ברשימת העמוד הראשי):
- ברכת רחל: תשתית/תהליכים מוצגים "—" + "אין מידע" (לא 0), מד שלמות 15%.
- lavangroup: באנר "לא נמצא בגוגל מפות" בראש; ממדים חסרי מידע "—".
- אופטיקה בק: 73/100, שלושת הפערים, הרחבת "איך חושב הציון?" מציגה חוקים.
- `/report/id-שלא-קיים` → עמוד "האבחון לא נמצא".

- [ ] **Step 4: Commit**

```bash
git add src/app/report
git commit -m "feat(2b-11): report screen - scores with rule-level transparency, gaps, completeness, no_gbp banner"
```

---

### משימה 12: שער יציאה 2ב — הרצה חיה מלאה בדפדפן

**Files:**
- Create: `docs/milestone-2b-gate.md`

- [ ] **Step 1: הרצות חיות בדפדפן (dev server רץ)**

שלושת עסקי הייחוס, הפעם דרך המשפך המלא בדפדפן (עלות ~$0.2 Places סה"כ):

1. **אופטיקה בק עפולה** — מסלול חיפוש: הקלדה במסך 1 → בחירת מועמד (אם יש כמה) → מסך סריקה חיה → דוח.
2. **בית מאפה ברכת רחל באר שבע** — עסק דל: לוודא בדוח "אין מידע" ולא 0.
3. **lavangroup.co.il** — מסלול URL: הקלדת הדומיין במסך 1 (זיהוי URL אוטומטי) → דוח עם באנר no_gbp.

- [ ] **Step 2: בדיקות רוחב (לתעד בשער)**

- [ ] כל הרצה: השורות במסך 2 מופיעות **בהדרגה** (לא הכול בבת אחת בסוף) והניווט לדוח אוטומטי.
- [ ] הציונים בדוח זהים/קרובים לריצות ה-CLI של שער 2א (73/77/71 — סטיות קטנות מנתונים חיים מותרות ומוסברות).
- [ ] **עמידות רענון:** להתחיל סריקה רביעית (עסק מהרשימה — למשל אופטיקה בק שוב), לרענן את הדף באמצע — לחזור לעמוד הראשי ותוך דקה האבחון מופיע ברשימה כ"דוח מוכן" עם ציון. (הסריקה שרדה את הניתוק.)
- [ ] אין אבחון תקוע ב-scanning ב-DB אחרי כל הריצות.
- [ ] ToS: להריץ grep על ה-HTML של שלושת הדוחות (View Source או curl) — אפס `reviewerName`/`originalText`/`quote`/`displayName`; רק תמות-מסקנה.
- [ ] CLI רגרסיה: `npm run diagnose -- "בית מאפה ברכת רחל באר שבע"` עדיין עובד מקצה לקצה (הצרכן הדק).
- [ ] `npm test` + `npm run typecheck` + `npm run build` — הכול ירוק.

- [ ] **Step 3: כתיבת `docs/milestone-2b-gate.md`**

באותה תבנית של docs/milestone-2a-gate.md: טבלת שלוש הריצות (מסך→דוח, ציון, פערים, סטטוס), בדיקות הרוחב עם ממצאים, החלטת שער (עובר / לא עובר + מה חסר), וסעיף "מוכנות לאבן דרך 3" (מה הראיון יצטרך: endpoint הודעות, עדכון business_model עם קרדיט 1, מסך צ'אט).

- [ ] **Step 4: Commit**

```bash
git add docs/milestone-2b-gate.md
git commit -m "docs(2b-12): milestone 2b exit gate - full browser funnel on 3 reference businesses"
```

---

## סיכום סדר והרציונל

| # | משימה | תלות |
|---|---|---|
| 1 | פרובננס נרטיב + עלות LLM | — |
| 2 | צד קריאה (getReport/list) | 1 (צורת narrative) |
| 3 | זהות עסק אטומית (websiteKey) | — |
| 4 | presenter + parseArgs | — |
| 5 | חילוץ runDiagnosis + אירועים | 1, 3, 4 |
| 6 | שלד Next.js | — |
| 7 | API חיפוש | 6 |
| 8 | API אבחון מוזרם | 5, 6 |
| 9 | מסך 1 — כניסה | 2, 4, 6, 7 |
| 10 | מסך 2 — סריקה חיה | 8 |
| 11 | מסך 3 — דוח | 2, 4 |
| 12 | שער יציאה | הכול |
