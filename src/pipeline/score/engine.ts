import type { ScanFindings } from "../types";
import type {
  DimensionDef, DimensionScore, Highlight, RuleResult, ScoreReport,
} from "./types";

const TOP_COUNT = 3;
// מתחת ל-75% מהנקודות ידועות — הממד מסומן "מידע חלקי" (אפיון 6: לא מענישים על חוסר דאטה)
const FULL_DATA_THRESHOLD = 0.75;

function scoreDimension(def: DimensionDef, f: ScanFindings): DimensionScore {
  const rules: RuleResult[] = def.rules.map((r) => {
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

export function scoreFindings(defs: DimensionDef[], f: ScanFindings): ScoreReport {
  const dimensions = defs.map((d) => scoreDimension(d, f));

  // ציון כולל משוקלל רק על ממדים שיש להם מידע — המשקולות מנורמלות מחדש
  const scored = dimensions.filter((d): d is DimensionScore & { score: number } => d.score !== null);
  const weightSum = scored.reduce((s, d) => s + d.weight, 0);
  const overall = weightSum === 0
    ? null
    : Math.round(scored.reduce((s, d) => s + d.score * d.weight, 0) / weightSum);

  // דירוג לפי השפעה אמיתית על הציון הכולל: נקודות × משקל הממד — לא נקודות גולמיות
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
