// קלט הוא "כתובת אתר" רק אם הוא טוקן יחיד (בלי רווחים) עם נקודה ו-TLD בסופו (לועזי או עברי,
// לתמיכה בדומייני IDN כמו "אתר.ישראל"), או שהוא מתחיל ב-http עם host אחריו.
// "פיצה. משהו" ו-"st. george" הם שמות עסק - יש בהם רווח. "someone@x.com" הוא אימייל, לא
// כתובת אתר - @ מוצא מפורשות מהטוקן. "http://" לבד (בלי host) אינו כתובת תקינה
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return true;
  return !/\s/.test(s) && /^[^\s/@]+\.([a-z]{2,}|[א-ת]{2,})(\/\S*)?$/i.test(s);
}
