import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Frank_Ruhl_Libre, Assistant, Rubik, Heebo, Secular_One, Space_Grotesk,
} from "next/font/google";
import { THEME_COOKIE, parseTheme } from "./theme";
import { ThemeSwitcher } from "./theme-switcher";
import "./globals.css";

// כל הפונטים של שלוש הגרסאות נטענים כאן ברמת ה-layout (משותף), כדי שכל תת-עץ
// יוכל להשתמש במשתנה ה-CSS שלו בלי צורך לטעון פונטים בנפרד. גרסה שלא משתמשת
// בפונט מסוים פשוט לא מפנה למשתנה שלו.
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
  variable: "--font-frank",
  display: "swap",
});
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-assistant",
  display: "swap",
});
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});
const secularOne = Secular_One({
  subsets: ["hebrew", "latin"],
  weight: ["400"],
  variable: "--font-secular",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIT | אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
};

const FONT_VARIABLES = [
  frankRuhl.variable,
  assistant.variable,
  rubik.variable,
  heebo.variable,
  secularOne.variable,
  spaceGrotesk.variable,
].join(" ");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html lang="he" dir="rtl" data-theme={theme}>
      {/* suppressHydrationWarning על body בלבד: תוספי דפדפן (Grammarly וכד') מזריקים תכונות
          ל-body לפני ש-React נטען ומייצרים אזהרת hydration מדומה בפיתוח; אזהרות אמיתיות בעומק
          העץ לא מושתקות */}
      <body
        className={`${FONT_VARIABLES} font-[family-name:var(--font-assistant)] min-h-screen antialiased`}
        suppressHydrationWarning
      >
        {children}
        <ThemeSwitcher active={theme} />
      </body>
    </html>
  );
}
