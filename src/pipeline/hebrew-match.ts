// התאמת מילות מפתח בעברית - מודול משותף. חולץ מ-roadmap/matching.ts ב-20.8 כשזיהוי הענף
// (industry.ts) נזקק בדיוק לאותה לוגיקה, ולפי כלל השימוש החוזר: הרחבה של מה שקיים, לא
// גרסה שנייה. matching.ts ממשיך להשתמש בו דרך הייבוא, בלי שינוי התנהגות.
//
// למה בכלל צריך את זה, ולא includes: המקרה שהפיל בדיקה אמיתית הוא **"שרברב" מכיל "בר"**.
// חיפוש תת-מחרוזת תמים היה מסווג אינסטלטור כמסעדה. שתי בעיות עברית נפרדות מטופלות כאן:
//
// 1. **אות סופית שוברת חיפוש גזע.** "תיאומים" לא מכיל את "תיאום" ו"טלפונים" לא מכיל את
//    "טלפון" - מ' סופית ונ' סופית הן תווים אחרים לגמרי. מנרמלים בשני הצדדים.
// 2. **ל-\b של JS אין מושג בעברית** (הוא מכיר ASCII בלבד), ולכן גבול המילה נבנה ידנית:
//    לפני הגזע מותרות תחיליות נצמדות (ו/ה/ב/כ/ל/מ/ש, עד שתיים - "והתורים", "מהטלפון"),
//    ואחריו רק סיומת ריבוי. בלי הגבול "תורנות" ו"תורה" היו נספרים כ"תור".

const FINAL_LETTERS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

export const normalizeFinals = (s: string): string => s.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]);

const HEBREW_PREFIXES = "[והבכלמש]{0,2}";
const PLURAL_SUFFIX = "(?:ימ|ות)?"; // אחרי נרמול הסופיות צורת הרבים של "תור" היא "תורימ"

// בלי דגל g בכוונה: הוא היה שומר lastIndex בין קריאות ל-test והופך את ההתאמה ללא-דטרמיניסטית
export const compileKeyword = (keyword: string): RegExp =>
  new RegExp(`(?<![א-ת])${HEBREW_PREFIXES}${normalizeFinals(keyword)}${PLURAL_SUFFIX}(?![א-ת])`);

/** האם אחת ממילות המפתח מופיעה בטקסט, עם גבולות מילה עבריים. הטקסט מנורמל כאן פעם אחת. */
export function matchesAnyKeyword(text: string, patterns: readonly RegExp[]): boolean {
  const normalized = normalizeFinals(text);
  return patterns.some((re) => re.test(normalized));
}
