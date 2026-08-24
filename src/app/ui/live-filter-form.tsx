"use client";

import { type FormEvent, type ReactNode, useRef } from "react";
import { useRouter } from "next/navigation";

// טופס סינון חי (תיקון מייסד 21.8: בחירת צ'יפ לא שינתה כלום עד לחיצה על "סינון").
// לחיצה על צ'קבוקס או רדיו מגישה מיד - הפרמטרים נבנים מהטופס והניווט הוא צד-לקוח
// (router.replace), כך שהשרת מרנדר את הרשימה המסוננת בלי טעינת עמוד מלאה. הקלדה
// בשדה חיפוש ממשיכה עם Enter או הכפתור - סינון תוך כדי הקלדה היה שולח בקשה על כל תו.
// בלי JS הטופס נשאר טופס GET רגיל - הכפתור עובד כרגיל.
export function LiveFilterForm({
  action, className, children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement | null>(null);

  function navigate() {
    const form = ref.current;
    if (form == null) return;
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof v === "string" && v !== "") qs.append(k, v);
    }
    // שינוי סינון תמיד חוזר לעמוד הראשון - פרמטר page לא נאסף מהטופס בכוונה
    const s = qs.toString();
    router.replace(s === "" ? action : `${action}?${s}`, { scroll: false });
  }

  function onChange(e: FormEvent<HTMLFormElement>) {
    const t = e.target;
    if (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio")) navigate();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate();
  }

  return (
    <form ref={ref} method="get" action={action} className={className} onChange={onChange} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
