import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Rubik } from "next/font/google";
import { THEME_COOKIE, parseTheme } from "./theme";
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

export const metadata: Metadata = {
  title: "AIT | אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // מצב תצוגה (כהה ברירת מחדל / בהיר) - נקבע בשרת מהעוגייה כדי שלא יהיה הבזק בטעינה
  const mode = parseMode(cookieStore.get(MODE_COOKIE)?.value);

  return (
    <html lang="he" dir="rtl" data-theme={theme} data-mode={mode}>
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
