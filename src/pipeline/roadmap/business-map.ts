import type { DimensionKey, RuleResult, ScoreReport } from "../score/types";
import type { BusinessModel, ModelSection } from "../model/business-model";

// Business Map (אבן דרך 4, משימה 8): גזירת סטטוס לששת שלבי שרשרת הערך מהאפיון (סעיף 4, מסך 5) -
// שיווק -> ליד -> מכירה -> שירות -> גבייה -> שימור. פונקציה טהורה לגמרי: לא נוגעת ב-DB, לא ב-LLM,
// אותו קלט (ScoreReport + BusinessModel|null) = אותו פלט תמיד. אין כאן חישוב ציון חדש למערכת -
// זו שכבת תצוגה בלבד מעל scores/model הקיימים, לצורך המסך.
//
// ============================ המיפוי (למייסד - לסקירה) ============================
// כל שלב נבנה מרשימת "אותות" (signals): רוב האותות הם חוקים אמיתיים שכבר מחושבים במנוע הציונים
// (score/dimensions.ts) - נלקחים כלשונם, בלי כפילות לוגיקה; חלק הם קרדיט הסקציה במודל העסק
// (0/0.5/1, ראו model/business-model.ts), במקומות שאין חוק ייעודי בכלל.
//
//   שיווק     - כל חוקי ממד "נראות דיגיטלית" (GBP, אתר, מהירות, SEO) + שני חוקים מ"תשתית דיגיטלית"
//               (analytics, fb_pixel) - יכולת מדידה ורימרקטינג היא חלק מהשיווק, לא רק נוכחות.
//   ליד       - כל חוקי ממד "נגישות ללקוח" (טלפון, וואטסאפ, טופס, תור אונליין - הדרכים שליד בכלל
//               נוצר) + חוק "lead_handling" מממד "בשלות תהליכים" (איך הליד מטופל אחרי שנוצר -
//               תלוי בקרדיט lead_flow מהראיון).
//   מכירה     - חוק "internal_tools" (CRM/כלי ניהול מעבר לחשבוניות - תלוי קרדיט tools) + קרדיט
//               סקציית scheduling (איך נקבעים פגישות/תורים - מנגנון הסגירה בפועל). כמעט כולו
//               תלוי-ראיון בכוונה: אין למערכת שום דרך לדעת איך עסק סוגר עסקאות בלי לשאול.
//   שירות     - חוק "chat_widget" מ"תשתית דיגיטלית" (כיסוי שירות מחוץ לשעות פעילות) + קרדיט
//               סקציית service מהראיון.
//   גבייה     - קרדיט סקציית billing בלבד - אין שום חוק סריקה שנוגע בגבייה, אז זה שלב מודל-קרדיט-
//               טהור: בלי ראיון שדיבר על גבייה, השלב תמיד "אין מידע", לעולם לא "חסר"/"חלש" בטעות.
//   שימור     - כל חוקי ממד "מוניטין וביקורות" (ביקורות, דירוג, בעיות חוזרות) + קרדיט סקציית
//               retention מהראיון + אות נוסף: ציטוט כאב מפורש על "לקוחות לא חוזרים" מסקציית pains
//               (ראו RETENTION_LOSS_RE) - עדות ישירה מבעל העסק שקודמת לכל היוריסטיקה.
//
// סמנטיקת קרדיט->אות (לשלבים שאין להם חוק ייעודי: מכירה/שירות/גבייה/שימור בחלקם): קרדיט 0 = לא
// ידוע כלל; 0.5 (מהסריקה בלבד, לפני ראיון) = ידוע אך לא מאושר - נספר כ"ידוע ולא הושג"; 1 (אושר
// בראיון) = ידוע והושג. זו לא קביעה ש"התהליך מצוין" - זו קביעה ש"יש לנו תמונה ולא דווחה שום בעיה
// קונקרטית עליה", אותו עיקרון "לא ממציאים פער שלא דווח" שכבר נוהג בכל מנוע הציונים (ראו ההערה
// הארוכה ב-score/dimensions.ts על lead_handling/manual_tasks/internal_tools).
//
// סטטוס סופי לכל שלב: אחוז הנקודות שהושגו מתוך הנקודות הידועות (אותה נוסחה בדיוק כמו
// scoreDimension ב-score/engine.ts), עם אותם ספי 75/50 שכבר קיימים ב-scoreTone (report/presenter.ts):
//   אין אות ידוע בכלל  -> "אין מידע"
//   >= 75%              -> "תקין"
//   >= 50%               -> "חלש"
//   < 50%                -> "חסר"
// ====================================================================================

export type StageKey = "marketing" | "lead" | "sale" | "service" | "billing" | "retention";
export type StageStatus = "healthy" | "weak" | "missing" | "unknown";

export interface StageView {
  key: StageKey;
  label: string;
  status: StageStatus;
  statusLabel: string;
}

export const STAGE_LABEL: Record<StageKey, string> = {
  marketing: "שיווק",
  lead: "ליד",
  sale: "מכירה",
  service: "שירות",
  billing: "גבייה",
  retention: "שימור",
};

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  healthy: "תקין",
  weak: "חלש",
  missing: "חסר",
  unknown: "אין מידע",
};

interface StageSignal {
  known: boolean;
  earned: boolean;
  points: number;
}

function dimensionRules(scores: ScoreReport, dim: DimensionKey): RuleResult[] {
  return scores.dimensions.find((d) => d.key === dim)?.rules ?? [];
}

// keys לא מוגדר = כל חוקי הממד; keys מוגדר = רק מפתחות אלה (הגנתי: מפתח שלא קיים בדוח פשוט לא
// תורם שום אות, לא זורק - ראו בדיקת "unknown dimensions")
function ruleSignals(scores: ScoreReport, dim: DimensionKey, keys?: readonly string[]): StageSignal[] {
  const rules = dimensionRules(scores, dim);
  const filtered = keys ? rules.filter((r) => keys.includes(r.key)) : rules;
  return filtered.map((r) => ({ known: r.known, earned: r.earned, points: r.points }));
}

const CREDIT_SIGNAL_POINTS = 20;

function creditSignal(model: BusinessModel | null, section: ModelSection): StageSignal {
  const credit = model?.credits[section] ?? 0;
  return { known: credit > 0, earned: credit >= 1, points: CREDIT_SIGNAL_POINTS };
}

// ציטוטי כאב על אובדן לקוחות - אך ורק מסקציית pains, אך ורק ערכי מחרוזת (אותו מקור וסינון כמו
// painQuotesOf ב-pipeline/roadmap/matching.ts). אין ציטוט בכלל => בלי אות (לא "תקין", לא "חסר") -
// היעדר תלונה על שימור הוא לא הוכחה שהשימור תקין, רק היעדר מידע על הנושא הספציפי הזה
const RETENTION_LOSS_RE = /לא חוזר|לא חוזרים|לא חוזרת|לא חוזרות|נוטשים|לא נשארים/;

function retentionPainSignal(model: BusinessModel | null): StageSignal | null {
  const quotes = Object.values(model?.data.pains ?? {}).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (quotes.length === 0) return null;
  const hasLossPain = quotes.some((q) => RETENTION_LOSS_RE.test(q));
  return hasLossPain ? { known: true, earned: false, points: CREDIT_SIGNAL_POINTS } : null;
}

const HEALTHY_THRESHOLD = 75; // זהה ל-FULL_DATA_THRESHOLD (score/engine.ts) ול-scoreTone (report/presenter.ts)
const WEAK_THRESHOLD = 50; // זהה לסף "mid" ב-scoreTone

function statusOf(signals: StageSignal[]): StageStatus {
  const known = signals.filter((s) => s.known);
  const knownPts = known.reduce((sum, s) => sum + s.points, 0);
  if (knownPts === 0) return "unknown";
  const earnedPts = known.filter((s) => s.earned).reduce((sum, s) => sum + s.points, 0);
  const pct = (earnedPts / knownPts) * 100;
  if (pct >= HEALTHY_THRESHOLD) return "healthy";
  if (pct >= WEAK_THRESHOLD) return "weak";
  return "missing";
}

interface StageDef {
  key: StageKey;
  signals: (scores: ScoreReport, model: BusinessModel | null) => StageSignal[];
}

// סדר המערך = סדר שרשרת הערך (אפיון, מסך 5) - deriveBusinessMap שומר עליו, המסך מציג בסדר הזה
const STAGE_DEFS: StageDef[] = [
  {
    key: "marketing",
    signals: (scores) => [
      ...ruleSignals(scores, "visibility"),
      ...ruleSignals(scores, "infrastructure", ["analytics", "fb_pixel"]),
    ],
  },
  {
    key: "lead",
    signals: (scores) => [
      ...ruleSignals(scores, "accessibility"),
      ...ruleSignals(scores, "process", ["lead_handling"]),
    ],
  },
  {
    key: "sale",
    signals: (scores, model) => [
      ...ruleSignals(scores, "process", ["internal_tools"]),
      creditSignal(model, "scheduling"),
    ],
  },
  {
    key: "service",
    signals: (scores, model) => [
      ...ruleSignals(scores, "infrastructure", ["chat_widget"]),
      creditSignal(model, "service"),
    ],
  },
  {
    key: "billing",
    signals: (_scores, model) => [creditSignal(model, "billing")],
  },
  {
    key: "retention",
    signals: (scores, model) => {
      const pain = retentionPainSignal(model);
      return [
        ...ruleSignals(scores, "reputation"),
        creditSignal(model, "retention"),
        ...(pain ? [pain] : []),
      ];
    },
  },
];

export function deriveBusinessMap(scores: ScoreReport, model: BusinessModel | null): StageView[] {
  return STAGE_DEFS.map((def) => {
    const status = statusOf(def.signals(scores, model));
    return { key: def.key, label: STAGE_LABEL[def.key], status, statusLabel: STAGE_STATUS_LABEL[status] };
  });
}
