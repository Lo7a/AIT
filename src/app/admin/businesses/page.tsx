import Link from "next/link";
import { prisma } from "../../../server/db";
import { listBusinessesAdmin } from "../../../server/business-admin";
import { INDUSTRIES, INDUSTRY_LABEL_HE } from "../../../pipeline/industry";
import { pageParam } from "../../../server/paging";
import { requireAdmin } from "../require-admin";
import { Pager } from "../../ui/pager";
import { DATE_FMT } from "../labels";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const industryLabel = (slug: string) =>
  slug === "unknown" ? "לא זוהה" : INDUSTRY_LABEL_HE[slug as keyof typeof INDUSTRY_LABEL_HE] ?? slug;

// כל העסקים במערכת: מי הם, של מי, כמה אבחונים ומתי האחרון. הענף נגזר מסוג העסק שגוגל
// החזיר בסריקה האחרונה - הוא לא שדה שמישהו הזין, ולכן "לא זוהה" הוא ערך אמיתי ומוצג
export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = one(sp.q) ?? "";
  const industry = one(sp.industry) ?? "";
  const page = pageParam(one(sp.page));

  const list = await listBusinessesAdmin(prisma, { q, industry, page });
  const params = { q: q || undefined, industry: industry || undefined };
  const filtered = q !== "" || industry !== "";

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <h2 className="card-title">עסקים</h2>

          <form className="fbar" method="get" action="/admin/businesses">
            <span className="fld">
              <label htmlFor="bz-q">חיפוש</label>
              <input id="bz-q" type="search" name="q" defaultValue={q} placeholder="שם, עיר, אתר או בעלים" />
            </span>
            <span className="fld">
              <label htmlFor="bz-industry">ענף</label>
              <select id="bz-industry" name="industry" defaultValue={industry}>
                <option value="">הכל</option>
                {INDUSTRIES.map((slug) => (
                  <option key={slug} value={slug}>{INDUSTRY_LABEL_HE[slug]}</option>
                ))}
                <option value="unknown">לא זוהה</option>
              </select>
            </span>
            <span className="fbar-act">
              <button type="submit" className="btn sm">סינון</button>
              {filtered && <Link href="/admin/businesses" className="clear">ניקוי</Link>}
            </span>
          </form>

          {/* הסינון לפי ענף קורה אחרי הגזירה ולא במסד, ולכן העמוד עשוי לצאת קצר מהרגיל.
              נאמר במפורש במקום להשאיר את הקורא עם מספר שנראה לא עקבי */}
          {industry !== "" && (
            <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
              הענף נגזר מהסריקה האחרונה של כל עסק, ולכן הסינון חל על העמוד הנוכחי בלבד.
            </p>
          )}

          {list.rows.length === 0 ? (
            <p className="t-empty" style={{ color: "var(--mut)" }}>
              {filtered ? "אין עסקים שמתאימים לסינון הזה." : "אין עדיין עסקים."}
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>עסק</th>
                    <th>ענף</th>
                    <th>עיר</th>
                    <th>בעלים</th>
                    <th>אבחונים</th>
                    <th>אבחון אחרון</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((b) => (
                    <tr key={b.id}>
                      <td className="t-strong">{b.name}</td>
                      <td className={b.industry === "unknown" ? "t-mut" : undefined}>{industryLabel(b.industry)}</td>
                      <td className="t-mut">{b.city ?? "-"}</td>
                      <td className="t-mut" dir="ltr">{b.ownerEmail ?? "-"}</td>
                      <td className="num">{b.diagnoses}</td>
                      <td className="t-mut num">
                        {b.lastDiagnosisAt != null ? DATE_FMT.format(b.lastDiagnosisAt) : "-"}
                      </td>
                      <td><Link href={`/admin/businesses/${b.id}`} className="ghost-act">לעסק</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pager
            page={list.page} pages={list.pages} total={list.total}
            basePath="/admin/businesses" params={params} unit="עסקים"
          />
        </div>
      </section>
    </main>
  );
}
