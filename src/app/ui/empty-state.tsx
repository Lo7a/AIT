import Link from "next/link";

// מצב ריק או "לא נמצא" שתופס מסך שלם: כרטיס ממורכז.
//
// בנוי על מחלקות ה-.auth של מסך ההתחברות ולא על מחלקות משלו - זו בדיוק אותה
// גיאומטריה (כרטיס יחיד ממורכז בגובה מלא), ולהגדיר אותה פעם שנייה זה בדיוק מה
// שכלל השימוש החוזר ב-CLAUDE.md אוסר.
//
// הרכיב הזה החליף שלושה מסכים שהיו עדיין על הפלטה הישנה עם צבעים קשיחים
// (#111111 ו-#6F6E6A) - כלומר טקסט כמעט בלתי נראה במצב כהה, ובלי שום התחשבות
// במצב הבהיר. שניים מהם היו זהים מילה במילה.
export function EmptyState({
  title, body, actionHref = "/hub", actionLabel = "חזרה למרכז העסק",
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="auth">
      <div className="shell auth-shell rv">
        <div className="core auth-core">
          <span
            className="mx-auto grid place-items-center rounded-full"
            style={{
              width: 46, height: 46,
              background: "rgba(var(--acc-rgb),.1)",
              border: "1px solid rgba(var(--acc-rgb),.25)",
              color: "var(--acc-soft)",
            }}
            aria-hidden="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.2-3.2M11 8.2v3.4M11 14.2v.4" />
            </svg>
          </span>
          <h1>{title}</h1>
          <p className="sub">{body}</p>
          <Link href={actionHref} className="btn sm self-center">
            {actionLabel}
            <span className="cap" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
