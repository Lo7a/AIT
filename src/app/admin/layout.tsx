import { isImpersonating } from "../../server/auth/impersonation";
import { requireAdmin } from "./require-admin";
import { AppShell } from "../ui/app-shell";
import { AdminTitle } from "./admin-title";

export const dynamic = "force-dynamic";

// פס ההתחזות: אזהרה על גבי הטוקנים (כמו במרכז העסק) - בולט בכוונה, אדמין שצופה בתור
// מישהו אחר חייב לראות את זה בכל מסך ניהול
const WARN_STRIP_STYLE = {
  background: "rgba(var(--warn-rgb),.12)",
  borderBottom: "1px solid rgba(var(--warn-rgb),.4)",
  color: "var(--warn)",
} as const;

// המעטפת של מסכי הניהול: השער, שורת הכותרת, פס ההתחזות והסיידבר.
//
// עד 20.8 הניווט כאן היה שורת גלולות מעל התוכן, והמייסד ביקש להעביר אותו לסיידבר כמו
// בכל שאר המערכת. הסיידבר הוא AppShell עצמו במדור "admin" ולא מעטפת שנייה - שתי מעטפות
// היו מתפצלות בתחזוקה, וזה בדיוק מה שכלל השימוש החוזר ב-CLAUDE.md אוסר
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const acting = await requireAdmin();

  return (
    <AppShell section="admin" userLabel={acting.actor.email ?? null}>
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

      {/* הכותרת: הזהות בלבד. השם והחזרה למרכז העסק עברו לסיידבר, ולהשאיר אותם גם כאן
          היה מציג את אותו קישור פעמיים על אותו מסך */}
      <header className="topbar">
        <AdminTitle />
        <div className="side">
          <span className="chip hidden sm:inline-block">
            אדמין <span dir="ltr">{acting.actor.email ?? "ללא אימייל"}</span>
          </span>
        </div>
      </header>

      {children}
    </AppShell>
  );
}
