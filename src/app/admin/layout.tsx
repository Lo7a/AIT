import Link from "next/link";
import { isImpersonating } from "../../server/auth/impersonation";
import { requireAdmin } from "./require-admin";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

// פס ההתחזות: אזהרה על גבי הטוקנים (כמו במרכז העסק) - בולט בכוונה, אדמין שצופה בתור
// מישהו אחר חייב לראות את זה בכל מסך ניהול
const WARN_STRIP_STYLE = {
  background: "rgba(var(--warn-rgb),.12)",
  borderBottom: "1px solid rgba(var(--warn-rgb),.4)",
  color: "var(--warn)",
} as const;

// המעטפת של מסכי הניהול: השער, שורת הכותרת, פס ההתחזות וניווט המסכים. הסיידבר של המוצר
// (AppShell) לא נכנס לכאן - הפריטים שלו קשורים לאבחון פתוח של בעל עסק, ולניהול אין אבחון.
// המבנה הוויזואלי זהה: app > main-col > topbar > תוכן ב-board
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const acting = await requireAdmin();

  return (
    <div className="app">
      <div className="main-col">
        {isImpersonating(acting) && (
          <div
            className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm font-medium"
            style={WARN_STRIP_STYLE}
          >
            <span>
              מצב התחזות פעיל: אתה רואה את המערכת בתור{" "}
              <span className="font-bold" dir="ltr">{acting.user.email ?? "משתמש ללא אימייל"}</span>
            </span>
            <form action="/api/admin/impersonate" method="post">
              <input type="hidden" name="action" value="stop" />
              <button type="submit" className="cursor-pointer font-bold underline underline-offset-4">חזרה לעצמי</button>
            </form>
          </div>
        )}

        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">AIT</span>
            <span className="brand-txt"><small>יועץ דיגיטלי</small><b>ניהול</b></span>
          </Link>
          <div className="side">
            <span className="chip hidden sm:inline-block">
              אדמין <span dir="ltr">{acting.actor.email ?? "ללא אימייל"}</span>
            </span>
            <Link href="/" className="btn-quiet">חזרה למרכז העסק</Link>
          </div>
        </header>

        <AdminNav />
        {children}
      </div>
    </div>
  );
}
