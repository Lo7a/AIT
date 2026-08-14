import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Assistant } from "next/font/google";
import "./globals.css";

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
  variable: "--font-serif",
  display: "swap",
});
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIT | אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${assistant.variable} ${frankRuhl.variable} font-[family-name:var(--font-sans)] min-h-screen bg-[#F7F6F3] text-[#111111] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
