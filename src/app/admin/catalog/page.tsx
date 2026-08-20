import Link from "next/link";
import { prisma } from "../../../server/db";
import { listCatalogAdmin, catalogCountsByServiceType, CATALOG_PAGE_SIZE } from "../../../server/catalog-admin";
import { SERVICE_TYPES, SERVICE_TYPE_LABEL_HE, serviceTypeLabel } from "../../../pipeline/roadmap/service-type";
import { INDUSTRIES, INDUSTRY_LABEL_HE } from "../../../pipeline/industry";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

// שלב תוכנית העבודה - אותן ארבע אפשרויות של opportunity-score.ts, בעברית
const PHASE_LABEL: Record<string, string> = {
  quick_wins: "צעדים מהירים",
  automation: "אוטומציה",
  ai: "AI",
  transformation: "טרנספורמציה",
};

const COMPLEXITY_LABEL: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה" };

// תוויות הענפים ארוכות ("אוכל מהיר, מאפייה או קונדיטוריה"), ופריט ענפי יכול לשאת כמה.
// שרשור כולן הפך את העמודה הזו לרחבה מכל השאר וגרר את הטבלה לגלילה אופקית על מסך רגיל.
// שתיים ומונה, והרשימה המלאה ב-title לריחוף
function industriesCell(slugs: string[]): React.ReactNode {
  if (slugs.length === 0) return "כל הענפים";
  const label = (s: string) => INDUSTRY_LABEL_HE[s as keyof typeof INDUSTRY_LABEL_HE] ?? s;
  const all = slugs.map(label).join(", ");
  if (slugs.length <= 2) return all;
  return <span title={all}>{slugs.slice(0, 2).map(label).join(", ")} ועוד {slugs.length - 2}</span>;
}

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

// ספריית השירותים: מה אנחנו מוכרים, לפי סוג שירות ולפי ענף.
//
// כל המצב חי ב-URL (חיפוש, סינון, עמוד) ולא ב-state: הכתובת ניתנת לשיתוף ולרענון,
// והמסך עובד עוד לפני שה-JS נטען. השאילתה נטענת בשרת עם עימוד אמיתי - לא נשלפת
// הספרייה כולה לדפדפן וממוינת שם
export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = one(sp.q) ?? "";
  const serviceType = one(sp.type) ?? "";
  const industry = one(sp.industry) ?? "";
  const includeArchived = one(sp.archived) === "1";
  const page = Math.max(Number.parseInt(one(sp.page) ?? "1", 10) || 1, 1);

  const [list, counts] = await Promise.all([
    listCatalogAdmin(prisma, {
      q, serviceType, industry, includeArchived, page, perPage: CATALOG_PAGE_SIZE,
    }),
    catalogCountsByServiceType(prisma, includeArchived),
  ]);

  const params = {
    q: q || undefined,
    type: serviceType || undefined,
    industry: industry || undefined,
    archived: includeArchived ? "1" : undefined,
  };
  const filtered = q !== "" || serviceType !== "" || industry !== "" || includeArchived;

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="card-title flush">ספריית השירותים</h2>
            <Link href="/admin/catalog/new" className="btn sm">
              פריט חדש
              <span className="cap" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </Link>
          </div>

          <p className="-mt-1 mb-5 max-w-[70ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
            כל מה שאנחנו מציעים, בשני צירים: <b>סוג השירות</b> הוא מה שקונים, ו<b>הענפים</b> הם
            למי זה מתאים. פריט בלי ענפים מוצע לכל עסק.
          </p>

          {/* חיפוש וסינון: טופס GET, כלומר המצב נשמר בכתובת */}
          <form className="fbar" method="get" action="/admin/catalog">
            <span className="fld">
              <label htmlFor="cat-q">חיפוש</label>
              <input
                id="cat-q" type="search" name="q" defaultValue={q}
                placeholder="שם, בעיה או פתרון"
              />
            </span>
            <span className="fld">
              <label htmlFor="cat-type">סוג שירות</label>
              <select id="cat-type" name="type" defaultValue={serviceType}>
                <option value="">הכל</option>
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SERVICE_TYPE_LABEL_HE[t]}{counts[t] ? ` (${counts[t]})` : ""}
                  </option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="cat-industry">ענף</label>
              <select id="cat-industry" name="industry" defaultValue={industry}>
                <option value="">הכל</option>
                {INDUSTRIES.map((slug) => (
                  <option key={slug} value={slug}>{INDUSTRY_LABEL_HE[slug]}</option>
                ))}
              </select>
            </span>
            <span className="fld">
              <label htmlFor="cat-arch">מארוכבים</label>
              <select id="cat-arch" name="archived" defaultValue={includeArchived ? "1" : ""}>
                <option value="">מוסתרים</option>
                <option value="1">מוצגים</option>
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/catalog" className="clear">ניקוי</Link>}
            </span>
          </form>

          {list.rows.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>
              {filtered ? "אין פריטים שמתאימים לסינון הזה." : "הספרייה ריקה."}
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>שם השירות</th>
                    <th>סוג</th>
                    <th>ענפים</th>
                    <th>שלב</th>
                    <th>מורכבות</th>
                    <th>מקורות</th>
                    <th>עודכן</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="t-strong">
                        {r.name}
                        {r.archivedAt != null && <span className="chip ms-2">מארוכב</span>}
                      </td>
                      <td className="t-mut">{serviceTypeLabel(r.serviceType)}</td>
                      <td className="t-mut">{industriesCell(r.industries)}</td>
                      <td className="t-mut">{r.phase != null ? PHASE_LABEL[r.phase] ?? r.phase : "לפי הקוד"}</td>
                      <td className="t-mut">{COMPLEXITY_LABEL[r.complexity] ?? r.complexity}</td>
                      {/* מספר הבנצ'מרקים הוא מספר המקורות שמאחורי המחיר. אפס = מחיר בלי
                          מקור, וזה בדיוק מה שכלל אפס-מספרים-מומצאים אוסר */}
                      <td className={r.benchmarkCount === 0 ? "num t-bad" : "num"}>{r.benchmarkCount}</td>
                      <td className="t-mut num">{DATE_FMT.format(r.updatedAt)}</td>
                      <td>
                        <Link href={`/admin/catalog/${r.id}`} className="ghost-act">עריכה</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pager
            page={list.page} pages={list.pages} total={list.total}
            basePath="/admin/catalog" params={params} unit="שירותים"
          />
        </div>
      </section>
    </main>
  );
}
