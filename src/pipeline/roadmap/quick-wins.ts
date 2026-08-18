import type { RuleResult, ScoreReport } from "../score/types";

// "מה אפשר לעשות כבר עכשיו" - צעדים חינמיים שבעל העסק יכול לבצע לבד היום, נגזרים אך ורק
// מאותות שכבר זוהו בסריקה. מודול טהור לחלוטין: בלי I/O, בלי Date, בלי random, בלי LLM -
// חוקים סטטיים מעל תוצאות החוקים השמורות (report.scan.scores), בדיוק כמו report-highlights.ts.
//
// כלל הכנות (הכלל הראשון בפרויקט): צעד נוצר רק כשהחוק המתאים הוא פער *אמיתי* -
// known && !earned. חוק שלא נבדק (known=false, מה שהמסך מציג כ"לא נבדק") לעולם לא מייצר
// צעד, כי אז היינו ממליצים למישהו לתקן משהו שאולי כבר קיים אצלו ופשוט לא ראינו אותו
// (אתר SPA שהטופס שלו מרונדר בדפדפן - ראו knownCrawlNegative ב-dimensions.ts).
//
// אין כאן שום מספר: כל טקסט הוא הוראה קבועה, לא נתון על העסק. חישובי כסף/זמן שייכים
// לקטלוג הנחקר (opportunity_catalog) ולא לצעדים החינמיים.

export interface QuickWin {
  key: string;
  title: string; // הפעולה עצמה
  why: string;   // מה זה משנה לעסק
  how: string;   // הצעד הראשון הקונקרטי שאפשר לעשות לבד
}

export const MAX_QUICK_WINS = 4;

interface QuickWinRule extends QuickWin {
  // כל המפתחות ברשימה חייבים להיות פער אמיתי (known && !earned) כדי שהצעד יופיע.
  // רשימה עם יותר ממפתח אחד = תנאי "וגם" (contact_way: אין טופס וגם אין טלפון נגיש)
  requiresGap: string[];
}

// סדר קבוע = סדר העדיפות בפלט. אין מיון דינמי ואין אקראיות: אותו דוח מחזיר תמיד בדיוק
// את אותם צעדים באותו סדר. הסדר: קודם מה שנמצא מחוץ לאתר ולוקח דקות (פרופיל גוגל), אחר כך
// חסימות פנייה באתר, ולבסוף צעדים שמצריכים ישיבה קצרה מול מערכת האתר.
//
// מפתחות החוקים כולם מ-dimensions.ts: gbp_exists/gbp_phone (visibility), contact_form/
// phone_available/whatsapp/a11y_statement (accessibility), has_reviews (reputation),
// analytics (infrastructure)
const QUICK_WIN_RULES: QuickWinRule[] = [
  {
    key: "gbp_create",
    requiresGap: ["gbp_exists"],
    title: "לפתוח פרופיל עסק בגוגל",
    why: "פרופיל פעיל מציב את העסק בתוצאות ובמפות מול לקוחות שמחפשים בסביבה",
    how: "נכנסים ל-Google Business Profile, פותחים כרטיס עם שם העסק, כתובת, טלפון ותחום עיסוק, ומתחילים את אימות הבעלות",
  },
  {
    key: "gbp_phone",
    requiresGap: ["gbp_phone"],
    title: "להוסיף טלפון לפרופיל בגוגל",
    why: "מספר בפרופיל הופך חיפוש במפות לשיחה, בלי שהלקוח יחפש דרך אחרת להשיג את העסק",
    how: "בעריכת הפרופיל בגוגל פותחים את פרטי הקשר, ממלאים את מספר הטלפון של העסק ושומרים",
  },
  {
    key: "contact_way",
    requiresGap: ["contact_form", "phone_available"],
    title: "לשים דרך אחת ברורה ליצירת קשר באתר",
    why: "דרך פנייה גלויה הופכת גולש מתעניין לפנייה, במקום שיצא מהאתר בלי להשאיר כלום",
    how: "מוסיפים בראש עמוד הבית מספר טלפון כקישור לחיץ, או טופס קצר עם שם, טלפון והודעה",
  },
  {
    key: "whatsapp_link",
    requiresGap: ["whatsapp"],
    title: "להוסיף כפתור וואטסאפ לאתר",
    why: "קישור וואטסאפ מוריד את החיכוך בפנייה, זה הערוץ שלקוחות בישראל מנסים ראשון",
    how: "בונים קישור wa.me עם מספר העסק בקידומת הבינלאומית של ישראל, ומציבים אותו בתפריט האתר ובעמוד יצירת הקשר",
  },
  {
    key: "ask_reviews",
    requiresGap: ["has_reviews"],
    title: "לבקש ביקורות מלקוחות מרוצים",
    why: "ביקורות טריות הן מה שלקוח חדש קורא לפני שהוא בוחר בין העסק לבין מי שלידו",
    how: "מעתיקים מפרופיל העסק בגוגל את הקישור לכתיבת ביקורת, ושולחים אותו בוואטסאפ ללקוחות האחרונים שהיו מרוצים",
  },
  {
    key: "a11y_statement",
    requiresGap: ["a11y_statement"],
    title: "לפרסם הצהרת נגישות באתר",
    why: "הצהרת נגישות סוגרת חשיפה משפטית שעסקים בישראל נתבעים עליה בפועל",
    how: "מוסיפים עמוד הצהרת נגישות עם פרטי רכז הנגישות ודרכי פנייה, ומקשרים אליו מתחתית כל עמוד",
  },
  {
    key: "analytics_basic",
    requiresGap: ["analytics"],
    title: "לחבר מדידה בסיסית לאתר",
    why: "מדידה מראה כמה אנשים מגיעים לאתר ומאיפה, במקום להחליט על שיווק באפלה",
    how: "פותחים חשבון Google Analytics בחינם ומחברים את קוד המדידה בהגדרות המערכת שבה בנוי האתר",
  },
];

// אינדוקס תוצאות החוקים לפי מפתח. מפתח שמופיע ביותר מממד אחד (לא קורה היום) - הראשון קובע,
// כדי שהפונקציה תישאר דטרמיניסטית גם אם ההגדרות ישתנו
function indexRules(scores: ScoreReport): Map<string, RuleResult> {
  const index = new Map<string, RuleResult>();
  for (const dimension of scores.dimensions) {
    for (const rule of dimension.rules) {
      if (!index.has(rule.key)) index.set(rule.key, rule);
    }
  }
  return index;
}

// פער אמיתי בלבד: החוק נבדק (known) ולא הושג. חוק חסר לגמרי מהדוח (שורת סריקה ישנה שנוקדה
// לפני שהחוק נולד) נחשב "לא נבדק" ולא מייצר צעד - אותה החמרה בדיוק
function isGap(index: Map<string, RuleResult>, key: string): boolean {
  const rule = index.get(key);
  return rule != null && rule.known && !rule.earned;
}

export function quickWins(scores: ScoreReport | null, limit = MAX_QUICK_WINS): QuickWin[] {
  if (!scores) return [];
  const index = indexRules(scores);

  const wins: QuickWin[] = [];
  for (const rule of QUICK_WIN_RULES) {
    if (wins.length >= limit) break;
    if (!rule.requiresGap.every((key) => isGap(index, key))) continue;
    wins.push({ key: rule.key, title: rule.title, why: rule.why, how: rule.how });
  }
  return wins;
}
