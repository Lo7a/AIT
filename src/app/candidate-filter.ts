import type { BusinessCandidate } from "../pipeline/types";

// סינון טהור לרשימת מועמדים שחזרה ממפות: תת-מחרוזת על שם + כתובת יחד, כדי שסינון לפי רחוב
// או עיר יעבוד בדיוק כמו סינון לפי שם. toLowerCase לא משנה עברית אבל הופך את ההתאמה ללא-תלוית-
// רישיות עבור טקסט לועזי (שם מותג באנגלית בתוך כתובת עברית וכד'). שאילתה ריקה (אחרי trim) =
// כל הרשימה כמות שהיא, בדיוק כמו לפני שהמשתמש הקליד משהו בשדה הסינון
export function filterCandidates(candidates: BusinessCandidate[], query: string): BusinessCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter((c) => `${c.name} ${c.address}`.toLowerCase().includes(q));
}
