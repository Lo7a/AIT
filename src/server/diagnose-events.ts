// אירועי התקדמות של אבחון — מודול טיפוסים בלבד (בלי ייבוא קוד שרת):
// מיובא type-only גם מצד הלקוח של מסך הסריקה החיה
export type DiagnoseStepKey =
  | "details"    // פרטי העסק מגוגל
  | "crawl"      // קריאת האתר
  | "pagespeed"  // בדיקת מהירות
  | "reviews"    // ניתוח ביקורות
  | "score"      // חישוב ציונים ומודל עסק
  | "narrative"  // כתיבת הנרטיב
  | "save";      // שמירה

export type DiagnoseEvent =
  | { type: "created"; diagnosisId: string; businessName: string }
  | { type: "step"; key: DiagnoseStepKey; label: string }
  | { type: "step_done"; key: DiagnoseStepKey; ok: boolean; detail?: string }
  | { type: "done"; diagnosisId: string }
  | { type: "error"; message: string };
