// מנרמל כתובת אתר לקנוני: מוסיף https, דוחה סכמות שאינן http/https. משותף לסריקה, ל-CLI (משימה 12) ול-UI (2ב)
export function normalizeSiteUrl(input: string): URL {
  const trimmed = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    throw new Error(`כתובת לא נתמכת (רק http/https): ${trimmed.slice(0, 80)}`);
  }
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProto); // URL לא-תקין זורק כאן — כישלון מוקדם וברור עדיף על סריקה של זבל
}
