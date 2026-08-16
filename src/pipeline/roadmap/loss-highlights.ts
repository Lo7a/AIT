import type { OpportunityMatch } from "./matching";

// "מה מונח על השולחן" - שלב א' ("loss leads, score measures", החלטת מייסד נעולה): מודול טהור
// לחלוטין - בלי I/O, בלי Date/random, בלי תלות בשרת. שולף מתוך OpportunityMatch-ים שכבר ממוינים
// (הקורא - report-highlights.ts למסך הדוח, roadmap-logic.ts למסך ה-Roadmap - אחראי לסדר; הפונקציה
// הזו לא ממיינת מחדש) את שורות ה-savingRange כלשונן מהקטלוג הנחקר. כלל הכנות (as-built): הטקסט
// תמיד verbatim - לעולם לא מחושב/מסוכם/מנוסח מחדש, אותו עיקרון "אפס מספרים מומצאים" כמו
// RoadmapItemView (roadmap-repo.ts).

export interface LossHighlight {
  itemName: string;
  text: string;
}

// limit הוא מספר קווי האובדן הרצויים בפלט (אחרי דדופ), לא תקרה על כמות ה-matches שנסרקים: שני
// פריטים מובילים עם savingRange זהה מילה-במילה לא אמורים "לגזול" את המקום השלישי מפריט אמיתי
// שונה - ממשיכים לסרוק את matches עד שנאספו limit קווים ייחודיים או שנגמרו ההתאמות.
export function lossHighlights(matches: OpportunityMatch[], limit = 3): LossHighlight[] {
  const seenTexts = new Set<string>();
  const highlights: LossHighlight[] = [];

  for (const match of matches) {
    if (highlights.length >= limit) break;
    const text = match.catalog.savingRange;
    if (seenTexts.has(text)) continue;
    seenTexts.add(text);
    highlights.push({ itemName: match.catalog.name, text });
  }

  return highlights;
}
