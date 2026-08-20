import type { OpportunityMatch } from "./matching";

// דירוג הזדמנות + שיוך שלב (אבן דרך 4, משימה 3): טהור לחלוטין - בלי I/O, בלי Date/random, בלי
// תלות בשרת. סוגר על OpportunityMatch (משימה 2) ומחזיר ציון שקוף ודטרמיניסטי. אותו קלט = אותו
// פלט, תמיד.

// --- נוסחת הציון (0-100) ---
// החלטת מייסד נעולה: כאב הבעלים מוביל את הדירוג - "הכי קל למכור את מה שהבעלים כבר רוצה". בונוס
// הכאב הוא רכיב התנודה הדומיננטי בנוסחה, לא תוספת שולית.
//
// בסיס (0-60): החלק היחסי מסך נקודות המשקל האבודות שהפריט הזה סוגר, מנורמל מול הפריט החזק
//   ביותר ברשימה שהתקבלה: 60 * (סכום lostWeightedPoints של הראיות) / maxLostPoints.
//   maxLostPoints הוא הסכום המקסימלי על פני כל הרשימה המותאמת - מחושב ומועבר ע"י הקורא (יודע
//   את כל הרשימה, לא רק את הפריט הבודד). אם maxLostPoints=0 (כל ההתאמות הן כאב-בלבד, בלי שום
//   ראיה כמותית) - הבסיס 0, בלי חלוקה באפס.
// כאב בעלים (+20 כש-painQuotes לא ריק): בעל העסק אמר את זה במילים שלו - שווה יותר מכל היוריסטיקה.
// ודאות (0 / -10): 0 כשהראיות מלאות (אין unknownKeys), -10 כשיש מפתחות לא-ידועים - חוסר מידע
//   מוריד בדירוג, לעולם לא ממציא נתון שלא קיים.
// מורכבות הטמעה (לפי catalog.complexity): נמוכה +10, בינונית 0, גבוהה -10 - עקרון "ניצחונות
//   מהירים": קל-להטמיע מדורג גבוה יותר, בכל שאר התנאים שווים. מחרוזת מורכבות לא-מוכרת (הגנתי,
//   לא אמור לקרות מול הקטלוג האמיתי) מתייחסת כמו "בינונית" (0) - בלי הטיה לכיוון כלשהו.
// קליפ סופי ל-0-100, עיגול ל-Math.round (עיגול "חצי למעלה" הסטנדרטי של JS - עקבי ופשוט, אין
//   צורך בהתנהגות עיגול מיוחדת לכיוון אחד כאן).

const BASE_MAX_POINTS = 60;
const PAIN_BONUS = 20;
const UNKNOWN_PENALTY = -10;

const COMPLEXITY_ADJUSTMENT: Record<string, number> = {
  low: 10,
  medium: 0,
  high: -10,
};

export type Confidence = "high" | "medium" | "low";

// ביטחון (confidence) - תיקון ממצא שער יציאה אבן דרך 4, בדיקה 4 (docs/milestone-4-gate.md):
// התוכנית (משימה 3) דרשה ל-high גם "הסקציות הרלוונטיות במודל עם credit>=1 היכן שנדרש" - קרדיט 1
// מגיע אך ורק מראיון מאושר (business-model.ts: "1 = אושר בראיון"), לעולם לא מסריקה בלבד. המימוש
// הראשון השמיט את התנאי הזה ובדק רק unknownKeys, כך שעסק שנסרק בלי אף ראיון (למשל gapKey שידוע
// ישירות מהזחילה/PSI, כמו online_booking/perf) קיבל high על כל פריט - התג "דיוק ישתפר עם עוד
// מידע" אף פעם לא הופיע בדיוק במקום שהכי נחוץ. hasInterviewModel (מועבר ע"י הקורא - ראו
// run-roadmap.ts) הוא הפרמטר הישיר לתנאי הזה: בלי מודל מראיון, high אסור בכלל, לא משנה כמה
// ה-gapKeys ידועים מהסריקה.
//
// low: אין שום ראיה כמותית - הפריט נכנס רק על כאב הבעלים (ראו matching.ts, כלל הכניסה). לא תלוי
//   ב-hasInterviewModel כלל (ללא ראיון אין גם ציטוטי כאב - matching.ts, painQuotesOf - אז המקרה
//   הזה כמעט תיאורטי כש-hasInterviewModel=false, אבל הכלל נשאר עקבי).
// אחרת (יש ראיה אחת לפחות): בלי מודל מראיון - medium תמיד, תקרה שלא ניתנת לעקיפה; עם מודל מראיון
//   - high כשאין gapKey לא-ידוע, אחרת medium (ההתנהגות המקורית).
export function scoreOpportunity(
  match: OpportunityMatch,
  maxLostPoints: number,
  hasInterviewModel: boolean,
): { score: number; confidence: Confidence } {
  const lostPoints = match.evidence.reduce((sum, e) => sum + e.lostWeightedPoints, 0);
  const base = maxLostPoints > 0 ? (BASE_MAX_POINTS * lostPoints) / maxLostPoints : 0;

  const painBonus = match.painQuotes.length > 0 ? PAIN_BONUS : 0;
  const certaintyPenalty = match.unknownKeys.length > 0 ? UNKNOWN_PENALTY : 0;
  const complexityAdjustment = COMPLEXITY_ADJUSTMENT[match.catalog.complexity] ?? 0;

  const raw = base + painBonus + certaintyPenalty + complexityAdjustment;
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  const confidence: Confidence =
    match.evidence.length === 0
      ? "low"
      : !hasInterviewModel
        ? "medium"
        : match.unknownKeys.length > 0
          ? "medium"
          : "high";

  return { score, confidence };
}

// --- שיוך לשלב מפה (Roadmap) ---
export type Phase = "quick_wins" | "automation" | "ai" | "transformation";

// מיפוי סטטי וגלוי לפי שם פריט הקטלוג (ראו prisma/seed.ts, מערך CATALOG) - name הוא המפתח
// היציב היחיד שהזרע מספק: אין id יציב (מיוצר ע"י פריזמה בזמן ריצה, לא קיים בזרע עצמו) ואין שדה
// קטגוריה; ה-upsert בזרע עצמו מבוסס על name (where: { name }), כך שזה גם המפתח העסקי בפועל.
//
// כלל עסקי (הוסכם עם המייסד; הורחב 16.8 עם סבב ה-AI):
//   ai          - כל פריט שנמכר כסוכן AI: סוכן/בוט שעונה ללקוח ישירות (סוכן הלידים, בוט
//                 הוואטסאפ, הסוכן הקולי) וגם סוכני עבודה (תוכן, הצעות מחיר). ההחלטה העסקית
//                 (16.8): "AI נמכר הכי טוב" - השלב הזה גם מדורג מעל כל השאר (phaseTierOf).
//   automation  - הקמת מערכת/אינטגרציה מתמשכת שמפחיתה עבודה ידנית לאורך זמן: CRM, מדידה
//                 (Analytics/פיקסל), תורים אונליין, איסוף ביקורות, ניהול ומענה לביקורות, ומהירות
//                 אתר (תשתית טכנית מתמשכת) - כולם דורשים הטמעה שאינה "לחיצת כפתור" חד-פעמית.
//   quick_wins  - פעולה חד-פעמית פשוטה, מורכבות נמוכה, בלי מערכת מתמשכת מאחוריה (פרופיל Google
//                 Business, כפתור וואטסאפ באתר) - "ניצחון מהיר" אמיתי, לא רק זול.
//   transformation - שמור לעתיד. אף אחד מ-10 פריטי הקטלוג הנוכחיים לא ממופה לשם.
//
// כשנכנס פריט קטלוג חדש - יש להוסיף אותו כאן במפורש (בדיוק כמו PAIN_KEYWORD_RULES ב-matching.ts).
// עד אז, פריט לא-ממופה נופל ל-"automation" כברירת מחדל שמרנית (לא מזהיר, לא מתחייב ל-ai/quick_win
// בלי החלטה מפורשת) - אבל 10 הפריטים האמיתיים תמיד מקבלים את ההתאמה המפורשת שלהם, לא את ברירת המחדל.
const PHASE_BY_CATALOG_NAME: Record<string, Phase> = {
  "סוכן AI לטיפול בלידים": "ai",
  "בוט וואטסאפ לשירות לקוחות": "ai",
  "קביעת תורים אונליין": "automation",
  "הקמת פרופיל Google Business": "quick_wins",
  "איסוף ביקורות אוטומטי": "automation",
  "ניהול ומענה לביקורות": "automation",
  "שיפור מהירות האתר": "automation",
  "חיבור וואטסאפ לאתר": "quick_wins",
  "התקנת מדידה (Analytics + פיקסל)": "automation",
  "חיבור לידים ל-CRM והתראות": "automation",
  // פריט 11 (נזרע 16.8, docs/research/a11y-pricing-2026-08.md): הטמעת נגישות היא עבודה מתמשכת
  // על האתר (הצהרה + תיקוני Lighthouse), לא לחיצת כפתור - automation, לא quick_win
  "הנגשת אתר + הצהרת נגישות": "automation",
  // פריטים 12-14 (סבב ה-AI, נזרעו 16.8, docs/research/ai-agents-pricing-2026-08.md): כולם
  // נמכרים כסוכן AI - שלב ai לפי הכלל המורחב למעלה
  "סוכן AI קולי למענה טלפוני": "ai",
  "סוכן AI לתוכן ורשתות חברתיות": "ai",
  "סוכן AI להצעות מחיר": "ai",
  // פריטים 15-17 (סבב אתרים ומערכות, נזרעו 17.8, docs/research/website-and-systems-pricing-2026-08.md):
  // שלושתם הקמת מערכת/נכס מתמשך עם הטמעה אמיתית - automation לפי הכלל העסקי, לא quick_win
  "הקמת אתר ראשון לעסק": "automation",
  "מערכת CRM לניהול לקוחות": "automation",
  "אוטומציה בין המערכות הקיימות": "automation",
  // פריט 18 (נזרע 20.8): עריכת רשומות ב-DNS פעם אחת, מורכבות נמוכה, בלי מערכת מתמשכת
  // מאחוריה - ההגדרה המדויקת של quick_win, ולא רק "זול"
  "הגדרת אימות הדואר (SPF ו-DMARC)": "quick_wins",
  // פריטים 19-20 (התניית ענף, 20.8, docs/research/restaurant-vertical-pricing-2026-08.md):
  // מערכת הזמנות היא הקמת מערכת מתמשכת עם הטמעה אמיתית; תפריט QR הוא הקמה פשוטה בלי
  // שינוי תהליכים, בדיוק כמו כפתור וואטסאפ ופרופיל גוגל
  "מערכת הזמנות ישירות למסעדה": "automation",
  "תפריט דיגיטלי למסעדה": "quick_wins",
};

const DEFAULT_PHASE: Phase = "automation";

export function phaseOf(match: OpportunityMatch): Phase {
  return PHASE_BY_CATALOG_NAME[match.catalog.name] ?? DEFAULT_PHASE;
}

// --- שכבת דירוג: AI מעל הכול (החלטת מייסד, 16.8.2026) ---
// "אני רוצה שכל מה שקשור ל-AI יהיה מעל זה כי זה נמכר הכי טוב" - פריטי שלב "ai" מדורגים מעל כל
// שאר הפריטים, בלי קשר לציון ההזדמנות שלהם. בתוך כל שכבה הסדר הקיים (score יורד, כאב-קודם דרך
// בונוס הכאב שבתוכו, ואז שם קטלוג) נשאר בדיוק כפי שהיה. שלוש נקודות המיון (run-roadmap.ts בצד
// הכתיבה, roadmap-repo.ts בצד הקריאה, report-highlights.ts בבלוק ההפסד של הדוח) משתמשות באותה
// פונקציה הזו כדי שאי אפשר יהיה להזיז שכבה במקום אחד ולשכוח אחר.
// שכבה נמוכה = מוקדם ברשימה; מיון עולה לפי הערך המוחזר.
export function phaseTierOf(phase: Phase): number {
  return phase === "ai" ? 0 : 1;
}
