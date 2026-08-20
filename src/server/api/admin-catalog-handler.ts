// עריכת ספריית השירותים מהניהול (בקשת מייסד 20.8). אותו שער בדיוק כמו ההגדרות
// וההתחזות: אדמין אמיתי בלבד (getRealUser ולא currentActingUser), לא-אדמין מקבל 404,
// וכל שינוי נרשם ביומן.
//
// הכלל שמעצב את הוולידציה כאן: **הספרייה היא המקור לכל מחיר שמוצג ללקוח.** לכן שדות
// שהם רשימות סגורות בקוד (סוג שירות, שלב, ענף, מפתחות פערים) נבדקים מול הרשימות
// עצמן ולא מתקבלים כטקסט חופשי - ערך שאינו ברשימה שובר התאמה בשקט, ושקט הוא בדיוק
// מה שאסור כאן.
import type { SessionUser } from "../auth/session";
import { isAdmin } from "../auth/guard";
import type { UsageEventInput } from "../usage-events";
import { parseServiceType } from "../../pipeline/roadmap/service-type";
import { INDUSTRIES } from "../../pipeline/industry";
import { DIMENSIONS, processRules } from "../../pipeline/score/dimensions";

export const CATALOG_PHASES = ["quick_wins", "automation", "ai", "transformation"] as const;
export const COMPLEXITIES = ["low", "medium", "high"] as const;

const INDUSTRY_SET = new Set<string>(INDUSTRIES);
const PHASE_SET = new Set<string>(CATALOG_PHASES);
const COMPLEXITY_SET = new Set<string>(COMPLEXITIES);

// מפתחות הפערים החוקיים נגזרים מהחוקים עצמם, ולא מרשימה שנכתבת פעמיים. חוק שמוסר
// מ-dimensions.ts מפסיק להיות בחירה חוקית בטופס באותו רגע
export function validGapKeys(): Set<string> {
  const keys = new Set<string>();
  for (const d of DIMENSIONS) for (const r of d.rules) keys.add(r.key);
  for (const r of processRules(null)) keys.add(r.key);
  return keys;
}

export interface CatalogWriteInput {
  name: string;
  problem: string;
  solution: string;
  serviceType: string | null;
  phase: string | null;
  complexity: string;
  installTime: string;
  costRange: string;
  savingRange: string;
  gapKeys: string[];
  industries: string[] | null;
}

export interface CatalogRecord extends CatalogWriteInput {
  id: string;
}

export interface CatalogDeps {
  getRealUser: () => Promise<SessionUser | null>;
  findByName: (name: string) => Promise<{ id: string } | null>;
  create: (input: CatalogWriteInput) => Promise<{ id: string }>;
  update: (id: string, input: CatalogWriteInput) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  addBenchmark: (catalogId: string, b: { metric: string; range: string; source: string; verifiedAt: Date }) => Promise<void>;
  removeBenchmark: (benchmarkId: string) => Promise<void>;
  emit: (input: UsageEventInput) => Promise<void>;
}

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

const list = (form: FormData, key: string): string[] =>
  form.getAll(key).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => v !== "");

export class CatalogInputError extends Error {}

/**
 * קריאת הטופס לאובייקט מאומת. זורק CatalogInputError עם הודעה בעברית על השדה שנכשל -
 * הודעה כללית ("ערך לא תקין") הייתה מכריחה את מי שעורך לנחש איזה שדה.
 */
export function readCatalogForm(form: FormData): CatalogWriteInput {
  const name = str(form, "name");
  if (name === "") throw new CatalogInputError("חסר שם לשירות");
  if (name.length > 120) throw new CatalogInputError("שם השירות ארוך מדי");

  const problem = str(form, "problem");
  const solution = str(form, "solution");
  if (problem === "") throw new CatalogInputError("חסר תיאור הבעיה שהשירות פותר");
  if (solution === "") throw new CatalogInputError("חסר תיאור הפתרון");

  const rawService = str(form, "serviceType");
  const serviceType = rawService === "" ? null : parseServiceType(rawService);
  if (rawService !== "" && serviceType == null) throw new CatalogInputError("סוג שירות לא מוכר");

  const rawPhase = str(form, "phase");
  if (rawPhase !== "" && !PHASE_SET.has(rawPhase)) throw new CatalogInputError("שלב לא מוכר");

  const complexity = str(form, "complexity");
  if (!COMPLEXITY_SET.has(complexity)) throw new CatalogInputError("מורכבות חייבת להיות נמוכה, בינונית או גבוהה");

  const installTime = str(form, "installTime");
  if (installTime === "") throw new CatalogInputError("חסר זמן הטמעה");

  const costRange = str(form, "costRange");
  const savingRange = str(form, "savingRange");
  if (costRange === "") throw new CatalogInputError("חסר טווח מחיר");
  if (savingRange === "") throw new CatalogInputError("חסר טווח החיסכון או התועלת");

  const allowed = validGapKeys();
  const gapKeys = list(form, "gapKeys");
  for (const k of gapKeys) {
    if (!allowed.has(k)) throw new CatalogInputError(`מפתח פער לא מוכר: ${k}`);
  }
  if (gapKeys.length === 0) throw new CatalogInputError("צריך לפחות פער אחד, אחרת השירות לא יותאם לאף עסק");

  // ענפים: היעדר השדה לגמרי = פריט כללי לכל עסק. **מערך ריק אינו זהה לחסר** - הוא פריט
  // ענפי שלא נבחר לו ענף, כלומר פריט שלא יתאים לאיש. זו אותה הבחנה בדיוק שמתועדת
  // ב-matching.ts, ולכן הטופס שולח דגל מפורש במקום להסיק מהרשימה
  const scoped = str(form, "industryScoped") === "1";
  const industries = scoped ? list(form, "industries") : null;
  if (industries != null) {
    for (const s of industries) {
      if (!INDUSTRY_SET.has(s)) throw new CatalogInputError(`ענף לא מוכר: ${s}`);
    }
    if (industries.length === 0) throw new CatalogInputError("סומן שהשירות ענפי, אבל לא נבחר אף ענף");
  }

  return {
    name, problem, solution,
    serviceType,
    phase: rawPhase === "" ? null : rawPhase,
    complexity, installTime, costRange, savingRange,
    gapKeys, industries,
  };
}

export function makeCatalogHandler(deps: CatalogDeps) {
  return async function handle(req: Request): Promise<Response> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
    }

    const real = await deps.getRealUser();
    if (real == null) return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
    if (!isAdmin(real)) return Response.json({ error: "לא נמצא" }, { status: 404 });

    const action = str(form, "action");
    const id = str(form, "id");

    try {
      if (action === "archive" || action === "restore") {
        if (id === "") return Response.json({ error: "חסר מזהה" }, { status: 400 });
        await deps.setArchived(id, action === "archive");
        await deps.emit({
          type: "catalog_changed", userId: real.id, actorUserId: real.id,
          entityType: "catalog", entityId: id,
          metadata: { action },
        });
        return Response.json({ ok: true, id });
      }

      if (action === "benchmark_add") {
        if (id === "") return Response.json({ error: "חסר מזהה" }, { status: 400 });
        const metric = str(form, "metric");
        const range = str(form, "range");
        const source = str(form, "source");
        const verifiedRaw = str(form, "verifiedAt");
        if (metric === "" || range === "") throw new CatalogInputError("לבנצ'מרק צריך גם מדד וגם טווח");
        // מקור הוא שדה חובה ולא נוחות: מחיר בלי מקור הוא בדיוק המספר המומצא שכלל
        // הברזל אוסר, וטווח בלי מקור לא אמור להגיע למסך של בעל עסק
        if (source === "") throw new CatalogInputError("לבנצ'מרק חייב להיות מקור - טווח בלי מקור לא מוצג ללקוח");
        const verifiedAt = verifiedRaw === "" ? new Date() : new Date(verifiedRaw);
        if (Number.isNaN(verifiedAt.getTime())) throw new CatalogInputError("תאריך אימות לא תקין");
        await deps.addBenchmark(id, { metric, range, source, verifiedAt });
        await deps.emit({
          type: "catalog_changed", userId: real.id, actorUserId: real.id,
          entityType: "catalog", entityId: id, metadata: { action, metric },
        });
        return Response.json({ ok: true, id });
      }

      if (action === "benchmark_remove") {
        const benchmarkId = str(form, "benchmarkId");
        if (benchmarkId === "") return Response.json({ error: "חסר מזהה" }, { status: 400 });
        await deps.removeBenchmark(benchmarkId);
        await deps.emit({
          type: "catalog_changed", userId: real.id, actorUserId: real.id,
          entityType: "catalog", entityId: id, metadata: { action },
        });
        return Response.json({ ok: true, id });
      }

      // ברירת המחדל: שמירה - יצירה כשאין מזהה, עדכון כשיש
      const input = readCatalogForm(form);
      const clash = await deps.findByName(input.name);
      if (clash != null && clash.id !== id) {
        throw new CatalogInputError("כבר קיים שירות בשם הזה");
      }

      if (id === "") {
        const created = await deps.create(input);
        await deps.emit({
          type: "catalog_changed", userId: real.id, actorUserId: real.id,
          entityType: "catalog", entityId: created.id, metadata: { action: "create", name: input.name },
        });
        return Response.json({ ok: true, id: created.id });
      }

      await deps.update(id, input);
      await deps.emit({
        type: "catalog_changed", userId: real.id, actorUserId: real.id,
        entityType: "catalog", entityId: id, metadata: { action: "update", name: input.name },
      });
      return Response.json({ ok: true, id });
    } catch (err) {
      if (err instanceof CatalogInputError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      console.error("admin catalog: write failed:", err);
      return Response.json({ error: "השמירה נכשלה" }, { status: 500 });
    }
  };
}
