import Link from "next/link";
import type { ReactNode } from "react";
import type { LedgerEntry } from "../../pipeline/model/ledger";

// כרטיס "מה חסר לאבחון" - מקור אמת יחיד (משימה 19, הכרעות אלעד 24.8).
//
// **גלגול ראשון:** הכרטיס היה משוכפל בשלושה מסכים בשלושה מימושים שנפרדו זה מזה. החילוץ
// לכאן (79ba857) איחד אותם, וזה מה שמאפשר שהשינוי הנוכחי ייגע במקום אחד בלבד.
//
// **גלגול שני, וזה המהותי:** האחוז ירד מהמסך. "35%" הוא מספר על **עצמנו** ("כמה אספנו"),
// בזמן שהציון הוא מספר על **העסק** ("כמה הוא טוב"), ושניהם הוצגו זה לצד זה באותו גודל בלי
// לומר שיש ביניהם קשר. בעל העסק ראה שני מספרים גדולים ולא ידע מה כל אחד אומר ולא מה לעשות
// עם אף אחד מהם. עכשיו נשאר מספר אחד על המסך - הציון - והכרטיס אומר במילים את מה שהאחוז
// ניסה לרמוז: מה חסר, ומה זה פותח.
//
// completenessPct לא נמחק ולא השתנה - הוא עדיין מזין את recommendNextStep ואת מסכי הניהול.
// הוא פשוט לא מוצג יותר לבעל העסק.

export interface CompletenessCardProps {
  ledger: LedgerEntry[];
  /** קישור ההמשך. הדוח ותוכנית העבודה מובילים לראיון; בתוך הראיון עצמו אין לאן */
  cta?: { href: string; label: string };
  /** חץ הקצה, מרונדר גולמי. CapArrow מוכפל היום בחמישה מסכים ועותק שישי כאן היה מחמיר
      בדיוק את מה שהמשימה הזו באה לתקן; חלק מהעותקים כבר עוטפים את עצמם ב-span.cap */
  ctaIcon?: ReactNode;
  /** שורת "הדוח חי". עובדה מערכתית (כל תשובה מרעננת מיד), ולכן משפט ולא תג */
  live?: boolean;
  /** מחלקות העטיפה, כולל תזמון האנימציה (rv d1/d2) שנקבע במסך הקורא */
  className?: string;
}

function LedgerRow({ item }: { item: LedgerEntry }) {
  return (
    <li className="flex items-start gap-2.5">
      {/* עיגול מלא/ריק ולא רק צבע - ההבדל ניתן להבחנה גם בגווני אפור ובעיוורון צבעים */}
      <span
        aria-hidden="true"
        className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full border ${item.known ? "bg-current" : ""}`}
        style={{ color: item.known ? "var(--acc2-soft)" : "var(--dim)", borderColor: "currentColor" }}
      />
      <span className="min-w-0">
        <b className={`block text-[13px] font-semibold ${item.known ? "opacity-60" : ""}`}>
          {item.label}
        </b>
        {/* מה שהחוסר פותח נאמר רק כשהוא עדיין חסר - על שורה שהושלמה זה כבר לא הבטחה אלא רעש */}
        {!item.known && (
          <i className="mt-0.5 block text-[11.5px] not-italic leading-relaxed" style={{ color: "var(--dim)" }}>
            {item.unlocks}
          </i>
        )}
      </span>
    </li>
  );
}

export function CompletenessCard({ ledger, cta, ctaIcon, live, className = "" }: CompletenessCardProps) {
  // מה שנותר קודם: העין נופלת על מה שאפשר לעשות, ומה שהושלם מתפקד כהוכחת התקדמות מתחתיו.
  // מיון יציב (מפריד לשתי רשימות ולא sort) - הסדר בתוך כל קבוצה נשאר סדר buildLedger
  const missing = ledger.filter((e) => !e.known);
  const done = ledger.filter((e) => e.known);

  return (
    <section className={`shell ${className}`.trim()}>
      <div className="core card-pad flex flex-col gap-3">
        <h2 className="card-title flush">{missing.length > 0 ? "מה חסר לאבחון" : "האבחון מלא"}</h2>

        {missing.length > 0 ? (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--mut)" }}>
            כל אחד מאלה משנה משהו בדוח שלכם.
          </p>
        ) : (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--mut)" }}>
            ענית על הכל. הדוח מבוסס על כל מה שאפשר לדעת על העסק.
          </p>
        )}

        <ul className="mt-1 flex flex-col gap-3">
          {missing.map((e) => <LedgerRow key={e.key} item={e} />)}
          {done.length > 0 && missing.length > 0 && (
            <li className="mt-1 border-t pt-3" style={{ borderColor: "var(--row-line)" }} aria-hidden="true" />
          )}
          {done.map((e) => <LedgerRow key={e.key} item={e} />)}
        </ul>

        {/* btn wide ולא גלולה צרה: ברוחב הרייל (318px) הכיתוב המלא נשבר לשתי שורות,
            וכפתור במלוא הרוחב קורא נכון במקום גלולה עקומה */}
        {cta && missing.length > 0 && (
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
