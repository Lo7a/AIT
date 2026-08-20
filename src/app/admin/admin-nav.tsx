"use client";
// ניווט מסכי הניהול. משתמש במחלקות של ניווט העוגן (.anch) - אותה שורת גלולות דביקה
// בדיוק, רק שכאן היעדים הם עמודים ולא מקטעים, ולכן הסימון בא מהנתיב ולא מ-observer.
// AnchorNav עצמו לא מתאים כאן: הוא מקשיב לגלילה בתוך עמוד אחד
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string }[] = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/diagnoses", label: "אבחונים" },
  { href: "/admin/usage", label: "שימוש ומגבלות" },
  { href: "/admin/activity", label: "יומן" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="anch" aria-label="מסכי הניהול">
      {ITEMS.map(({ href, label }) => {
        // "/admin" עצמו רק בהתאמה מדויקת - אחרת הוא היה דולק בכל תת-עמוד
        const on = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
