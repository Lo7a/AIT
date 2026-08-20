// מצב הסיידבר (פתוח/מכווץ) נשמר ב-cookie ולא ב-localStorage בלבד.
//
// הסיבה היא באג שהמייסד דיווח עליו (20.8): ב-localStorage השרת אינו יודע את המצב, ולכן
// כל עמוד נשלח עם סיידבר **פתוח**, ורק אחרי הטעינה ה-JS קרא את ההעדפה וכיווץ - עם
// מעבר רוחב של חצי שנייה. התוצאה היא שבכל מעבר בין עמודים הסיידבר נפתח ונסגר מחדש.
// cookie נקרא בשרת, ולכן ה-HTML הראשון כבר יוצא במצב הנכון ואין קפיצה בכלל.
// זו בדיוק אותה תבנית של מצב כהה/בהיר (mode.ts), ומאותה סיבה.

export const RAIL_COOKIE = "ait-rail";

export type RailState = "open" | "mini";

export function parseRail(v: string | undefined): RailState {
  return v === "mini" ? "mini" : "open";
}
