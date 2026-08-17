"use client";
// דף הנחיתה לאנונימיים (הכרעת מייסד 16.8): המבקר מתרשם ממה שהמערכת נותנת, ולחיצה על
// "אבחן את העסק שלי" מובילה לכניסה/הרשמה - הסריקה עצמה תמיד מאחורי התחברות (כל סריקה
// עולה כסף וכל עסק נקשר לבעליו). עיצוב placeholder כמו כל המסכים - הלוק האמיתי בשלב
// העיצוב. אפס מספרים: הצעת הערך מנוסחת בלי אף נתון מומצא.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stashPendingSearch } from "./landing-logic";

const STEPS: { title: string; body: string }[] = [
  {
    title: "דוח אמת על הנוכחות הדיגיטלית",
    body: "סורקים את האתר, הפרופיל העסקי בגוגל והביקורות. מקבלים תמונה כנה: מה עובד, מה חסר, ומה זה עולה לעסק - וכל מה שלא נבדק מסומן ככזה, בלי ניחושים.",
  },
  {
    title: "ראיון קצר שמדייק את התמונה",
    body: "כמה שאלות ממוקדות על איך העסק באמת עובד - בקצב שלך, עם אפשרות לספר במילים שלך. הדוח מתעדכן אחרי כל תשובה.",
  },
  {
    title: "תוכנית עבודה לפי מה שכואב",
    body: "צעדים מדורגים לפי מה שמשפיע באמת על העסק שלך, עם טווחי מחיר ממקורות גלויים בשוק הישראלי - לא הערכות באוויר.",
  },
];

export function LandingScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // הקלדה היא לא חובה - הכפתור עובד גם ריק; מה שהוקלד נשמר ומחכה אחרי ההתחברות
  function startDiagnosis() {
    stashPendingSearch(window.sessionStorage, query);
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-6 flex justify-end text-sm">
        <a
          href="/login"
          className="font-medium text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        >
          כניסה
        </a>
      </div>

      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight">
        כמה שווה הנוכחות הדיגיטלית של העסק שלך?
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        יועץ דיגיטלי לעסקים קטנים: סריקה מקיפה, שיחה קצרה על העסק, ותוכנית עבודה מסודרת - הכול במקום אחד.
      </p>

      <form
        className="mt-8 animate-fade-up"
        style={{ animationDelay: "160ms" }}
        onSubmit={(e) => { e.preventDefault(); startDiagnosis(); }}
      >
        <label htmlFor="landing-query" className="block text-sm font-medium">שם העסק או כתובת האתר</label>
        {/* נערם לשתי שורות במובייל (הכלל הקבוע: כל מסך מותאם טלפון) - אותו דפוס כמו SearchBox */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="landing-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-black/[0.12] bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            placeholder="למשל: מסעדת השף חיפה, או www.example.co.il"
          />
          <button
            type="submit"
            className="shrink-0 cursor-pointer rounded-lg bg-[#111111] px-5 py-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
          >
            אבחן את העסק שלי
          </button>
        </div>
        <p className="mt-2 text-sm text-[#6F6E6A]">
          האבחון דורש חשבון - נכניס אותך ברגע, בלי סיסמה, והחיפוש שהקלדת מחכה לך בפנים.
        </p>
      </form>

      <section className="mt-14">
        <ol className="grid gap-4">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="animate-fade-up rounded-lg border border-black/[0.06] bg-white px-5 py-4"
              style={{ animationDelay: `${240 + i * 80}ms` }}
            >
              <h2 className="font-[family-name:var(--font-frank)] text-lg font-bold tracking-tight">
                {step.title}
              </h2>
              <p className="mt-1 text-[#6F6E6A]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
