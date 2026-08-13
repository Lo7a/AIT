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

// המספרים המותרים: הממצאים עצמם + הציונים המוצגים בלבד.
// בכוונה לא כל ה-ScoreReport — הוא מכיל points/weights של חוקים שהיו מכשירים מספרים מומצאים (אזהרת סקירה 5)
function allowedNumbers(f: ScanFindings, score: ScoreReport): Set<string> {
  const displayedScores = [
    score.overall,
    ...score.dimensions.map((d) => d.score),
  ].filter((n): n is number => n != null);
  const source = JSON.stringify(f) + " " + displayedScores.join(" ");
  const allowed = new Set<string>();
  for (const n of extractNumbers(source)) {
    allowed.add(n);
    allowed.add(n.replace(".", ","));
    // גם חלקי מספר עשרוני מותרים: "12.7" מתיר גם "12" וגם "7"
    for (const part of n.split(/[.,]/)) allowed.add(part);
  }
  return allowed;
}

function violations(n: ReportNarrative, allowed: Set<string>): string[] {
  const texts = [n.headline, n.summary, ...n.gapExplanations.map((g) => g.explanation)];
  return texts.flatMap(extractNumbers).filter((num) => !allowed.has(num));
}

// בנייה מחדש של האובייקט — שדות שהומצאו על ידי המודל לא שורדים (העיקרון של analyze/reviews)
function sanitize(raw: unknown): ReportNarrative {
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
      .filter((g) => g.ruleKey && g.explanation),
  };
}

function buildPrompt(f: ScanFindings, score: ScoreReport, stern: boolean): string {
  const sternLine = stern
    ? "\nאזהרה: בתשובה הקודמת הופיע מספר שלא קיים בנתונים. אסור בתכלית להזכיר אף מספר שלא מופיע בנתונים למטה.\n"
    : "";
  const gapsInstruction = score.topGaps.length > 0
    ? "כתוב הסבר לכל אחד מהפערים המובילים (topGaps) בלבד."
    : "לא נמצאו פערים מובילים — החזר gapExplanations ריק והתמקד במה שעובד טוב.";
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
פערים מובילים: ${JSON.stringify(score.topGaps)}
חוזקות: ${JSON.stringify(score.topStrengths)}
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
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (const stern of [false, true]) {
    try {
      const result = await complete<unknown>(buildPrompt(f, score, stern));
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
      };
      const narrative = sanitize(result.data);
      if (violations(narrative, allowed).length === 0) {
        return { narrative, usage, usedFallback: false };
      }
    } catch {
      break; // כשל תקשורת/מודל — ישר לתבנית
    }
  }
  return { narrative: fallbackNarrative(f, score), usage, usedFallback: true };
}
