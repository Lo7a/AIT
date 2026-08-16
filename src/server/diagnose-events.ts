// אירועי התקדמות של אבחון - מודול טיפוסים בלבד (בלי ייבוא קוד שרת):
// מיובא type-only גם מצד הלקוח של מסך הסריקה החיה
//
// בעלות ("who emits what"): runDiagnosis (src/server/run-diagnosis.ts) פולט created/step/step_done/done
// בלבד - הוא לעולם לא פולט error בעצמו; error שמור לשכבת התחבורה (ה-handler שמזרים את האירועים
// החוצה, למשל route שהופך אותם ל-SSE) כשהיא תופסת חריגה שיצאה מ-runDiagnosis (למשל DiagnoseFailed).
//
// חוזה הצרכן: onEvent חייב להיות סינכרוני (לא async - runDiagnosis לא ממתין לו) ולעולם לא אמור לזרוק.
// runDiagnosis עוטף כל קריאה ל-onEvent ב-try/catch כהגנה (ראו emit ב-run-diagnosis.ts) כדי שצרכן שנופל
// (למשל enqueue לזרם אחרי שהלקוח התנתק) לא יהפוך לדגל כישלון שקרי בממצאים - אבל זו רשת ביטחון, לא רישיון:
// צרכן שזורק בכל קריאה עדיין מאבד את כל האירועים שאחריו.
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
