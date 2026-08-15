-- אזהרת האבטחה של Supabase (Extension in Public): הרחבה בסכמה public חשופה להאפלת פונקציות
-- ע"י אובייקטים בעלי שם זהה. מעבירים את pgvector לסכמת extensions הייעודית (קיימת כברירת
-- מחדל ב-Supabase ונמצאת ב-search_path, כך שעמודת embedding הקיימת ממשיכה לעבוד ללא שינוי).
CREATE SCHEMA IF NOT EXISTS "extensions";
ALTER EXTENSION "vector" SET SCHEMA "extensions";
