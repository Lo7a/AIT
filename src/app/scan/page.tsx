import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../../server/db";
import { findLatestDiagnosis, isRecentInFlight } from "../../server/diagnosis-lookup";
import { currentActingUser, hasAuthConfig } from "../../server/auth/supabase-server";
import { userCanAccessDiagnosis } from "../../server/auth/guard";
import { THEME_COOKIE, parseTheme } from "../theme";
import { getVariant } from "../variants/registry";
import { EmptyState } from "../ui/empty-state";

// חלון קצר בהרבה לניתוב אוטומטי לדוח מוכן - רק "בדיוק סיימנו ורעננו" תופס; דוח ישן יותר לא
// אמור לחטוף רענון-אחזור בלי שהמשתמש ביקש לסרוק שוב במפורש. חלון החיבור לסריקה חיה עבר
// ל-diagnosis-lookup.ts (isRecentInFlight) - משותף עם ה-dedup בצד השרת
const REPORT_READY_MAX_AGE_SECONDS = 600;

// searchParams ב-Next 15 הוא Promise; העמוד דינמי מטבעו
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ placeId?: string; name?: string; url?: string; city?: string }>;
}) {
  const params = await searchParams;

  // סריקה דורשת התחברות (כל סריקה עולה כסף ונקשרת לבעלים) - אנונימי מופנה לכניסה.
  // בסביבה בלי מפתחות Supabase (מצב פיתוח) המסך פתוח כמו קודם. זהות פועלת: בהתחזות
  // גם הסריקה מתנהגת (ונרשמת) בתור המשתמש שצופים בו
  const acting = hasAuthConfig() ? await currentActingUser(prisma) : null;
  const user = acting?.user ?? null;
  if (hasAuthConfig() && user == null) redirect("/login");

  const hasPlace = !!params.placeId && !!params.name;
  const hasUrl = !!params.url;
  if (!hasPlace && !hasUrl) {
    return (
      <EmptyState
        title="חסר יעד לאבחון"
        body="לא נמצאו פרטי עסק או כתובת אתר להתחלת האבחון."
      />
    );
  }
  const target = hasUrl
    ? { url: params.url }
    : { placeId: params.placeId, name: params.name, city: params.city };

  // מציאת עבודה קיימת ליעד הזה לפני שבכלל שוקלים לרנדר את הרצת הסריקה - כדי שרענון/כניסה
  // חוזרת יתחברו לאבחון שכבר רץ או הסתיים במקום לירות סריקה כפולה בתשלום (עיקר התיקון הזה).
  // תיחום בעלות: אבחון קיים של משתמש אחר לא מוצע לחיבור ולא מפנה לדוח שלו - מבחינת המשתמש
  // הזה הוא לא קיים (הסריקה החדשה שתירה תיכשל בהודעת הבעלות הכנה מהזרם, ראו diagnosis-repo)
  let latest = await findLatestDiagnosis(prisma, target).catch(() => null);
  if (latest != null && user != null
    && (await userCanAccessDiagnosis(prisma, user, latest.diagnosisId).catch(() => null)) !== true) {
    latest = null;
  }

  if (latest?.status === "report_ready" && latest.ageSeconds < REPORT_READY_MAX_AGE_SECONDS) {
    redirect(`/report/${latest.diagnosisId}`);
  }

  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const { Scan } = getVariant(theme);

  if (isRecentInFlight(latest)) {
    return <Scan target={target} attach={{ diagnosisId: latest.diagnosisId, status: latest.status }} />;
  }

  return <Scan target={target} />;
}
