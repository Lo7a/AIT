"use client";

import { useRouter } from "next/navigation";
import { MODE_COOKIE } from "./mode";

// מתג תצוגה כהה/בהירה - כפתור צף בפינה, זמין בכל מסך. העדכון מיידי בצד הלקוח
// (החלפת data-mode על html) והעוגייה משמרת את הבחירה גם לרינדור השרת הבא.
export function ModeToggle() {
  const router = useRouter();

  // המעבר הרך בין המצבים נדלק רק למשך ההחלפה עצמה. כשהוא ישב קבוע על ה-body הוא
  // עלה אחוז וחצי של מעבד בכל עמוד באפליקציה, כל הזמן, בשביל פעולה נדירה (מדידת ביצועים 18.8)
  function toggle() {
    const html = document.documentElement;
    const next = html.getAttribute("data-mode") === "light" ? "dark" : "light";
    html.classList.add("mode-anim");
    html.setAttribute("data-mode", next);
    document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.setTimeout(() => html.classList.remove("mode-anim"), 700);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn theme-tgl mode-fab"
      aria-label="החלפה בין תצוגה כהה לבהירה"
    >
      <svg className="ic-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="ic-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
