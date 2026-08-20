import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../server/db";
import { getCatalogItemAdmin } from "../../../../server/catalog-admin";
import { validGapKeys } from "../../../../server/api/admin-catalog-handler";
import { requireAdmin } from "../../require-admin";
import { CatalogForm } from "../catalog-form";
import { serviceTypeLabel } from "../../../../pipeline/roadmap/service-type";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

// עריכת פריט אחד בספרייה. saved/error מגיעים מההפניה של ה-API אחרי שליחת הטופס
export default async function AdminCatalogItemPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const item = await getCatalogItemAdmin(prisma, id);
  if (item == null) notFound();

  const saved = one(sp.saved) === "1";
  const error = one(sp.error);

  return (
    <main className="board">
      <section className="shell c12 rv d1">
        <div className="core card-pad">
          <nav className="cf-crumb">
            <Link href="/admin/catalog">ספריית השירותים</Link>
            <span aria-hidden="true">/</span>
            <span>{item.name}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title" style={{ marginBottom: 0 }}>{item.name}</h2>
            <span className="chip">{serviceTypeLabel(item.serviceType)}</span>
            {item.archivedAt != null && <span className="chip">מארוכב</span>}
          </div>

          {saved && <p className="cf-ok">השינויים נשמרו.</p>}
          {error != null && error !== "" && <p className="cf-err">{error}</p>}

          <CatalogForm item={item} gapKeyOptions={[...validGapKeys()].sort()} />
        </div>
      </section>
    </main>
  );
}
