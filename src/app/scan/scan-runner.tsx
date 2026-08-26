"use client";

import type { ReactNode } from "react";
import { useAttachWait, useBlockedWait, useScanStream, type StepLine, type Target } from "./use-scan-stream";
import { BrandFace, BrandName } from "../ui/brand";

export type ScanAttach = { diagnosisId: string; status: string };

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// מסגרת משותפת לכל מצבי מסך הסריקה: שורת מותג עליונה עם היעד הנסרק (שם העסק האמיתי
// מה-target, או ה-URL כשאין שם) ועמודה ממורכזת צרה. aria-busy עובר מהמצב הקורא
function ScanFrame({ target, busy, children }: { target: Target; busy: boolean; children: ReactNode }) {
  const chip = target.name ?? target.url ?? null;
  return (
    <div className="above-ambient flex min-h-dvh flex-col">
      <header className="topbar">
        <span className="brand">
          <BrandFace />
          <span className="brand-txt"><small>אבחון דיגיטלי</small><BrandName /></span>
        </span>
        <div className="side">
          {chip != null && (
            <span className="chip clip" dir={target.name ? undefined : "ltr"}>
              {chip}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-165 flex-1 px-4 py-12" aria-busy={busy}>
        {children}
      </main>
    </div>
  );
}

// שורת שלב מהזרם האמיתי: רץ (ספינר), הסתיים בהצלחה (וי + שורת תוצאה כשיש), נכשל (איקס אדום).
// אין מצב "ממתין" - הזרם מוסיף שלב רק כשהוא מתחיל לרוץ, אז idle קיים רק כעוגן לאנימציית המעבר
function StepRow({ step }: { step: StepLine }) {
  const failed = step.done && step.ok === false;
  return (
    <li className={step.done ? (failed ? "sl done fail" : "sl done") : "sl act"}>
      <span className="st" aria-hidden="true">
        <span className="idle" />
        <span className="spin"><i /></span>
        <span className="chk">
          <span>{failed ? <FailIcon /> : <CheckIcon />}</span>
        </span>
      </span>
      <div className="tx">
        <span className="main-lb">{step.label}</span>
        {step.done && step.detail && (
          <span className="res num">{step.detail}</span>
        )}
      </div>
    </li>
  );
}

// מסך המתנה משותף לשני המצבים שבהם לא פותחים זרם חדש: attach (יודעים מ-page.tsx מראש שיש
// אבחון חי) וגם blocked (המנעול בצד לקוח תפס mount שני לאותו יעד באותו טעינת עמוד). בשני
// המקרים אין הצדקה לסריקה נוספת בתשלום - רק מציגים שמשהו קורה ברקע.
function WaitingScreen({
  target, message, showHomeLink,
}: {
  target: Target;
  message: string;
  showHomeLink?: boolean;
}) {
  return (
    <ScanFrame target={target} busy={true}>
      <div className="scan-peek">
        {/* גם כשמחכים לסריקה שרצה ברקע - הדמות באמצע בדיקה */}
        <img src="/brand/inspecting.webp" alt="" aria-hidden="true" className="scan-buddy" />
      <section className="shell rv d1">
        <div className="core card-pad">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">הסריקה כבר רצה ברקע</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{message}</p>
          <div role="status" aria-live="polite" className="mt-6">
            <span className="chip live"><span className="dot" />בודקים כל כמה שניות אם הדוח מוכן</span>
          </div>
          {showHomeLink && (
            <a href="/" className="btn-quiet mt-6 inline-flex">חזרה לעמוד הראשי</a>
          )}
        </div>
      </section>
      </div>
    </ScanFrame>
  );
}

// מצב attach: page.tsx כבר קבע (בצד שרת, לפני שהמסך הזה בכלל התרנדר) שיש אבחון חי ליעד -
// לא פותחים POST /api/diagnose חדש בשום תנאי, רק שואלים כל 3 שניות אם הוא הגיע ל-report_ready.
function AttachedScan({ target, diagnosisId }: { target: Target; diagnosisId: string }) {
  useAttachWait(diagnosisId);
  return <WaitingScreen target={target} message="מתחברים אליה, הדוח ייפתח אוטומטית כשיהיה מוכן" />;
}

// המסך החסום מנוטר לפי היעד (אין לו diagnosisId): ברגע שהסריקה שרצה ברקע מסיימת - מנווטים
// לדוח, בדיוק כמו attach. בלי זה המסך היה נשאר תקוע לנצח גם כשהדוח כבר מוכן (באג קמפאי 15.8)
function BlockedScan({ target }: { target: Target }) {
  useBlockedWait(target);
  return <WaitingScreen target={target} message="סריקה לעסק הזה כבר רצה בחלון אחר" showHomeLink />;
}

// מה שמוצג בשורת הכתובת. שלושה מצבים שונים במכוון, ואף אחד מהם אינו ניחוש:
// כתובת אמיתית -> המארח בלבד (כמו דפדפן, בלי https ובלי www), נבדק ואין אתר -> נאמר
// במפורש, ועוד לא ידוע -> נאמר שמחפשים. undefined ו-null אינם אותו דבר כאן
function addressLabel(website: string | null | undefined, fallbackUrl?: string): string {
  const raw = website ?? (website === null ? null : fallbackUrl);
  if (raw == null) return website === null ? "לעסק אין אתר" : "מחפשים את האתר";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

function LiveScan({ target }: { target: Target }) {
  const { title, website, lines: steps, error, blocked } = useScanStream(target);

  if (blocked) {
    return <BlockedScan target={target} />;
  }

  // מונה כן בלבד: הזרם לא מדווח אחוז התקדמות ולא ידוע כמה שלבים יגיעו בסך הכול, אז מציגים
  // רק מה שקרה באמת - כמה מהשלבים שכבר הופיעו הסתיימו. בלי אחוז מומצא
  const doneCount = steps.filter((s) => s.done).length;
  const address = addressLabel(website, target.url);
  const known = website != null || target.url != null;

  return (
    <ScanFrame target={target} busy={error == null}>
      <h1 className="mb-1 text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--mut)" }}>בדרך כלל זה לוקח פחות מדקה</p>

      {error && (
        <div role="alert" className="form-error mb-6">
          <div>
            <p>{error}</p>
            <a href="/hub" className="btn-quiet mt-2 inline-flex">
              חזרה למרכז העסק
            </a>
          </div>
        </div>
      )}

      {/* חלון הדפדפן: אותן מחלקות .term בדיוק של ההדגמה בדף הנחיתה (הנחיית מייסד 20.8),
          רק שכאן הכתובת אמיתית והשורות הן הסריקה שרצה באמת.
          מה שלא הועתק מההדגמה במכוון: פס ההתקדמות. שם הוא נשען על מספר שלבים ידוע מראש,
          וכאן השלבים מגיעים בזרם - הפס היה מטפס ל-100 ונופל ל-50 בכל שלב חדש שנכנס */}
      {steps.length > 0 && (
        <div className="scan-peek">
          {/* הדמות מציצה מעל החלון עם הזכוכית מגדלת - היא באמת בודקת עכשיו. קו החיתוך
              של חצי הגוף מוסתר מאחורי הסרגל העליון (z-index על ה-shell) */}
          <img src="/brand/inspecting.webp" alt="" aria-hidden="true" className="scan-buddy" />
        <div className="shell term rv d2">
          <div className="core">
            <div className="term-bar">
              {/* dir=ltr רק לכתובת אמיתית - שני מצבי הנפילה הם משפטים בעברית */}
              <span className="addr" dir={known ? "ltr" : undefined} title={website ?? target.url ?? undefined}>
                {known ? address : <span style={{ color: "var(--dim)" }}>{address}</span>}
              </span>
              <span className="pct num">{doneCount}/{steps.length}</span>
            </div>

            <div className="term-body">
              <ul>
                {steps.map((s) => (
                  <StepRow key={s.key} step={s} />
                ))}
              </ul>
            </div>

            {/* ההכרזה לקורא מסך יושבת על שורת הסיכום הקומפקטית, לא על כל הרשימה -
                אחרת כל שלב חדש בזרם מקריא מחדש את כל המסך (ממצא סקירה 26.8) */}
            <div className="term-foot" role="status">
              <span>{doneCount} מתוך {steps.length} שלבים הושלמו</span>
            </div>
          </div>
        </div>
        </div>
      )}
    </ScanFrame>
  );
}

export function ScanRunner({ target, attach }: { target: Target; attach?: ScanAttach }) {
  if (attach) return <AttachedScan target={target} diagnosisId={attach.diagnosisId} />;
  return <LiveScan target={target} />;
}
