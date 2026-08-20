-- סגירת החור שנפתח מעצמו (20.8). ראו CLAUDE.md ו-docs: יצירת טבלאות דרך מיגרציות
-- בסופאבייס מעניקה ל-anon ול-authenticated הרשאות מלאות על כל טבלה, וברירות המחדל של
-- הסכמה עושות את זה שוב לכל טבלה חדשה. המפתח הציבורי יושב בתוך ה-HTML שלנו, ולכן זה
-- אומר שאם ה-Data API יידלק אי פעם - כל מי שקורא את הדף קורא וכותב את כל המסד.
--
-- **בכוונה בלי RLS.** שלילת ההרשאות סוגרת את זה לבדה, ובלי אף מדיניות: אין כאן שום
-- סמנטיקה שיכולה להחזיר אפס שורות בשקט, שזו מחלקת הבאגים שהמייסד נכווה ממנה.
-- הגישה שלנו למסד ממילא אינה עוברת דרך התפקידים האלה אלא דרך postgres.
--
-- service_role לא נגעים בו: הוא מפתח צד-שרת ואינו נחשף לדפדפן.
-- ביטול (אם משהו יישבר): GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- החלק שבלעדיו החור נפתח מחדש במיגרציה הבאה: ברירות המחדל של התפקיד שיוצר את
-- הטבלאות (postgres, דרך Prisma) מפסיקות להעניק לשני התפקידים האלה
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
