// ניסוח אחיד לסיבת כשל תשתית בבדיקות התקינות (תחקיר 21.8). קוד השגיאה מועדף על ההודעה
// המלאה: הוא קצר, חד-משמעי (ECONNREFUSED, ETIMEDOUT, ESERVFAIL), ולא יכול לגרור חלק
// מגוף תשובה של שרת. משמש את domain-age ואת dns-mail - לכן קובץ משלו ולא עותק בכל מודול
export function shortFailureReason(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.length > 0) return code;
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 120);
}
