import Link from "next/link";
import { validGapKeys } from "../../../../server/api/admin-catalog-handler";
import { requireAdmin } from "../../require-admin";
import { CatalogForm } from "../catalog-form";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// שירות חדש. אותו טופס בדיוק של העריכה (item=null) ולא עותק שני שלו - טופס יצירה נפרד
// היה מתפצל מטופס העריכה בשדה הראשון שמתווסף
export default async function AdminCatalogNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const error = one((await searchParams).error);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <nav className="cf-crumb">
            <Link href="/admin/catalog">ספריית השירותים</Link>
            <span aria-hidden="true">/</span>
            <span>שירות חדש</span>
          </nav>

          <h2 className="card-title">שירות חדש</h2>
          <p className="-mt-2 mb-5 max-w-[66ch] text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
            אחרי היצירה אפשר להוסיף לשירות את המקורות שמאחורי המחיר. עד שיהיה לו מקור אחד
            לפחות הוא יסומן באדום ברשימה.
          </p>

          {error != null && error !== "" && <p className="cf-err">{error}</p>}

          <CatalogForm item={null} gapKeyOptions={[...validGapKeys()].sort()} />
        </div>
      </section>
    </main>
  );
}
