// תוויות ופורמטים המשותפים למסכי הניהול. יושבים בקובץ אחד כי אותה תווית מופיעה בשני
// מסכים (סוג אירוע בסקירה וביומן) - שני עותקים היו נפרדים בתיקון הראשון

// תוויות עברית לסוגי אירועי היומן (usage-events.ts) - סוג לא מוכר מוצג כמו שהוא
export const EVENT_LABEL: Record<string, string> = {
  login: "כניסה",
  search: "חיפוש עסק",
  diagnosis_created: "אבחון נוצר",
  scan_completed: "סריקה הושלמה",
  interview_started: "ראיון התחיל",
  interview_answer: "תשובת ראיון",
  interview_finished: "ראיון הסתיים",
  roadmap_built: "Roadmap נבנה",
  brief_sent: "Brief נשלח",
  report_viewed: "צפייה בדוח",
  roadmap_viewed: "צפייה ב-Roadmap",
  impersonation_started: "התחזות התחילה",
  impersonation_stopped: "התחזות הסתיימה",
  settings_changed: "הגדרה עודכנה",
  catalog_changed: "ספריית השירותים עודכנה",
};

// תוויות עברית למגבלות הניתנות לעריכה (rate-limit.ts) - הסדר כאן הוא סדר התצוגה
export const SETTING_LABEL: Record<string, string> = {
  "rate.scan": "סריקות לשעה למשתמש",
  "rate.search": "חיפושים לשעה למשתמש",
  "rate.interviewMessage": "תשובות ראיון לשעה למשתמש",
  "rate.roadmapBuild": "בניות Roadmap לשעה למשתמש",
  "rate.brief": "שליחות Brief לשעה למשתמש",
  "global.scansPerDay": "סריקות ליום, כל המערכת יחד (הבלם הגלובלי)",
};

export const DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });
