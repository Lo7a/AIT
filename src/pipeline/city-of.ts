// גזירת עיר טהורה מכתובת פורמלית ישראלית (מה שגוגל Places מחזיר ב-formattedAddress).
// פורמט טיפוסי: "<רחוב ומספר>, <עיר>[, <מיקוד>], ישראל" - אין API רשמי לפירוק שדות בישראל
// (בניגוד ל-US עם רכיבי כתובת נפרדים), אז גוזרים לפי מבנה הפסיקים.
//
// אלגוריתם: מסירים מקטעי "רעש" מהסוף (מדינה: ישראל/Israel; מיקוד: מקטע שכולו ספרות/מקפים) -
// כתובת עם מיקוד מוסיפה מקטע רביעי שהופך את "המקטע הלפני-אחרון" הנאיבי למיקוד ולא לעיר.
// אחרי הסינון, העיר היא המקטע האחרון שנשאר (בד"כ הרחוב לפניו). פחות משני מקטעים גולמיים,
// או פחות משני מקטעים אחרי הסינון (אין מספיק הקשר להבחין רחוב מעיר) - null.
export function cityOf(address: string): string | null {
  try {
    if (!address) return null;
    const segments = address.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (segments.length < 2) return null;

    const isNoise = (s: string) => /^(ישראל|israel)$/i.test(s) || /^[\d-]+$/.test(s);
    let end = segments.length;
    while (end > 0 && isNoise(segments[end - 1])) end--;
    if (end < 2) return null;

    const city = segments[end - 1];
    return city.length > 0 ? city : null;
  } catch {
    return null;
  }
}
