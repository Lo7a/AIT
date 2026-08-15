import type { DimensionKey, RuleResult, ScoreReport } from "../score/types";
import type { BusinessModel } from "../model/business-model";

// מנוע התאמת הזדמנויות (אבן דרך 4, משימה 2): טהור לחלוטין - בלי I/O, בלי Date/random, בלי
// תלות בשרת. סוגר על ScoreReport + BusinessModel קיימים ומחזיר את פריטי הקטלוג הרלוונטיים
// עם הראיות שלהם. אותו קלט = אותו פלט, תמיד.

// שורת קטלוג מצומצמת - בדיוק השדות שהמנוע הזה צריך, בלי תלות בפריזמה/DB (ראו התוכנית, משימה 2)
export interface CatalogRowLite {
  id: string;
  name: string;
  problem: string;
  solution: string;
  conditions: { gapKeys: string[] };
  costRange: string;
  savingRange: string;
  complexity: string;
  installTime: string;
}

export interface MatchEvidence {
  ruleKey: string;
  dimension: DimensionKey;
  text: string;
  lostWeightedPoints: number;
}

export interface OpportunityMatch {
  catalog: CatalogRowLite;
  evidence: MatchEvidence[]; // רק פערים שידועים (known && !earned)
  unknownKeys: string[]; // gapKeys שאין עליהם מידע - מזינים confidence במשימה הבאה
  painQuotes: string[]; // ציטוטי בעלים מהמודל שנקשרו לפריט הזה
}

// --- מיפוי מילות מפתח לכאבי בעלים -> מפתחות חוקים ---
// גלוי, קבוע וסטטי בקובץ הזה בלבד - לא LLM, לא נלמד מנתונים. פספוס (כאב אמיתי בניסוח לא-מוכר)
// קביל; אין כאן שום ניחוש/הסקה - רק חיפוש תת-מחרוזת פשוט על הטקסט שבעל העסק כתב במילים שלו.
interface PainKeywordRule { keywords: string[]; ruleKeys: string[]; }

const PAIN_KEYWORD_RULES: PainKeywordRule[] = [
  { keywords: ["תור", "תיאום"], ruleKeys: ["online_booking"] },
  { keywords: ["טלפון", "עומס"], ruleKeys: ["whatsapp", "chat_widget"] },
  { keywords: ["לא חוזרים", "לא חוזרות", "שימור", "ביקורות"], ruleKeys: ["has_reviews", "review_volume"] },
  { keywords: ["ידני", "אקסל"], ruleKeys: ["manual_tasks", "internal_tools"] },
  { keywords: ["פניות", "נופל", "נופלת", "נופלים", "נופלות"], ruleKeys: ["lead_handling"] },
];

// מפתחות החוקים שכאב נתון "מצביע" עליהם - איחוד כל הרשומות שאחת ממילות המפתח שלהן מופיעה בציטוט
function ruleKeysOfPain(quote: string): Set<string> {
  const keys = new Set<string>();
  for (const rule of PAIN_KEYWORD_RULES) {
    if (rule.keywords.some((kw) => quote.includes(kw))) {
      for (const key of rule.ruleKeys) keys.add(key);
    }
  }
  return keys;
}

// כל ציטוטי הכאב בפועל מהמודל - אך ורק מסקציית pains, ואך ורק ערכי מחרוזת. ערכים ממקור סריקה
// (כמו fromReviews שהוא מערך תמות, לא ציטוט בעלים) לא נספרים - אין המצאת ציטוט שלא נאמר במילים.
// model=null (אין ראיון בכלל) -> אין ציטוטים.
function painQuotesOf(model: BusinessModel | null): string[] {
  if (!model) return [];
  return Object.values(model.data.pains).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

// אינדקס מהיר של הדוח לפי מפתח חוק - כל gapKey בקטלוג נבדק מולו פעם אחת בזמן קבוע
interface ReportRuleEntry { dimension: DimensionKey; weight: number; rule: RuleResult; }

function indexReport(report: ScoreReport): Map<string, ReportRuleEntry> {
  const index = new Map<string, ReportRuleEntry>();
  for (const dim of report.dimensions) {
    for (const rule of dim.rules) {
      index.set(rule.key, { dimension: dim.key, weight: dim.weight, rule });
    }
  }
  return index;
}

function totalLostPoints(match: OpportunityMatch): number {
  return match.evidence.reduce((sum, e) => sum + e.lostWeightedPoints, 0);
}

// סדר יציב: סכום נקודות אבודות יורד, ואז שם הקטלוג. השוואת מחרוזות רגילה (לא localeCompare
// עם לוקאל) בכוונה - התוצאה חייבת להיות זהה בכל סביבת ריצה, לא תלויה בלוקאל של המערכת המריצה.
function compareMatches(a: OpportunityMatch, b: OpportunityMatch): number {
  const byPoints = totalLostPoints(b) - totalLostPoints(a);
  if (byPoints !== 0) return byPoints;
  if (a.catalog.name < b.catalog.name) return -1;
  if (a.catalog.name > b.catalog.name) return 1;
  return 0;
}

export function matchOpportunities(
  report: ScoreReport,
  model: BusinessModel | null,
  catalog: CatalogRowLite[],
): OpportunityMatch[] {
  const ruleIndex = indexReport(report);
  const pains = painQuotesOf(model);

  const matches: OpportunityMatch[] = [];
  for (const item of catalog) {
    const evidence: MatchEvidence[] = [];
    const unknownKeys: string[] = [];

    for (const gapKey of item.conditions.gapKeys) {
      const entry = ruleIndex.get(gapKey);
      if (!entry || !entry.rule.known) {
        // מפתח שלא קיים בדוח בכלל, או שקיים אך known=false - שני המצבים "לא ידוע" מבחינת הפריט
        unknownKeys.push(gapKey);
        continue;
      }
      if (!entry.rule.earned) {
        evidence.push({
          ruleKey: entry.rule.key,
          dimension: entry.dimension,
          text: entry.rule.text,
          lostWeightedPoints: entry.rule.points * entry.weight,
        });
      }
      // known && earned - לא פער ולא לא-ידוע, פשוט לא נכנס לשום רשימה
    }

    const painQuotes = pains.filter((quote) => {
      const quoteRuleKeys = ruleKeysOfPain(quote);
      return item.conditions.gapKeys.some((key) => quoteRuleKeys.has(key));
    });

    if (evidence.length === 0 && painQuotes.length === 0) continue; // כלל הכניסה: ראיה או כאב רלוונטי

    matches.push({ catalog: item, evidence, unknownKeys, painQuotes });
  }

  return matches.sort(compareMatches);
}
