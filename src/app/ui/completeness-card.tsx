import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { SectionProgressItem } from "../interview/chat-logic";
import { SegRail } from "./motion";

// כרטיס שלמות האבחון - מקור אמת יחיד (משימה 19, בקשת אלעד 24.8).
//
// עד כאן הוא היה משוכפל בשלושה מסכים עם שלושה מימושים שנפרדו זה מזה: default-interview
// (כותרת card-title, מספר 34 פיקסלים, FillBar, צ'יפים), default-roadmap (כותרת 15 פיקסלים,
// FillBar, door-link) ו-default-screens (b במקום כותרת, SegRail, כפתור מלא). זו בדיוק
// ההפרה שכלל השימוש החוזר ב-CLAUDE.md מתאר: רכיב שמשמש שני מסכים או יותר עובר ל-ui/.
//
// הפס המאוחד הוא SegRail ולא FillBar: חמישה מקטעים נקראים כ"כמה חלקים מהאבחון הושלמו",
// וזו המשמעות שהכרטיס נושא. פס מילוי רציף מתאים להתקדמות בזמן, לא לספירת חוסרים.
//
// היעד (החלק השני של משימה 19): המקום שבו היום מוצג אחוז מופשט יציג רשימת חוסרים
// קונקרטית - "חסר שווי לקוח ממוצע, בלי זה אין שורת הפסד בדוח". האחוז נשאר ככותרת,
// והפירוט מתחתיו. כל הקריאות עוברות דרך הרכיב הזה, ולכן השדרוג ייגע במקום אחד.

// הבדל מלא/חלקי/כלום לא נשען על צבע בלבד: full מלא ובגבול רציף, partial בגבול מקווקו
// עם נקודה מוקפת, none בגבול רציף דהוי בלי נקודה בכלל - ניתן להבחין גם
// בגווני אפור/עיוורון צבעים
const SECTION_CHIP_STYLE: Record<SectionProgressItem["state"], CSSProperties> = {
  full: { color: "var(--acc2-soft)", background: "rgba(var(--acc2-rgb),.09)", borderColor: "rgba(var(--acc2-rgb),.35)" },
  partial: { color: "var(--txt)", background: "var(--surface-1)", borderStyle: "dashed", borderColor: "rgba(var(--acc-rgb),.5)" },
  none: { color: "var(--dim)", background: "transparent", borderColor: "var(--hair-soft)" },
};
const STATE_LABEL: Record<SectionProgressItem["state"], string> = {
  full: "הושלם",
  partial: "חלקי",
  none: "עוד לא",
};

function SectionChip({ item }: { item: SectionProgressItem }) {
  return (
    <li
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={SECTION_CHIP_STYLE[item.state]}
      aria-label={`${item.label}: ${STATE_LABEL[item.state]}`}
    >
      {item.state !== "none" && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.state === "full" ? "bg-current" : "border border-current"}`}
        />
      )}
      {item.label}
    </li>
  );
}

export interface CompletenessCardProps {
  percent: number;
  /** משפט הצעד הבא (recommendNextStep). הדוח ותוכנית העבודה מציגים, הראיון לא - שם השאלה עצמה על המסך */
  note?: string;
  /** צ'יפי הסקציות. הראיון מציג "מה כבר יש לנו"; בדוח זה רעש שחוזר על פירוט הציון */
  sections?: SectionProgressItem[];
  /** קישור ההמשך. הדוח ותוכנית העבודה מובילים לראיון; בתוך הראיון עצמו אין לאן */
  cta?: { href: string; label: string };
  /** חץ הקצה של הקריאה לפעולה, מרונדר כפי שהוא. מתקבל מבחוץ ולא מוגדר כאן: CapArrow מוכפל
      היום בחמישה מסכים, ועותק שישי היה מחמיר את מה שהמשימה הזו באה לתקן. מרונדר גולמי בכוונה
      ולא בתוך span.cap - חלק מהעותקים כבר עוטפים את עצמם, ועטיפה כאן הייתה כופלת אותה */
  ctaIcon?: ReactNode;
  /** שורת "הדוח חי". עובדה מערכתית (כל תשובה מרעננת את scan.scores מיד), ולכן משפט ולא תג */
  live?: boolean;
  /** מחלקות העטיפה, כולל תזמון האנימציה (rv d1/d2) שנקבע במסך הקורא */
  className?: string;
}

export function CompletenessCard({
  percent, note, sections, cta, ctaIcon, live, className = "",
}: CompletenessCardProps) {
  return (
    <section className={`shell ${className}`.trim()}>
      <div className="core card-pad flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="card-title flush">שלמות האבחון</h2>
          <span className="num text-2xl font-extrabold tracking-[-.02em] text-[color:var(--acc-soft)]">
            {percent}
            <small className="text-xs font-semibold" style={{ color: "var(--dim)" }}>%</small>
          </span>
        </div>

        {/* SegRail עצמו aria-hidden - המספר הנגיש יושב על ה-progressbar כאן */}
        <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
          aria-label="שלמות האבחון">
          <SegRail percent={percent} />
        </div>

        {note && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{note}</p>
        )}

        {sections && sections.length > 0 && (
          <>
            <p className="mt-2 text-[10.5px] font-bold tracking-[.12em] text-[color:var(--dim)]">
              מה כבר יש לנו
            </p>
            <ul className="flex flex-wrap gap-2">
              {sections.map((s) => <SectionChip key={s.key} item={s} />)}
            </ul>
          </>
        )}

        {/* btn wide ולא גלולה צרה: ברוחב הרייל (318px) הכיתוב המלא נשבר לשתי שורות,
            וכפתור במלוא הרוחב קורא נכון במקום גלולה עקומה */}
        {cta && (
          <Link href={cta.href} className="btn sm wide mt-1">
            {cta.label}
            {ctaIcon}
          </Link>
        )}

        {live && (
          <p className="mt-2 flex items-start gap-2 border-t pt-4 text-[12px] leading-relaxed"
            style={{ borderColor: "var(--row-line)", color: "var(--mut)" }}>
            <span className="live-dot" aria-hidden="true" />
            כל תשובה מעדכנת את הדוח מיד. אפשר לעצור באמצע ולחזור.
          </p>
        )}
      </div>
    </section>
  );
}
