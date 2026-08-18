import type { RuleResult, ScoreReport } from "../score/types";

// "מה הבנתי על העסק שלך" - שכבת החיבור של הדוח. בעל העסק כבר יודע את רוב הממצאים הבודדים;
// מה שהוא לא יכול לעשות לבד זה לחבר שניים או שלושה מהם למסקנה אחת. כל תובנה כאן נשענת על
// *שילוב* של אותות מאומתים, מסבירה מה זה אומר לעסק ומצביעה על כיוון.
//
// מודול טהור לחלוטין, בדיוק כמו quick-wins.ts: בלי I/O, בלי Date, בלי random, בלי LLM.
// הקלט היחיד הוא תוצאות החוקים *כפי שהן שמורות* (report.scan.scores) - אותו קלט מחזיר תמיד
// בדיוק את אותו פלט באותו סדר. נתוני הראיון לא נדרשים: הם מגיעים לכאן ממילא בתוך אותו
// ScoreReport (ממד process מנוקד מול מודל העסק), ולכן הם העשרה אופציונלית ולא תנאי כניסה.
//
// כלל הכנות (הכלל הראשון בפרויקט), נאכף מבנית: אות שלילי נחשב רק כשהחוק שלו הוא פער אמיתי -
// known && !earned. חוק שלא נבדק (known=false, מה שהמסך מציג כ"לא נבדק") או חוק שחסר לגמרי
// מהדוח (שורת סריקה ישנה) לא יכול לתרום שום דבר לשום תובנה, לא כשלילה ולא כחיוב. הדרך היחידה
// שחוק כלשהו נכנס לחישוב היא דרך שדות המפתחות למטה, וכל אחד מהם עובר דרך isGap/isEarned
// שדורשות known=true. אין נתיב עוקף - תובנה שחסר לה אות פשוט לא נוצרת.
//
// אין כאן שום מספר: כל מחרוזת היא מסקנה קבועה, לא נתון על העסק. כל כימות (כסף, אחוזים, טווחים)
// שייך לקטלוג הנחקר בלבד.

export interface Insight {
  key: string;
  title: string;     // המסקנה במשפט אחד
  evidence: string[]; // הממצאים הקונקרטיים שהמסקנה נשענת עליהם
  soWhat: string;    // מה זה אומר לעסק
  action: string;    // הכיוון (לא מדריך - הצעדים החינמיים יושבים ב-quick-wins.ts)
}

export const MAX_INSIGHTS = 3;

// שורת ראיה שנוספת רק אם החוק שלה הוא פער אמיתי
interface ConditionalLine { key: string; line: string }

interface InsightRule {
  key: string;
  // חוקים שחייבים להיות ידועים *וגם* הושגו - הצד החיובי של השילוב
  requiresEarned: string[];
  // חוקים שחייבים להיות פער אמיתי (known && !earned) - הצד השלילי של השילוב
  requiresGap: string[];
  // לפחות אחד מאלה חייב להיות פער אמיתי; כל אחד שמתקיים מוסיף את שורת הראיה שלו, בסדר הרשימה
  requiresAnyGap?: ConditionalLine[];
  // העשרה אופציונלית (בפועל: מהראיון) - שורה שמתווספת אם זה פער אמיתי, אך אינה תנאי כניסה
  enrichGap?: ConditionalLine;
  // תובנות שאם כבר נבחרו, זו לא נכנסת - מניעת שתי מסקנות שנשענות על אותם ממצאים
  suppressedBy?: string[];
  title: string;
  evidence: string[];
  soWhat: string;
  action: string;
}

// סדר קבוע = סדר העדיפות בפלט. אין מיון דינמי ואין אקראיות.
// ההיגיון: קודם מה שחוסם פנייה מלהגיע בכלל, אחר כך מה שמכשיל את מי שכבר הגיע, אחר כך מה
// שמונע ממנו להגיע מלכתחילה, ולבסוף מה שנוגע לניהול ולחשיפה. התקרה (MAX_INSIGHTS) שומרת
// על פתיחת דוח חדה - שלוש מסקנות שנקראות, לא רשימה נוספת.
//
// כל המפתחות מ-dimensions.ts: gbp_exists/has_website/perf/lcp (visibility), has_reviews/
// review_volume/rating_good (reputation), phone_available/contact_form/whatsapp/online_booking/
// a11y_statement/site_a11y (accessibility), analytics/fb_pixel/chat_widget/multi_page
// (infrastructure), lead_handling (process, מהראיון).
const INSIGHT_RULES: InsightRule[] = [
  {
    key: "single_door",
    requiresEarned: ["phone_available"],
    requiresGap: ["contact_form", "whatsapp", "online_booking", "chat_widget"],
    // הראיון מוסיף כאן שכבה: כשגם הטיפול בפניות לא מסודר, הדלת היחידה גם לא תמיד נענית
    enrichGap: { key: "lead_handling", line: "התשובות בראיון לא מתארות תהליך מסודר לטיפול בפניות" },
    title: "לעסק יש דלת אחת בלבד, והיא הטלפון",
    evidence: [
      "בסריקה נמצא טלפון נגיש ללקוח",
      "נבדקו ולא נמצאו: טופס יצירת קשר, קישור וואטסאפ, קביעת תור אונליין וצ'אט באתר",
    ],
    soWhat: "מי שמנסה להשיג אותך כשאתה עסוק, בנסיעה או אחרי שעות העבודה נשאר בלי דרך שנייה. אין לו איפה להשאיר פנייה שתחכה לך, והעסק הבא ברשימה נמצא במרחק לחיצה.",
    action: "לבחור ערוץ אחד שקולט פניות גם כשאין מי שיענה, ולתת לו מקום קבוע באתר",
  },
  {
    key: "measuring_no_destination",
    requiresEarned: ["analytics"],
    requiresGap: ["contact_form", "online_booking", "chat_widget"],
    // כשהדלת היחידה כבר נאמרה, אין טעם לחזור על אותם ממצאים במסקנה שנייה
    suppressedBy: ["single_door"],
    title: "יש באתר מדידה, אבל אין בו פעולה שאפשר למדוד",
    evidence: [
      "מותקנת באתר מדידת תנועה",
      "נבדקו ולא נמצאו: טופס יצירת קשר, קביעת תור אונליין וצ'אט באתר",
    ],
    soWhat: "דוח המדידה יראה כניסות, ושום דבר אחרי זה. גולש שהתעניין מגיע לסוף העמוד ואין לו מה ללחוץ, ואתה נשאר עם מספר מבקרים שאי אפשר לדעת מה קרה איתם.",
    action: "להוסיף פעולה אחת ברורה שאפשר גם למדוד, כדי שהנתונים יתחילו לומר משהו",
  },
  {
    key: "profile_carries_business",
    requiresEarned: ["gbp_exists", "rating_good", "has_reviews"],
    requiresAnyGap: [
      { key: "multi_page", line: "באתר נסרקו עמודים בודדים בלבד" },
      { key: "perf", line: "ציון הביצועים של האתר בנייד מתחת ליעד" },
      { key: "lcp", line: "טעינת העמוד הראשי ארוכה מהיעד" },
    ],
    requiresGap: [],
    title: "הפרופיל בגוגל עובד קשה יותר מהאתר",
    evidence: ["הפרופיל בגוגל פעיל, הדירוג בו טוב ויש מספיק ביקורות שמבססות אותו"],
    soWhat: "הנכס שמביא לך אנשים ומייצר אמון הוא הפרופיל, לא האתר. מי שממשיך מהפרופיל אל האתר מקבל שם חוויה חלשה יותר ממה שהובטח לו רגע קודם, וזה בדיוק הרגע שבו הוא מתלבט.",
    action: "לטפל באתר כהמשך ישיר של הפרופיל, ולא כנכס נפרד שחי לבד",
  },
  {
    key: "mobile_first_impression",
    requiresEarned: ["gbp_exists", "has_website"],
    requiresGap: ["perf"],
    // המסקנה על הפרופיל כבר כוללת את אותו ממצא ביצועים
    suppressedBy: ["profile_carries_business"],
    title: "מי שנכנס לאתר מהטלפון פוגש עמוד איטי",
    evidence: [
      "בדיקת המהירות רצה בסימולציית נייד, והציון יצא מתחת ליעד",
      "לעסק יש גם פרופיל פעיל במפות גוגל וגם אתר",
    ],
    soWhat: "העמוד האיטי הוא הרושם הראשון של מי שנכנס מהטלפון, עוד לפני שראה מה אתה מציע. מבקרים במובייל נוטים לנטוש לפני שהעמוד בכלל נפתח.",
    action: "לטפל במהירות העמוד הראשי בנייד לפני שמשקיעים בתוכן חדש או בפרסום",
  },
  {
    key: "happy_but_invisible",
    requiresEarned: ["rating_good", "has_reviews"],
    requiresGap: ["review_volume"],
    title: "הלקוחות מרוצים, וכמעט אף אחד לא רואה את זה",
    evidence: [
      "הדירוג בגוגל טוב",
      "מספר הביקורות נמוך",
    ],
    soWhat: "לקוח שמשווה בינך לבין העסק שלידך רואה קודם כמה אנשים כתבו, ורק אחר כך מה הם כתבו. הרושם הטוב שכבר יצרת בפועל לא מגיע אליו.",
    action: "להפוך בקשת ביקורת לחלק קבוע מסיום העבודה מול לקוח מרוצה",
  },
  {
    key: "working_blind",
    requiresEarned: ["has_website", "multi_page"],
    requiresGap: ["analytics", "fb_pixel"],
    title: "יש אתר עם תוכן, ואין שום דרך לדעת מה קורה בו",
    evidence: [
      "באתר נסרקו כמה עמודים עם תוכן",
      "נבדקו ולא נמצאו: מדידת תנועה ופיקסל פייסבוק",
    ],
    soWhat: "כל החלטה על פרסום, על עמוד או על מבצע מתקבלת מהתחושה. אי אפשר לדעת מאיפה הגיעו הלקוחות שכן הגיעו, ולכן גם אי אפשר לחזור על מה שעבד.",
    action: "לחבר מדידה עוד לפני ההוצאה השיווקית הבאה, כדי שיהיה למה להשוות אחריה",
  },
  {
    key: "accessibility_exposure",
    requiresEarned: ["has_website"],
    requiresGap: ["a11y_statement", "site_a11y"],
    title: "האתר גם לא נגיש בפועל וגם בלי הצהרת נגישות",
    evidence: [
      "בדיקת הנגישות האוטומטית מצאה ליקויים באתר",
      "לא נמצאה הצהרת נגישות באתר",
    ],
    soWhat: "החוק בישראל מחייב אתרים של עסקים בנגישות וגם בהצהרה שמתארת את מצב האתר. שני החלקים חסרים כאן יחד. מעבר לחשיפה, גולש שלא מצליח להשתמש באתר הוא לקוח שלא הצליח לקנות.",
    action: "לתקן את הליקויים שהבדיקה מצאה, ורק אז לפרסם הצהרה שמתארת את המצב האמיתי",
  },
];

// אינדוקס תוצאות החוקים לפי מפתח - מראה quick-wins.ts. מפתח שמופיע ביותר מממד אחד (לא קורה
// היום) - הראשון קובע, כדי שהפונקציה תישאר דטרמיניסטית גם אם ההגדרות ישתנו
function indexRules(scores: ScoreReport): Map<string, RuleResult> {
  const index = new Map<string, RuleResult>();
  for (const dimension of scores.dimensions) {
    for (const rule of dimension.rules) {
      if (!index.has(rule.key)) index.set(rule.key, rule);
    }
  }
  return index;
}

// שתי השאלות היחידות שמותר לשאול על חוק, ושתיהן דורשות known=true. חוק חסר מהדוח מחזיר
// false בשתיהן - "לא ידוע" הוא לא ראיה, לא לכאן ולא לכאן
function isGap(index: Map<string, RuleResult>, key: string): boolean {
  const rule = index.get(key);
  return rule != null && rule.known && !rule.earned;
}

function isEarned(index: Map<string, RuleResult>, key: string): boolean {
  const rule = index.get(key);
  return rule != null && rule.known && rule.earned;
}

export function insights(scores: ScoreReport | null, limit = MAX_INSIGHTS): Insight[] {
  if (!scores) return [];
  const index = indexRules(scores);

  const out: Insight[] = [];
  const fired = new Set<string>();
  for (const rule of INSIGHT_RULES) {
    if (out.length >= limit) break;
    if (rule.suppressedBy?.some((key) => fired.has(key))) continue;
    if (!rule.requiresEarned.every((key) => isEarned(index, key))) continue;
    if (!rule.requiresGap.every((key) => isGap(index, key))) continue;

    const anyLines = (rule.requiresAnyGap ?? []).filter((c) => isGap(index, c.key)).map((c) => c.line);
    if (rule.requiresAnyGap != null && anyLines.length === 0) continue;
    const enrichLines = rule.enrichGap != null && isGap(index, rule.enrichGap.key) ? [rule.enrichGap.line] : [];

    out.push({
      key: rule.key,
      title: rule.title,
      evidence: [...rule.evidence, ...anyLines, ...enrichLines],
      soWhat: rule.soWhat,
      action: rule.action,
    });
    fired.add(rule.key);
  }
  return out;
}
