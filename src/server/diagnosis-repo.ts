import type { PrismaClient, Prisma } from "@prisma/client";
import type { ScanFindings, ScanRawPayload } from "../pipeline/types";
import type { ScoreReport } from "../pipeline/score/types";
import type { NarrativeResult } from "../pipeline/report/narrative";
import type { LlmUsage } from "../pipeline/llm/client";
import type { BusinessModel } from "../pipeline/model/business-model";
import { assertTransition, type DiagnosisStatus } from "./status";
import { websiteKeyOf } from "./website-key";
import { cityOf } from "../pipeline/city-of";

export interface LlmPricing { usdPerMInput: number; usdPerMOutput: number }

// תמחור LLM: שכבת החינם של Gemini = 0. כשייבחר מודל ייצור (אפיון 9.3) מעדכנים את שני
// הקבועים כאן — llm_cost יתחיל להיצבר אמת בלי לגעת בשום קוד אחר. עלות-לאבחון היא KPI (אפיון 9.6)
export const LLM_PRICING: Readonly<LlmPricing> = { usdPerMInput: 0, usdPerMOutput: 0 };

export function llmCostUsd(usage: LlmUsage, pricing: LlmPricing = LLM_PRICING): number {
  return (usage.inputTokens * pricing.usdPerMInput + usage.outputTokens * pricing.usdPerMOutput) / 1_000_000;
}

export interface ScanRow {
  findings: ScanFindings;
  scores: ScoreReport | null;
  // narrative כולל usage + usedFallback — פרובננס הנרטיב (שער 2א, דרישה 5). הערה לצד קריאה עתידי:
  // עמודת ה-DB דו-צורתית — שורות ישנות מכילות ReportNarrative גולמי בלי עטיפה, שורות חדשות מכילות NarrativeResult; מבדילים ביניהן לפי קיום מפתח narrative מקונן ב-JSON
  narrative: NarrativeResult | null;
  llmCost: number;
  apiCost: number;
  durationMs: number;
  // payload גולמי (מקוצץ אצל PageSpeed) - עמודה נפרדת מ-findings כדי לא לשכפל נתונים כבדים
  // בכל קריאה של הדוח (אבן דרך 4, משימה 0.7). לשימוש עתידי בלבד - לא נצרך היום
  raw: ScanRawPayload | null;
}

// ממפה טהור — כל לוגיקת העמודות במקום אחד, נבדק אופליין
export function toScanRow(
  findings: ScanFindings,
  scores: ScoreReport | null,
  narrative: NarrativeResult | null,
  // pricing ניתן להזרקה כדי שסכום הטוקנים (סריקה+נרטיב) יהיה ניתן לבדיקה במבחנים (mutation-killer);
  // קריאות ייצור אף פעם לא מעבירות ארגומנט זה ומקבלות את התמחור האמיתי (LLM_PRICING)
  pricing: LlmPricing = LLM_PRICING,
): ScanRow {
  const usage: LlmUsage = {
    inputTokens: findings.meta.llmInputTokens + (narrative?.usage.inputTokens ?? 0),
    outputTokens: findings.meta.llmOutputTokens + (narrative?.usage.outputTokens ?? 0),
  };
  return {
    findings,
    scores,
    narrative,
    llmCost: llmCostUsd(usage, pricing),
    apiCost: findings.meta.estCostUsd,
    durationMs: findings.meta.durationMs,
    raw: findings.raw ?? null,
  };
}

export interface NewDiagnosisInput {
  name: string;
  placeId?: string;
  website?: string;
  city?: string;
}

export async function createDiagnosisForBusiness(
  prisma: PrismaClient,
  input: NewDiagnosisInput,
): Promise<{ businessId: string; diagnosisId: string }> {
  let businessId: string;
  if (input.placeId) {
    const business = await prisma.business.upsert({
      where: { placeId: input.placeId },
      update: { name: input.name, website: input.website, city: input.city },
      create: { name: input.name, placeId: input.placeId, website: input.website, city: input.city },
    });
    businessId = business.id;
  } else if (input.website) {
    // מסלול אתר-בלבד (no_gbp): upsert אטומי על מפתח מנורמל — כתיבים שונים של אותו אתר
    // מתלכדים לשורה אחת, ושתי ריצות מקבילות לא יוצרות כפיל (שער 2א, דרישה 3).
    // הערה: מסלול placeId לעולם לא קובע websiteKey — איחוד עסק שנסרק פעם דרך --url ופעם
    // דרך Places הוא בעיית מייל סטון 3+.
    const key = websiteKeyOf(input.website);
    const business = await prisma.business.upsert({
      where: { websiteKey: key },
      // name לא ב-update בכוונה: השם שייך ליצירה בלבד — סריקה חוזרת לא תשנה בשקט את השם שכל הדוחות הקודמים מציגים
      update: { website: input.website, city: input.city },
      create: { name: input.name, websiteKey: key, website: input.website, city: input.city },
    });
    businessId = business.id;
  } else {
    // בלי אף מזהה — where ריק היה מחזיר עסק שרירותי ומצמיד לו אבחון של מישהו אחר
    throw new Error("createDiagnosisForBusiness: נדרש placeId או website");
  }
  const diagnosis = await prisma.diagnosis.create({ data: { businessId } });
  return { businessId, diagnosisId: diagnosis.id };
}

export async function transitionDiagnosis(
  prisma: PrismaClient,
  diagnosisId: string,
  to: DiagnosisStatus,
): Promise<void> {
  const current = await prisma.diagnosis.findUniqueOrThrow({
    where: { id: diagnosisId }, select: { status: true },
  });
  assertTransition(current.status as DiagnosisStatus, to);
  // עדכון מותנה בסטטוס שנקרא — שתי ריצות מקבילות לא יעברו שתיהן; count 0 = הפסדנו במרוץ
  const result = await prisma.diagnosis.updateMany({
    where: { id: diagnosisId, status: current.status },
    data: { status: to },
  });
  if (result.count === 0) {
    throw new Error(`מעבר סטטוס נכשל - הסטטוס השתנה במקביל (${current.status} → ${to})`);
  }
}

// שמירת תוצאת הסריקה + המעבר ל-report_ready באותה טרנזקציה. הבאג שתוקן: השמירה והמעבר היו
// שני עגולי DB נפרדים (saveScanResult ואז transitionDiagnosis), וקריסה ביניהם השאירה את הסריקה
// והמודל שמורים בעוד האבחון תקוע ב-scanned לנצח - שום מסלול לא מרים מחדש אבחון במצב הזה.
// הקריאה המקדימה (findUniqueOrThrow + assertTransition) נשארת מחוץ לטרנזקציה כדי לשמור על
// הודעת השגיאה העברית של מכונת המצבים; שומר-המרוץ עצמו (CAS) עבר פנימה
export async function saveScanResult(
  prisma: PrismaClient,
  diagnosisId: string,
  row: ScanRow,
  model: BusinessModel,
): Promise<void> {
  const current = await prisma.diagnosis.findUniqueOrThrow({
    where: { id: diagnosisId }, select: { status: true },
  });
  assertTransition(current.status as DiagnosisStatus, "report_ready");

  // טרנזקציה אינטראקטיבית (ולא מערך) - צריך לזרוק מתוכה כשה-CAS נכשל, כדי שהסריקה תתגלגל אחורה
  await prisma.$transaction(async (tx) => {
    await tx.scan.create({
      data: {
        diagnosisId,
        findings: row.findings as object,
        scores: (row.scores ?? undefined) as object | undefined,
        narrative: (row.narrative ?? undefined) as object | undefined,
        llmCost: row.llmCost,
        apiCost: row.apiCost,
        durationMs: row.durationMs,
        raw: (row.raw ?? undefined) as object | undefined,
      },
    });
    await tx.businessModelRow.upsert({
      where: { diagnosisId },
      update: {
        data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources, credits: model.credits,
        completenessPct: model.completenessPct,
      },
      create: {
        diagnosisId, data: model.data as Prisma.InputJsonValue, fieldSources: model.fieldSources, credits: model.credits,
        completenessPct: model.completenessPct,
      },
    });
    // אותו compare-and-set של transitionDiagnosis: מתעדכן רק אם הסטטוס עדיין scanned.
    // count 0 = ריצה מקבילה הקדימה אותנו - זריקה כאן מגלגלת אחורה גם את שני הכתובים למעלה
    const moved = await tx.diagnosis.updateMany({
      where: { id: diagnosisId, status: "scanned" },
      data: { status: "report_ready" },
    });
    if (moved.count === 0) {
      throw new Error("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (scanned → report_ready)");
    }
  });
}

export interface BusinessContactFindings {
  phone?: string;
  address?: string;
}

// העשרת שורת העסק אחרי סריקה (אבן דרך 4, משימה 0.7): phone/address תמיד מתעדכנים כשיש ערך חדש
// מהסריקה - אין קונפליקט אפשרי, המקור היחיד שלהם הוא Places. city שונה: יכול להיות שהוקלד ידנית
// (למשל דרך CLI --city) והוא נכון יותר ממה ש-cityOf גוזר מהכתובת הפורמלית, אז לא דורסים אותו
// בעיוורון - מעדכנים רק כש-cityOf מפיק ערך וגם (אין city קיים או שהוא שונה מהקיים).
//
// קריאה-ואז-כתיבה מותנית לא מתאימה ל-$transaction המערכי של saveScanResult בלי לעבור לטרנזקציה
// אינטראקטיבית לשם שדה יחיד - בדיוק כמו הנימוק המתועד ב-finishInterview (run-interview.ts) על
// רענון scores, זו העשרה נלווית (לא חלק מהאמת המהותית של האבחון עצמו) שרצה ברצף אחרי השמירה,
// לא אטומית איתה. כשל כאן לא אמור להפיל אבחון ששולם - הקורא עוטף בעצמו ב-try/catch (run-diagnosis.ts,
// באותו דפוס כמו backfill האתר הקיים)
export async function enrichBusinessFromScan(
  prisma: PrismaClient,
  businessId: string,
  business: BusinessContactFindings,
): Promise<void> {
  const data: Prisma.BusinessUpdateInput = {};
  if (business.phone) data.phone = business.phone;
  if (business.address) data.address = business.address;

  if (business.address) {
    const city = cityOf(business.address);
    if (city) {
      const current = await prisma.business.findUnique({ where: { id: businessId }, select: { city: true } });
      if (!current?.city || current.city !== city) data.city = city;
    }
  }

  if (Object.keys(data).length === 0) return; // כלום לעדכן - לא שווה עגול DB מיותר
  await prisma.business.update({ where: { id: businessId }, data });
}
