// חוזה שגיאות הראיון: מודול טהור בלי שום ייבוא משרת (בלי prisma, בלי DB) - בטוח לגמרי גם
// בחבילת הלקוח. use-interview-chat.ts מייבא ממנו את NOT_ACTIVE_MESSAGE כדי להשוות טקסט שגיאה
// מדויק מול השרת בלי לייבא את run-interview.ts עצמו (שתלוי בפריזמה ולא שייך לחבילת לקוח).
//
// InterviewError.kind הוא המקור היחיד לקוד הסטטוס ב-HTTP (ראו interview-handlers.ts) - במקום
// היוריסטיקת regex על תוכן ההודעה (בדיקת "יש תווי עברית בהודעה" הייתה יכולה למפות בטעות שגיאת
// תשתית שמכילה עברית - למשל שם עסק - ל-400 עם דליפת פרטים, ו-"לא נמצא"/"מעבר סטטוס" בכל מקום
// בהודעה יכלו להתאים בטעות למחרוזת לא-קשורה)
export class InterviewError extends Error {
  constructor(message: string, readonly kind: "not_found" | "conflict" | "invalid") {
    super(message);
  }
}

export const NOT_ACTIVE_MESSAGE = "הראיון לא פעיל, יש להתחיל אותו קודם";
