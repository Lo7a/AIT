"use client";

import { usePathname } from "next/navigation";
import { ADMIN_ITEMS, NAV_LABEL } from "../ui/app-shell";

// שם העמוד בראש מסכי הניהול (בקשת מייסד 20.8). עד עכשיו כל מסך ניהול הציג "ניהול",
// כלומר את שם המדור ולא את שם העמוד - ובמדור עם שישה עמודים זה אומר שהכותרת לא אמרה
// כלום. שאר המערכת כבר עושה את זה נכון: השורה הקטנה היא שם המסך והמודגשת היא העסק.
//
// המקור הוא ADMIN_ITEMS ו-NAV_LABEL של הסיידבר ולא רשימה שנייה, כדי ששם עמוד לא יוכל
// להיאמר בשני מקומות בשתי גרסאות. ההתאמה זהה לזו של הסיידבר: "/admin" בהתאמה מדויקת,
// השאר לפי קידומת - כך עמוד בן (עריכת פריט בספרייה) יורש את שם ההורה שלו
export function AdminTitle() {
  const pathname = usePathname();
  const match = ADMIN_ITEMS.filter(({ href }) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href),
  ).at(-1);

  return (
    <span className="brand-txt">
      <small>ניהול</small>
      <b>{match != null ? NAV_LABEL[match.key] : "ניהול"}</b>
    </span>
  );
}
