import type { ScanFindings } from "../types";
import type { ScoreReport } from "../score/types";
import { completeJSON, type LlmUsage } from "../llm/client";

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

type CompleteFn = <T>(prompt: string) => Promise<{ data: T; usage: LlmUsage }>;
export interface NarrativeOptions { complete?: CompleteFn; }

const MAX_TEXT_CHARS = 400;

export function extractNumbers(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

// עוזר: מוסיף למאגר המותרים את כל הצורות המקבילות של מספר —
// נקודה/פסיק עשרוני ושני חלקיו (כך ש-"12.7" מתיר גם "12" וגם "7")
function addNumberVariants(n: string, allowed: Set<string>): void {
  allowed.add(n);
  allowed.add(n.replace(".", ","));
  for (const part of n.split(/[.,]/)) allowed.add(part);
}

// המספרים המותרים: על-קבוצה של כל מה שהפרומפט עצמו מציג/מבקש מהמודל להסביר, פחות מנגנונים פנימיים.
// כולל: הממצאים (בלי meta — טלמטריה פנימית כמו durationMs/עלות, לא נתון עסקי, ראו סקירה), הציונים המוצגים,
// טקסטי topGaps/topStrengths (המודל מתבקש להסביר בדיוק אותם — המספרים בהם לגיטימיים),
// קנה המידה הקבוע "100" (ניסוח קנוני "ציון X מתוך 100"), וזמן טעינת ה-LCP בשניות (תצוגת real data נפוצה).
// בכוונה לא כל ה-ScoreReport — הוא מכיל points/weights של חוקים שהיו מכשירים מספרים מומצאים (אזהרת סקירה קודמת)
function allowedNumbers(f: ScanFindings, score: ScoreReport): Set<string> {
  const displayedScores = [
    score.overall,
    ...score.dimensions.map((d) => d.score),
  ].filter((n): n is number => n != null);

  const findingsWithoutMeta = { ...f, meta: undefined }; // meta מכיל טלמטריה פנימית — לא נתון עסקי שמותר לצטט
  const highlightTexts = [...score.topGaps, ...score.topStrengths].map((h) => h.text).join(" ");

  const source = [
    JSON.stringify(findingsWithoutMeta),
    displayedScores.join(" "),
    highlightTexts,
  ].join(" ");

  const allowed = new Set<string>();
  for (const n of extractNumbers(source)) addNumberVariants(n, allowed);

  allowed.add("100"); // קנה המידה — "ציון X מתוך 100" הוא ניסוח קנוני, לא מספר מומצא

  if (f.pageSpeed?.lcpMs != null) {
    // צורת התצוגה של LCP בשניות (ראו sec() ב-dimensions.ts) — real data גם כשהחוק הזה לא בין topGaps/topStrengths
    const lcpSeconds = (f.pageSpeed.lcpMs / 1000).toFixed(1);
    for (const n of extractNumbers(lcpSeconds)) addNumberVariants(n, allowed);
  }

  return allowed;
}

// התאמה סלחנית: אלפים ("4,300"→"4300") ופסיק/נקודה עשרוניים — כל וריאציה שמתאימה למאגר המותרים מספיקה
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

// בנייה מחדש של האובייקט — שדות שהומצאו על ידי המודל לא שורדים (העיקרון של analyze/reviews).
// validRuleKeys: מפתחות חוק אמיתיים מ-topGaps בלבד — ruleKey מומצא (הזיה) נזרק בשקט ולא מגיע לפלט/לצליבה בהמשך
function sanitize(raw: unknown, validRuleKeys: Set<string>): ReportNarrative {
  const r = (raw ?? {}) as Record<string, unknown>;
  const gaps = Array.isArray(r.gapExplanations) ? r.gapExplanations : [];
  return {
    headline: String(r.headline ?? "").trim().slice(0, MAX_TEXT_CHARS),
    summary: String(r.summary ?? "").trim().slice(0, MAX_TEXT_CHARS),
    gapExplanations: gaps
      .map((g) => {
        const e = (g ?? {}) as Record<string, unknown>;
        return {
          ruleKey: String(e.ruleKey ?? "").trim(),
          explanation: String(e.explanation ?? "").trim().slice(0, MAX_TEXT_CHARS),
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
    : "לא נמצאו פערים מובילים — החזר gapExplanations ריק והתמקד במה שעובד טוב.";
  // בלי points — הם שייכים למנגנון הפנימי של הציון, לא לנתון שמותר למודל לצטט (אזהרת סקירה)
  const stripPoints = (h: { dimension: string; ruleKey: string; text: string }) => {
    const { dimension, ruleKey, text } = h;
    return { dimension, ruleKey, text };
  };
  return `אתה יועץ עסקי שכותב נרטיב קצר לדוח אבחון דיגיטלי של עסק ישראלי.
כללים מחייבים:
- אל תמציא מספרים, אחוזים או סכומים. מותר להשתמש אך ורק במספרים שמופיעים בנתונים.
- אל תצטט ביקורות ואל תזכיר שמות של כותבי ביקורות.
- כתוב עברית טבעית, ישירה, בגובה העיניים — בלי סופרלטיבים ריקים.
${sternLine}
החזר JSON בלבד במבנה:
{"headline": "משפט פתיחה אחד חד שמסכם את מצב העסק",
 "summary": "פסקה קצרה (2-3 משפטים) על התמונה הכוללת",
 "gapExplanations": [{"ruleKey": "מפתח הפער כפי שמופיע בנתונים", "explanation": "הסבר של משפט-שניים למה הפער הזה עולה לעסק כסף"}]}

${gapsInstruction}

<<<DATA>>>
עסק: ${JSON.stringify({ name: f.business.name, rating: f.business.rating, reviewCount: f.business.reviewCount })}
ציונים: ${JSON.stringify(score.dimensions.map((d) => ({ key: d.key, label: d.label, score: d.score, dataStatus: d.dataStatus })))}
ציון כולל: ${score.overall}
פערים מובילים: ${JSON.stringify(score.topGaps.map(stripPoints))}
חוזקות: ${JSON.stringify(score.topStrengths.map(stripPoints))}
דגלים: ${JSON.stringify(f.partial)}
<<<END>>>`;
}

export function fallbackNarrative(f: ScanFindings, score: ScoreReport): ReportNarrative {
  const overallLine = score.overall == null
    ? `אין מספיק מידע ציבורי על ${f.business.name} לציון כולל — וזה כשלעצמו ממצא`
    : `${f.business.name}: ציון דיגיטלי ${score.overall} מתוך 100`;
  return {
    headline: overallLine,
    summary: score.topGaps.length > 0
      ? `הפערים המרכזיים שמצאנו: ${score.topGaps.map((g) => g.text).join(" · ")}`
      : "לא מצאנו פערים מהותיים בסריקה הציבורית — בסיס דיגיטלי חזק.",
    gapExplanations: score.topGaps.map((g) => ({ ruleKey: g.ruleKey, explanation: g.text })),
  };
}

export async function generateNarrative(
  f: ScanFindings,
  score: ScoreReport,
  opts: NarrativeOptions = {},
): Promise<NarrativeResult> {
  const complete = opts.complete ?? (completeJSON as CompleteFn);
  const allowed = allowedNumbers(f, score);
  const validRuleKeys = new Set(score.topGaps.map((g) => g.ruleKey));
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (const stern of [false, true]) {
    try {
      const result = await complete<unknown>(buildPrompt(f, score, stern));
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
      };
      const narrative = sanitize(result.data, validRuleKeys);
      // נרטיב ריק (המודל החזיר {}/null/זבל שלא נכנס לשדות) הוא כישלון לכל דבר —
      // לא הצלחה עם headline/summary ריקים שיזלגו לדוח
      const isEmpty = !narrative.headline || !narrative.summary;
      if (!isEmpty && violations(narrative, allowed).length === 0) {
        return { narrative, usage, usedFallback: false };
      }
    } catch {
      break; // כשל תקשורת/מודל — ישר לתבנית
    }
  }
  return { narrative: fallbackNarrative(f, score), usage, usedFallback: true };
}
