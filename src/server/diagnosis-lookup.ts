import type { PrismaClient } from "@prisma/client";
import { websiteKeyOf } from "./website-key";
import type { DiagnosisStatus } from "./status";

export interface LatestDiagnosis { diagnosisId: string; status: DiagnosisStatus; ageSeconds: number }

// טרי מספיק כדי לחבר במקום לירות סריקה חדשה, אבל לא נצחי: אבחון ישן שנתקע ב-scanning/scanned
// (תקלה בעבר) לא אמור לנעול לצמיתות ניסיון חדש לאותו יעד. משותף לשני הצרכנים: מסך הסריקה
// (חיבור לרצה) וה-dedup בצד השרת (דחיית POST כפול) - חלון אחד, החלטה אחת
export const ATTACH_MAX_AGE_SECONDS = 180;

// "יש עבודה חיה ליעד הזה": סריקה שרצה עכשיו (scanning) או שהסתיימה וממתינה לשמירת הדוח
// (scanned), בתוך החלון. report_ready בכוונה לא נחשב - סריקה חוזרת של דוח קיים היא פעולה
// לגיטימית (המייסדים סורקים מחדש כל הזמן לבדיקת שיפורי זיהוי)
export function isRecentInFlight(latest: LatestDiagnosis | null): latest is LatestDiagnosis {
  return latest != null
    && (latest.status === "scanning" || latest.status === "scanned")
    && latest.ageSeconds < ATTACH_MAX_AGE_SECONDS;
}

// האבחון האחרון של יעד (placeId או url) - כדי שרענון באמצע סריקה יתחבר לקיים במקום לירות סריקה
// כפולה בתשלום (ראו src/app/scan/page.tsx: נבדק לפני שמסך הסריקה בכלל מתרנדר).
// מחזיר null גם כשלא קיים עסק תואם וגם כשקיים אבל אין לו עדיין אבחון - שני המצבים שקולים
// מבחינת הקורא: "אין עבודה קיימת לחבר אליה, סרקו מהתחלה".
export async function findLatestDiagnosis(
  prisma: PrismaClient,
  target: { placeId?: string; url?: string },
  now: Date = new Date(),
): Promise<LatestDiagnosis | null> {
  let business: { id: string } | null = null;
  if (target.placeId) {
    business = await prisma.business.findUnique({ where: { placeId: target.placeId }, select: { id: true } });
  } else if (target.url) {
    let websiteKey: string;
    try {
      websiteKey = websiteKeyOf(target.url);
    } catch {
      // כתובת פסולה - לא אמורה להגיע לכאן במסלול הרגיל (כבר נבדקה קודם), אבל אין סיבה לזרוק
      // ולהפיל את עמוד הסריקה כולו על שגיאת נרמול; פשוט אין עבודה קיימת לחבר אליה
      return null;
    }
    business = await prisma.business.findUnique({ where: { websiteKey }, select: { id: true } });
  } else {
    return null;
  }
  if (!business) return null;

  const diagnosis = await prisma.diagnosis.findFirst({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true },
  });
  if (!diagnosis) return null;

  const ageSeconds = Math.floor((now.getTime() - diagnosis.createdAt.getTime()) / 1000);
  return { diagnosisId: diagnosis.id, status: diagnosis.status as DiagnosisStatus, ageSeconds };
}
