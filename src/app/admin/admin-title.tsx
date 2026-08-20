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
function useAdminPageName(): string {
  const pathname = usePathname();
  const match = ADMIN_ITEMS.filter(({ href }) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href),
  ).at(-1);
  return match != null ? NAV_LABEL[match.key] : "ניהול";
}

/** השורה הקטנה בסרגל הדביק - הזהות */
export function AdminTitle() {
  return (
    <span className="brand-txt">
      <small>ניהול</small>
      <b>{useAdminPageName()}</b>
    </span>
  );
}

// כותרת העמוד הגדולה בראש התוכן (הנחיית מייסד 20.8). יושבת בפריסה ולא בכל מסך בנפרד:
// שישה עותקים של אותה כותרת היו נפרדים זה מזה בשינוי הראשון. מרווח אופקי זהה ל-.board
// כדי שהיא תתיישר עם הכרטיסים שמתחתיה
const HEAD_WRAP = { width: "var(--content-w)", maxWidth: "var(--content-max)" } as const;

export function AdminPageHead() {
  return (
    <div style={HEAD_WRAP} className="mx-auto px-[22px] pt-6">
      <header className="page-head rv">
        <h1>{useAdminPageName()}</h1>
      </header>
    </div>
  );
}
