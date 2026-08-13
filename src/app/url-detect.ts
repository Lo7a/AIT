// קלט הוא "כתובת אתר" רק אם הוא טוקן יחיד (בלי רווחים) עם נקודה ו-TLD בסופו,
// או שהוא מתחיל ב-http. "פיצה. משהו" ו-"st. george" הם שמות עסק — יש בהם רווח
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  return !/\s/.test(s) && /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(s);
}
