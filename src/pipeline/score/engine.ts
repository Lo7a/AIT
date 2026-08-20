import type { ScanFindings } from "../types";
import type {
  DimensionDef, DimensionScore, Highlight, RuleDef, RuleResult, ScoreReport,
} from "./types";
import { buildDimensions } from "./dimensions";
import type { BusinessModel } from "../model/business-model";
import { industryOf, type IndustryValue } from "../industry";

const TOP_COUNT = 3;
// מתחת ל-75% מהנקודות ידועות - הממד מסומן "מידע חלקי" (אפיון 6: לא מענישים על חוסר דאטה)
const FULL_DATA_THRESHOLD = 0.75;

/**
 * האם החוק בכלל חל על העסק הזה (הכרעת מייסד 10, 20.8). חוק שאינו חל **נעלם לחלוטין**:
 * לא ברשימת החוקים, לא בפערים, לא בחוזקות, ולא בשני צדי שבר הציון. זה ההבדל מ"לא נבדק" -
 * שם אין לנו מידע, כאן יש לנו מידע והוא שהשאלה לא רלוונטית.
 *
 * שני סייגים, ושניהם נובעים ממדידה ולא מהעדפה:
 * 1. **ענף לא מזוהה לא מכבה כלום** (הכרעה 6.1). הכיבוי הוא ידיעה, וב-unknown אין ידיעה.
 * 2. **עדות חיובית גוברת על הסיווג.** עסק שסווג "אוכל מהיר" ובכל זאת נמצאה אצלו מערכת
 *    הזמנות - החוק נשאר ומזכה אותו. הגבול ישיבה/מהיר הוא החוליה החלשה בטקסונומיה
 *    (נמדד 20.8, docs/research/2026-08-20-industry-detection-accuracy.md סעיף 5), וטביעת
 *    אצבע של ספק היא ראיה חזקה יותר מקטגוריית גוגל. בלי הסייג הזה סיווג שגוי היה **מוחק
 *    חוזקה אמיתית** של עסק - נזק גרוע יותר מהפער שהכיבוי בא למנוע
 */
function applies(r: RuleDef, f: ScanFindings, industry: IndustryValue): boolean {
  if (r.skipFor == null || industry === "unknown") return true;
  if (!r.skipFor.includes(industry)) return true;
  return r.known(f) && r.earned(f);
}

function scoreDimension(def: DimensionDef, f: ScanFindings, industry: IndustryValue): DimensionScore {
  const rules: RuleResult[] = def.rules.filter((r) => applies(r, f, industry)).map((r) => {
    const known = r.known(f);
    const earned = known && r.earned(f);
    return {
      key: r.key,
      points: r.points,
      known,
      earned,
      text: known ? (earned ? r.okText(f) : r.gapText(f)) : "",
    };
  });

  const totalPts = rules.reduce((s, r) => s + r.points, 0);
  const knownPts = rules.filter((r) => r.known).reduce((s, r) => s + r.points, 0);
  const earnedPts = rules.filter((r) => r.earned).reduce((s, r) => s + r.points, 0);

  return {
    key: def.key,
    label: def.label,
    weight: def.weight,
    score: knownPts === 0 ? null : Math.round((earnedPts / knownPts) * 100),
    dataStatus: knownPts === 0 ? "none" : knownPts >= totalPts * FULL_DATA_THRESHOLD ? "full" : "partial",
    rules,
  };
}

// industry ברירת מחדל "unknown" = אף חוק לא מכובה, כלומר בדיוק ההתנהגות שלפני הכיבוי הענפי.
// קורא שרוצה כיבוי מעביר ענף במפורש, או משתמש ב-scoreWithModel שגוזר אותו בעצמו
export function scoreFindings(
  defs: DimensionDef[], f: ScanFindings, industry: IndustryValue = "unknown",
): ScoreReport {
  const dimensions = defs.map((d) => scoreDimension(d, f, industry));

  // ציון כולל משוקלל רק על ממדים שיש להם מידע - המשקולות מנורמלות מחדש
  const scored = dimensions.filter((d): d is DimensionScore & { score: number } => d.score !== null);
  const weightSum = scored.reduce((s, d) => s + d.weight, 0);
  const overall = weightSum === 0
    ? null
    : Math.round(scored.reduce((s, d) => s + d.score * d.weight, 0) / weightSum);

  // דירוג לפי השפעה אמיתית על הציון הכולל: נקודות × משקל הממד - לא נקודות גולמיות
  const highlights = (pick: (r: RuleResult) => boolean): Highlight[] =>
    dimensions
      .flatMap((d) => d.rules.filter(pick).map((r) => ({
        h: { dimension: d.key, ruleKey: r.key, text: r.text, points: r.points },
        impact: r.points * d.weight,
      })))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, TOP_COUNT)
      .map((x) => x.h);

  return {
    overall,
    dimensions,
    topGaps: highlights((r) => r.known && !r.earned),
    topStrengths: highlights((r) => r.earned),
  };
}

// נוחות: ניקוד עם ממד process קשור למודל העסק (אבן דרך 4, משימה 1) - model=null מייצר בדיוק
// את DIMENSIONS (ה-stub של process) - ראו buildDimensions ב-dimensions.ts.
// **הענף נגזר כאן ולא נדרש מהקורא**: industryOf כבר יודע לקרוא גם את הראיון וגם את גוגל,
// וגזירה בנקודה אחת מבטיחה שכל מסלולי הניקוד (סריקה, ראיון, Roadmap) רואים אותו ענף
export function scoreWithModel(f: ScanFindings, model: BusinessModel | null): ScoreReport {
  return scoreFindings(buildDimensions(model), f, industryOf(f, model).slug);
}
