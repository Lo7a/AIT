import { searchBusiness } from "./pipeline/google/places";
import type { BusinessCandidate } from "./pipeline/types";

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
