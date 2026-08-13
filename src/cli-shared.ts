import { searchBusiness } from "./pipeline/google/places";
import type { BusinessCandidate } from "./pipeline/types";

export interface ParsedArgs {
  query: string;
  pick?: number;
  url?: string;
  error?: string; // הודעת שגיאה בעברית — main() בודק ויוצא לפני כל קריאת API כשהיא מוגדרת
}

// מנתח argv ל-query/pick/url; כל דגל עם ערך חסר/לא-תקין נדחה כאן — לפני שנוגעים בשום API חי (Places/PSI)
export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let pickRaw: string | undefined;
  let sawPick = false;
  let url: string | undefined;
  let sawUrl = false;

  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (a === "--pick") {
      sawPick = true;
      pickRaw = args[i + 1];
      args.splice(i, pickRaw !== undefined ? 2 : 1);
      continue;
    }
    const pickEq = a.match(/^--pick=(.*)$/);
    if (pickEq) {
      sawPick = true;
      pickRaw = pickEq[1];
      args.splice(i, 1);
      continue;
    }
    if (a === "--url") {
      sawUrl = true;
      url = args[i + 1];
      args.splice(i, url !== undefined ? 2 : 1);
      continue;
    }
    const urlEq = a.match(/^--url=(.*)$/);
    if (urlEq) {
      sawUrl = true;
      url = urlEq[1];
      args.splice(i, 1);
      continue;
    }
  }

  // --url בלי ערך (או עם ערך ריק) היה משאיר את "--url" עצמו כחלק מה-query — וגורר חיפוש Places
  // חי על המחרוזת "--url". נדחה כאן, לפני כל קריאת API.
  if (sawUrl && !url) {
    return { query: "", error: "--url דורש כתובת: npm run diagnose -- --url https://example.co.il" };
  }
  // אותה בעיה בדיוק ל---pick חסר ערך — נופל היה לתוך ה-query בשקט
  if (sawPick && (pickRaw === undefined || pickRaw === "")) {
    // ניסוח ניטרלי-לפקודה — הפרסר משותף ל-scan ול-diagnose, אסור לנקוב בפקודה הלא-נכונה
    return { query: "", error: "--pick דורש מספר שלם חיובי (למשל: --pick 2)" };
  }

  let pick: number | undefined;
  if (sawPick) {
    const n = Number(pickRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return { query: "", error: `הערך של --pick חייב להיות מספר שלם חיובי (התקבל: "${pickRaw}")` };
    }
    pick = n;
  }

  return { query: args.join(" ").trim(), pick, url };
}

export interface PickResult {
  chosen?: BusinessCandidate;
  printed: string; // מה שמודפס למשתמש (רשימת מועמדים או הודעת שגיאה)
  // כמה מועמדים ואין --pick — לא שגיאה, רק דורש קלט נוסף (cli.ts יוצא בקוד 0 ולא 1)
  ambiguous?: boolean;
}

const MAX_LISTED_CANDIDATES = 5; // תואם להתנהגות ה-cli הקודמת (candidates.slice(0, 5))

// מאתר עסק לפי שאילתה; אם יש כמה מועמדים ואין --pick — מחזיר רשימה להדפסה בלבד
export async function pickCandidate(query: string, pick?: number): Promise<PickResult> {
  const candidates = await searchBusiness(query);
  if (candidates.length === 0) {
    return { printed: "לא נמצא עסק מתאים. נסו לנסח אחרת או להוסיף עיר." };
  }
  if (candidates.length === 1 || pick != null) {
    const index = (pick ?? 1) - 1;
    const chosen = candidates[index];
    if (!chosen) {
      return { printed: `--pick ${pick} מחוץ לטווח (נמצאו ${candidates.length} מועמדים).` };
    }
    return { chosen, printed: "" };
  }
  const lines = candidates.slice(0, MAX_LISTED_CANDIDATES).map((c, i) => {
    const extra = c.rating != null ? ` (⭐ ${c.rating}, ${c.reviewCount ?? 0} ביקורות)` : "";
    return `  ${i + 1}. ${c.name} — ${c.address}${extra}`;
  });
  return {
    printed: `נמצאו כמה מועמדים — הריצו שוב עם --pick <מספר>:\n${lines.join("\n")}`,
    ambiguous: true,
  };
}
