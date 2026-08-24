"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// רענון חי למסכים שמשתנים מבחוץ (לוח המשימות וערוץ הסוכנים, בקשת מייסד 21.8):
// הסוכנים כותבים למסד מהמכונות שלהם, והמסך מרונדר בשרת - בלי זה הוא קופא עד רענון ידני.
//
// למה משיכה כל כמה שניות ולא Supabase Realtime: כלל הברזל של הפרויקט - הדפדפן לעולם
// לא מדבר עם המסד. router.refresh מושך את רינדור השרת העדכני, הנתונים נשארים בצד השרת,
// ו-React משמר את מצב ה-DOM (אקורדיונים פתוחים, טקסט שהוקלד) כי הצמתים לא מוחלפים.
//
// שני מצבים שבהם לא מרעננים: טאב ברקע (חבל על הבקשות), ומשתמש באמצע הקלדה בשדה -
// רענון מתחת לידיים מרגיש כמו באג גם כשהוא לא מוחק כלום.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
