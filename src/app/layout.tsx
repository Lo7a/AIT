import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], display: "swap" });

export const metadata: Metadata = {
  title: "AIT | אבחון דיגיטלי לעסק",
  description: "שם עסק או כתובת אתר, ותוך דקה יש אבחון",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} min-h-screen bg-[#faf8f4] text-stone-900 antialiased`}>{children}</body>
    </html>
  );
}
