import type { ScoreReport } from "../score/types";
import type { BusinessModel } from "../model/business-model";
import { matchOpportunities, type CatalogRowLite } from "./matching";
import type { IndustryValue } from "../industry";
import { scoreOpportunity, phaseOf, phaseTierOf } from "./opportunity-score";
import { lossHighlights, type LossHighlight } from "./loss-highlights";

// "מה מונח על השולחן" למסך הדוח (loss leads, score measures - שלב א'): גרסה-בזיכרון-בלבד של
// שרשרת הדירוג ב-run-roadmap.ts (matchOpportunities -> scoreOpportunity -> מיון) בלי LLM ובלי
// שמירה, כדי שהדוח יוכל להראות הזדמנויות עוד לפני שנבנה Roadmap בפועל. תמיד על הציונים *כפי
// שהם שמורים* (report.scan.scores, מועבר ע"י הקורא) - לא scoreWithModel מחדש; זה נשאר בלעדית
// תפקידם של buildRoadmap/finishInterview (המקומות היחידים שבהם ציון "רשמי" נכתב).

// זהה בדיוק לתנאי hasInterviewModel ב-run-roadmap.ts (ראו ההערה שם): קרדיט 1 מגיע אך ורק
// מתשובת ראיון מאושרת - "model !== null" לבדו לא מספיק כי כל סריקה כותבת מודל נגזר-סריקה
function hasInterviewModelOf(model: BusinessModel | null): boolean {
  return model !== null && Object.values(model.credits).some((c) => c >= 1);
}

export function reportLossHighlights(
  scores: ScoreReport | null,
  model: BusinessModel | null,
  catalog: CatalogRowLite[],
  limit = 3,
  // הענף מגיע מוזרק ולא מחושב כאן: הפונקציה סוגרת על ScoreReport בלבד ואין לה ScanFindings.
  // ברירת המחדל "unknown" נותנת בדיוק את ההתנהגות הקיימת - פריטים כלליים בלבד
  industry: IndustryValue = "unknown",
): LossHighlight[] {
  if (!scores) return [];

  const matches = matchOpportunities(scores, model, catalog, industry);
  if (matches.length === 0) return [];

  const maxLostPoints = matches.reduce(
    (max, m) => Math.max(max, m.evidence.reduce((sum, e) => sum + e.lostWeightedPoints, 0)),
    0,
  );
  const interviewModel = hasInterviewModelOf(model);

  // אותו סדר בדיוק כמו compareAiFirstThenScoreThenName הפרטית ב-run-roadmap.ts: שכבת AI קודם
  // (phaseTierOf - החלטת מייסד 16.8), ואז score יורד, ואז שם קטלוג. כפילות קטנה ומכוונת - זהו
  // מודול pipeline טהור (בלי תלות בשרת), ו-run-roadmap.ts לא מייצא את ההשוואה הזו. חשוב שבלוק
  // ההפסד בדוח יסכים עם סדר ה-Roadmap - אותו עסק לא אמור לראות שני סדרים שונים בשני מסכים
  const ranked = matches
    .map((match) => ({ match, tier: phaseTierOf(phaseOf(match)), score: scoreOpportunity(match, maxLostPoints, interviewModel).score }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.score !== a.score) return b.score - a.score;
      if (a.match.catalog.name < b.match.catalog.name) return -1;
      if (a.match.catalog.name > b.match.catalog.name) return 1;
      return 0;
    });

  return lossHighlights(ranked.map((r) => r.match), limit);
}
