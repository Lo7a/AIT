import type { ScanFindings } from "../types";
import type { ScoreReport } from "../score/types";
import { completeJSON, stripFenceMarkers, type LlmUsage } from "../llm/client";
import { normalizeTypography } from "../interview/extract";

export interface GapExplanation { ruleKey: string; explanation: string; }
export interface ReportNarrative {
  headline: string;
  summary: string;
  gapExplanations: GapExplanation[];
}
export interface NarrativeResult {
  narrative: ReportNarrative;
  usage: LlmUsage;
  usedFallback: boolean;
}

// לא גנרי בכוונה - generateNarrative תמיד קורא ל-complete בלי לפרמט T (הטיפוס האמיתי מגיע מ-sanitize),
// אז הגנריות לא הוסיפה בטיחות, רק חייבה כל מוק בבדיקות לעבור דרך `as never` (14 מקומות, סקירת קוד)
export type CompleteFn = (prompt: string) => Promise<{ data: unknown; usage: LlmUsage }>;
export interface NarrativeOptions { complete?: CompleteFn; }

const MAX_TEXT_CHARS = 400;

export function extractNumbers(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

// עוזר: מוסיף למאגר המותרים את הצורות המקבילות של אותו מספר - נקודה/פסיק עשרוני וניקוי
// פסיקי אלפים ("1,500"→"1500", כך שגם אם הנתון המקורי כתוב עם פסיק אלפים המודל שמצטט אותו
// בלי פסיק לא יידחה). בכוונה בלי פיצול לחלקי המספר: "4.2" אינו מכשיר "4" ערום ו-"12.7" אינו
// מכשיר "7" - הפיצול הזה היה חצי מהחור שדרכו עברו מספרים מומצאים
function addNumberVariants(n: string, allowed: Set<string>): void {
  allowed.add(n);
  allowed.add(n.replace(".", ","));
  allowed.add(n.replace(/,/g, ""));
}

// המספרים המותרים נבנים מרשימה מפורשת של הערכים שבאמת מוצגים למשתמש בדוח, ולא מסריאליזציה
// גורפת של הממצאים. הבאג שתוקן: JSON.stringify(findings) הכניס למאגר כל רצף ספרות שמופיע
// בכתובות שנסרקו (crawledUrls), וכתובת כמו /blog/2019/promo-8500 הכשירה גם "8500 שקלים"
// וגם "2019" מומצאים לגמרי.
// הרשימה: הציון הכולל וציון כל ממד, הדירוג בצורתו המוצגת ("4.2"), מספר הביקורות, ציוני PSI,
// LCP במילישניות ובשניות (הצורה ש-sec() ב-dimensions.ts מציג), מספר העמודים שנסרקו, ספרות
// שבתוך שם העסק (מוצג כלשונו בכותרת הדוח ובתבנית ה-fallback), וקנה המידה הקבוע 100.
// בנוסף - טקסטי topGaps/topStrengths, שהם בדיוק המשפטים שהדוח מציג והמודל מתבקש להסביר
// (הספים שבתוכם, כמו "היעד של 70" או "רף האמון של 4.2", לגיטימיים לציטוט).
// meta (טלמטריה: durationMs/עלות) ו-points/weights של חוקים אינם ברשימה - לא נתון עסקי,
// והפעם זה נכון מעצם הבנייה ולא בזכות סינון בדיעבד
function allowedNumbers(f: ScanFindings, score: ScoreReport): Set<string> {
  const displayed: (number | string | null | undefined)[] = [
    score.overall,
    ...score.dimensions.map((d) => d.score),
    f.business.name,
    f.business.rating,
    f.business.reviewCount,
    f.pageSpeed?.performanceScore,
    f.pageSpeed?.seoScore,
    f.pageSpeed?.lcpMs,
    f.pageSpeed?.lcpMs != null ? (f.pageSpeed.lcpMs / 1000).toFixed(1) : undefined,
    // כשיש מדידת שדה היא זו שמוצגת בטקסט החוק (dimensions.ts), אז היא חייבת להיות מותרת לציטוט
    f.pageSpeed?.field?.lcpMs,
    f.pageSpeed?.field?.lcpMs != null ? (f.pageSpeed.field.lcpMs / 1000).toFixed(1) : undefined,
    f.websiteSignals?.pagesCrawled,
    100,
    // המשפטים שהדוח מציג כלשונם והמודל מתבקש להסביר בדיוק אותם
    [...score.topGaps, ...score.topStrengths].map((h) => h.text).join(" "),
  ];

  const allowed = new Set<string>();
  for (const value of displayed) {
    if (value == null) continue;
    for (const n of extractNumbers(String(value))) addNumberVariants(n, allowed);
  }
  return allowed;
}

// התאמה סלחנית: אלפים ("4,300"→"4300") ופסיק/נקודה עשרוניים - כל וריאציה שמתאימה למאגר המותרים מספיקה
function isAllowed(token: string, allowed: Set<string>): boolean {
  return (
    allowed.has(token) ||
    allowed.has(token.replace(/,/g, "")) ||
    allowed.has(token.replace(",", ".")) ||
    allowed.has(token.replace(".", ","))
  );
}

function violations(n: ReportNarrative, allowed: Set<string>): string[] {
  const texts = [n.headline, n.summary, ...n.gapExplanations.map((g) => g.explanation)];
  return texts.flatMap(extractNumbers).filter((num) => !isAllowed(num, allowed));
}

// בנייה מחדש של האובייקט - שדות שהומצאו על ידי המודל לא שורדים (העיקרון של analyze/reviews).
// validRuleKeys: מפתחות חוק אמיתיים מ-topGaps בלבד - ruleKey מומצא (הזיה) נזרק בשקט ולא מגיע לפלט/לצליבה בהמשך.
// normalizeTypography על כל שדה טקסט (תוקן 16.8): הנרטיב היה הפלט היחיד של LLM שלא עבר את
// הנרמול - מקף ארוך שהמודל פולט היה נשמר ל-DB ומוצג, בניגוד לכלל הברזל על תווים אסורים
function sanitize(raw: unknown, validRuleKeys: Set<string>): ReportNarrative {
  const r = (raw ?? {}) as Record<string, unknown>;
  const gaps = Array.isArray(r.gapExplanations) ? r.gapExplanations : [];
  return {
    headline: normalizeTypography(String(r.headline ?? "").trim()).slice(0, MAX_TEXT_CHARS),
    summary: normalizeTypography(String(r.summary ?? "").trim()).slice(0, MAX_TEXT_CHARS),
    gapExplanations: gaps
      .map((g) => {
        const e = (g ?? {}) as Record<string, unknown>;
        return {
          ruleKey: String(e.ruleKey ?? "").trim(),
          explanation: normalizeTypography(String(e.explanation ?? "").trim()).slice(0, MAX_TEXT_CHARS),
        };
      })
      .filter((g) => g.ruleKey && g.explanation && validRuleKeys.has(g.ruleKey)),
  };
}

function buildPrompt(f: ScanFindings, score: ScoreReport, stern: boolean): string {
  const sternLine = stern
    ? "\nאזהרה: בתשובה הקודמת הופיע מספר שלא קיים בנתונים. אסור בתכלית להזכיר אף מספר שלא מופיע בנתונים למטה.\n"
    : "";
  const gapsInstruction = score.topGaps.length > 0
    ? "כתוב הסבר לכל אחד מהפערים המובילים (topGaps) בלבד."
    : "לא נמצאו פערים מובילים - החזר gapExplanations ריק והתמקד במה שעובד טוב.";
  // בלי points - הם שייכים למנגנון הפנימי של הציון, לא לנתון שמותר למודל לצטט (אזהרת סקירה)
  const stripPoints = (h: { dimension: string; ruleKey: string; text: string }) => {
    const { dimension, ruleKey, text } = h;
    return { dimension, ruleKey, text };
  };
  // שם העסק מגיע מ-Places (מקור חיצוני) - מסירים ממנו תווי תיחום לפני שהוא נכנס לבלוק הנתונים.
  // JSON.stringify מגן על מרכאות אבל לא על <<<END>>>, ובלי הניקוי שם עסק עוין היה סוגר את הבלוק
  // והשאר שלו היה יושב במיקום הוראה (אותו משטר כמו analyze/reviews ו-interview/extract)
  const safeName = stripFenceMarkers(f.business.name);
  // אזהרה לעריכה עתידית: כל שורת נתונים חדשה שתתווסף לבלוק <<<DATA>>>...<<<END>>> למטה וכוללת מספר -
  // חייבת להיות מכוסה גם ב-allowedNumbers למעלה, אחרת השומר ידחה מספר שהפרומפט עצמו הציג למודל,
  // והדוח ייפול בשקט לתבנית (usedFallback: true) בלי שום שגיאה גלויה.
  return `אתה יועץ עסקי שכותב נרטיב קצר לדוח אבחון דיגיטלי של עסק ישראלי.
כללים מחייבים:
- אל תמציא מספרים, אחוזים או סכומים. מותר להשתמש אך ורק במספרים שמופיעים בנתונים.
- אל תצטט ביקורות ואל תזכיר שמות של כותבי ביקורות.
- כתוב עברית טבעית, ישירה, בגובה העיניים - בלי סופרלטיבים ריקים.
${sternLine}
החזר JSON בלבד במבנה:
{"headline": "משפט פתיחה אחד חד שמסכם את מצב העסק",
 "summary": "פסקה קצרה (2-3 משפטים) על התמונה הכוללת",
 "gapExplanations": [{"ruleKey": "מפתח הפער כפי שמופיע בנתונים", "explanation": "הסבר של משפט-שניים למה הפער הזה עולה לעסק כסף"}]}

${gapsInstruction}

<<<DATA>>>
עסק: ${JSON.stringify({ name: safeName, rating: f.business.rating, reviewCount: f.business.reviewCount })}
ציונים: ${JSON.stringify(score.dimensions.map((d) => ({ key: d.key, label: d.label, score: d.score, dataStatus: d.dataStatus })))}
ציון כולל: ${score.overall}
פערים מובילים: ${JSON.stringify(score.topGaps.map(stripPoints))}
חוזקות: ${JSON.stringify(score.topStrengths.map(stripPoints))}
דגלים: ${JSON.stringify(f.partial)}
<<<END>>>`;
}

export function fallbackNarrative(f: ScanFindings, score: ScoreReport): ReportNarrative {
  const overallLine = score.overall == null
    ? `אין מספיק מידע ציבורי על ${f.business.name} לציון כולל, וזה כשלעצמו ממצא`
    : `${f.business.name}: ציון דיגיטלי ${score.overall} מתוך 100`;
  return {
    headline: overallLine,
    summary: score.topGaps.length > 0
      ? `הפערים המרכזיים שמצאנו: ${score.topGaps.map((g) => g.text).join(" · ")}`
      : "לא מצאנו פערים מהותיים בסריקה הציבורית. בסיס דיגיטלי חזק.",
    gapExplanations: score.topGaps.map((g) => ({ ruleKey: g.ruleKey, explanation: g.text })),
  };
}

export async function generateNarrative(
  f: ScanFindings,
  score: ScoreReport,
  opts: NarrativeOptions = {},
): Promise<NarrativeResult> {
  // תיוג הקשר לארכיון הקריאות - רק כשנופלים ל-completeJSON האמיתי (complete מוזרק לא מדווח)
  const complete = opts.complete
    ?? ((prompt: string) => completeJSON<unknown>(prompt, { context: "narrative" }));
  const allowed = allowedNumbers(f, score);
  const validRuleKeys = new Set(score.topGaps.map((g) => g.ruleKey));
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (const stern of [false, true]) {
    try {
      const result = await complete(buildPrompt(f, score, stern));
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
      };
      const narrative = sanitize(result.data, validRuleKeys);
      // נרטיב ריק (המודל החזיר {}/null/זבל שלא נכנס לשדות) הוא כישלון לכל דבר -
      // לא הצלחה עם headline/summary ריקים שיזלגו לדוח
      const isEmpty = !narrative.headline || !narrative.summary;
      if (!isEmpty && violations(narrative, allowed).length === 0) {
        return { narrative, usage, usedFallback: false };
      }
    } catch {
      break; // כשל תקשורת/מודל - ישר לתבנית
    }
  }
  return { narrative: fallbackNarrative(f, score), usage, usedFallback: true };
}
