import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Rubik } from "next/font/google";
import { THEME_COOKIE, parseTheme } from "./theme";
import { RAIL_COOKIE, parseRail } from "./rail";
import { MODE_COOKIE, parseMode } from "./mode";
import { ModeToggle } from "./mode-toggle";
import { Ambient, GscDefs } from "./ui/ambient";
import "./globals.css";

// גופן אחד בלבד. עד 18.8 נטענו כאן שישה, אחד לכל גרסת עיצוב שנשקלה - אבל מאז
// שנבחר עיצוב אחד רק Rubik בשימוש, וחמשת האחרים ייצרו כללי @font-face מתים
// (כ-41KB של CSS) בלי שהורד מהם ולו קובץ אחד.
//
// המשקלים: 800 נחוץ ומופיע בעיצוב עשרות פעמים (כותרות הירו, מספרי הפערים,
// כל font-extrabold). בלעדיו הדפדפן מזייף אותו בהדגשה סינתטית, שנראית מרוחה -
// בדיוק סוג הפרט שגורם לעיצוב להרגיש זול בלי שאפשר להצביע על הסיבה
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rubik",
  display: "swap",
});

// כתובת הפרודקשן מגיעה מהסביבה של Vercel; בלעדיה (פיתוח מקומי) אין metadataBase
// ותמונת השיתוף פשוט לא תקבל כתובת מוחלטת - לא שוברים כלום
const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: productionUrl ? new URL(`https://${productionUrl}`) : undefined,
  title: "בדק עסק | אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
  // כרטיס השיתוף: מה שרואים כששולחים את הקישור בוואטסאפ - שם רוב הקהל שלנו
  openGraph: {
    title: "בדק עסק",
    description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
    type: "website",
    locale: "he_IL",
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // מצב תצוגה (כהה ברירת מחדל / בהיר) - נקבע בשרת מהעוגייה כדי שלא יהיה הבזק בטעינה
  const mode = parseMode(cookieStore.get(MODE_COOKIE)?.value);
  // מצב הסיידבר על html, כדי שהוא ייצא נכון כבר מהשרת ולא יקפוץ אחרי הטעינה
  const rail = parseRail(cookieStore.get(RAIL_COOKIE)?.value);

  return (
    <html lang="he" dir="rtl" data-theme={theme} data-mode={mode} data-rail={rail}>
      {/* suppressHydrationWarning על body בלבד: תוספי דפדפן (Grammarly וכד') מזריקים תכונות
          ל-body לפני ש-React נטען ומייצרים אזהרת hydration מדומה בפיתוח; אזהרות אמיתיות בעומק
          העץ לא מושתקות */}
      <body
        className={`${rubik.variable} font-[family-name:var(--font-rubik)] min-h-screen antialiased`}
        suppressHydrationWarning
      >
        <Ambient />
        <GscDefs />
        {children}
        <ModeToggle />
      </body>
    </html>
  );
}
