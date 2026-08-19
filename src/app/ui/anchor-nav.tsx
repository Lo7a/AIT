"use client";
// ניווט עוגן: שורת קישורים דביקה שמסמנת את המקטע שנמצא כרגע במסך.
// הקישורים הם עוגני HTML רגילים - הם עובדים גם בלי JS; ה-JS רק מסמן איפה המשתמש נמצא.
// הרכיב לא ממציא מקטעים: הוא מקבל בדיוק את המקטעים שהמסך באמת מרנדר.
import { useEffect, useMemo, useState } from "react";

export type AnchorItem = { id: string; label: string };

export function AnchorNav({ items, label = "מקטעי העמוד" }: { items: AnchorItem[]; label?: string }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  // מפתח יציב: מונע לולאת אפקט כשההורה בונה את המערך מחדש בכל רנדר
  const key = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // המקטע הפעיל = הגבוה ביותר מבין אלה שנראים כרגע מתחת לשורת הניווט
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-84px 0px -55% 0px", threshold: 0 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [key]);

  if (items.length < 2) return null;

  return (
    <nav className="anch" aria-label={label}>
      {items.map((item, i) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={item.id === active ? "on" : undefined}
          aria-current={item.id === active ? "true" : undefined}
        >
          <span className="n num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
