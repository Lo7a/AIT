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
// קביל; אין כאן שום ניחוש/הסקה - רק חיפוש מילות מפתח בטקסט שבעל העסק כתב במילים שלו.
// מפתחות החוקים שנרשמים כאן הם רק כאלה שפריט קטלוג באמת מבקש ב-gapKeys - מפתח שאף פריט לא
// מבקש לא יכול לצרף ציטוט לאף פריט. manual_tasks נכנס לרשימה ב-16.8 כשסבב ה-AI זרע שני
// פריטים שמבקשים אותו; internal_tools נכנס ב-17.8 כשסבב האתרים והמערכות זרע את פריט ה-CRM.
// כשייכנס לקטלוג פריט שמצהיר על מפתח חדש נוסף - מוסיפים אותו כאן.
interface PainKeywordRule { keywords: string[]; ruleKeys: string[]; }

const PAIN_KEYWORD_RULES: PainKeywordRule[] = [
  { keywords: ["תור", "תיאום", "לתאם"], ruleKeys: ["online_booking"] },
  // lead_handling נוסף 16.8 עם הסוכן הקולי (gapKey יחיד שלו): "הטלפון לא מפסיק לצלצל" הוא
  // בדיוק הכאב שהוא פותר - בלי זה הציטוט היה נצמד רק לבוט הוואטסאפ
  { keywords: ["טלפון", "עומס"], ruleKeys: ["whatsapp", "chat_widget", "lead_handling"] },
  { keywords: ["לא חוזר", "שימור", "ביקורת", "ביקורות"], ruleKeys: ["has_reviews", "review_volume"] },
  // ביקורת שלילית שעומדת בלי מענה היא כאב אחר מ"אין מספיק ביקורות" - הפריט שעונה עליו הוא
  // ניהול ומענה לביקורות (no_problem_themes), לא איסוף ביקורות
  { keywords: ["ביקורת שלילית", "ביקורות שליליות", "ביקורות רעות", "תלונה", "תלונות", "מוניטין"], ruleKeys: ["no_problem_themes"] },
  // manual_tasks נוסף 16.8: כאב על עבודה ידנית שייך גם לסוכני העבודה החדשים, לא רק ל-CRM.
  // internal_tools נוסף 17.8 עם פריט ה-CRM (סבב אתרים ומערכות): "הכל באקסל" הוא בדיוק
  // הכאב של עסק בלי מערכת ניהול לקוחות
  { keywords: ["ידני", "ידנית", "ידניות", "אקסל"], ruleKeys: ["lead_handling", "manual_tasks", "internal_tools"] },
  { keywords: ["פניות", "פנייה", "נופל", "נופלת"], ruleKeys: ["lead_handling"] },
  // פריט ה-CRM (17.8): כאב שמזכיר מערכת/CRM במפורש - עסק שאומר "אין לנו מערכת מסודרת"
  { keywords: ["מערכת", "מערכות", "CRM"], ruleKeys: ["internal_tools"] },
  // פריט הקמת האתר (17.8): כאב שמזכיר אתר ("אין לנו אתר", "צריך אתר") מגיע לפריט ההקמה
  { keywords: ["אתר"], ruleKeys: ["has_website", "own_website"] },
  // כאבי סושיאל והצעות מחיר (16.8, סבב ה-AI): שניהם מנותבים ל-manual_tasks - המפתח המשותף של
  // סוכן התוכן וסוכן הצעות המחיר. הקורסות (ציטוט סושיאל שמופיע גם על כרטיס ההצעות) מוגבלת:
  // הציטוט הוא תמיד מילים אמיתיות של הבעלים, והנימוק מעוגן-הציטוט מנסח את הקשר
  { keywords: ["רשתות", "פייסבוק", "אינסטגרם", "סושיאל", "פוסט", "פוסטים"], ruleKeys: ["manual_tasks"] },
  { keywords: ["הצעת מחיר", "הצעות מחיר"], ruleKeys: ["manual_tasks"] },
];

// עברית: אות סופית שוברת חיפוש גזע - "תיאומים" לא מכיל את "תיאום" ו"טלפונים" לא מכיל את
// "טלפון" (מ' סופית ונ' סופית הן תווים אחרים). ממירים כל אות סופית לצורתה הרגילה בשני הצדדים.
const FINAL_LETTERS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const normalizeFinals = (s: string): string => s.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]);

// "בתור" הוא כמעט תמיד "בתפקיד" ("בתור בעל עסק קטן...") ולא תור לתיאום - מוחקים את המילה הזאת
// בלבד לפני החיפוש. מחיקה ולא פסילת המשפט כולו: "בתור בעל עסק אני מנהל את התורים ביומן" עדיין
// מתאים דרך "התורים". אותו עיקרון של רשימה שחורה מפורשת כמו ב-score/dimensions.ts
const AS_ROLE_RE = /בתור/g;

// גבול מילה עברי: ה-\b של JS מכיר רק תווי ASCII ולכן חסר תועלת כאן, אז בונים גבול ידנית -
// לפני הגזע מותרות תחיליות נצמדות (ו/ה/ב/כ/ל/מ/ש, עד שתיים: "והתורים", "מהטלפון") ואחריו רק
// סיומת ריבוי. בלי הגבול הזה "תורנות" ו"תורה" היו נספרים כ"תור" ומצרפים ציטוט לא רלוונטי.
const HEBREW_PREFIXES = "[והבכלמש]{0,2}";
const PLURAL_SUFFIX = "(?:ימ|ות)?"; // אחרי נרמול הסופיות צורת הרבים של "תור" היא "תורימ"
const compileKeyword = (keyword: string): RegExp =>
  new RegExp(`(?<![א-ת])${HEBREW_PREFIXES}${normalizeFinals(keyword)}${PLURAL_SUFFIX}(?![א-ת])`);

// קומפילציה פעם אחת בטעינת המודול - בלי דגל g (הוא היה שומר lastIndex בין קריאות ל-test
// והופך את ההתאמה ללא-דטרמיניסטית)
const COMPILED_PAIN_RULES: { patterns: RegExp[]; ruleKeys: string[] }[] = PAIN_KEYWORD_RULES.map(
  (rule) => ({ patterns: rule.keywords.map(compileKeyword), ruleKeys: rule.ruleKeys }),
);

// מפתחות החוקים שכאב נתון "מצביע" עליהם - איחוד כל הרשומות שאחת ממילות המפתח שלהן מופיעה בציטוט
function ruleKeysOfPain(quote: string): Set<string> {
  const text = normalizeFinals(quote).replace(AS_ROLE_RE, " ");
  const keys = new Set<string>();
  for (const rule of COMPILED_PAIN_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      for (const key of rule.ruleKeys) keys.add(key);
    }
  }
  return keys;
}

// כל ציטוטי הכאב בפועל מהמודל - אך ורק מסקציית pains, ואך ורק ערכי מחרוזת. ערכים ממקור סריקה
// (כמו fromReviews שהוא מערך תמות, לא ציטוט בעלים) לא נספרים - אין המצאת ציטוט שלא נאמר במילים.
// model=null (אין ראיון בכלל) -> אין ציטוטים. `?? {}` מגן על שורת מודל שנשמרה לפני שהסקציה
// הזאת הייתה קיימת (toModelView מחזיר את ה-JSON מה-DB כמו שהוא, ראו diagnosis-read.ts).
// Set: אותו משפט יכול להישמר בשני שדות (ראיון + טקסט חופשי) - ציטוט אחד בפועל, פעם אחת בפלט.
function painQuotesOf(model: BusinessModel | null): string[] {
  if (!model) return [];
  const quotes = Object.values(model.data.pains ?? {}).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return [...new Set(quotes)];
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
  // מפתחות החוקים של כל ציטוט מחושבים פעם אחת לכל הקטלוג, לא מחדש לכל פריט
  const pains = painQuotesOf(model).map((quote) => ({ quote, ruleKeys: ruleKeysOfPain(quote) }));

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

    const painQuotes = pains
      .filter((pain) => item.conditions.gapKeys.some((key) => pain.ruleKeys.has(key)))
      .map((pain) => pain.quote);

    if (evidence.length === 0 && painQuotes.length === 0) continue; // כלל הכניסה: ראיה או כאב רלוונטי

    matches.push({ catalog: item, evidence, unknownKeys, painQuotes });
  }

  return matches.sort(compareMatches);
}
