import Link from "next/link";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { DIAGNOSIS_STATUS_LABEL } from "../pipeline/report/presenter";
import { SearchBox } from "./search-box";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה — בלי קאש סטטי

export default async function HomePage() {
  const recent = await listRecentDiagnoses(prisma, 8);
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-bold">אבחון דיגיטלי לעסק שלך</h1>
      <p className="mt-3 text-lg text-slate-600">
        שם העסק או כתובת האתר — ותוך דקה יש דוח: מה עובד, מה חסר, ומה שווה לתקן קודם.
      </p>
      <SearchBox />

      {recent.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold text-slate-700">אבחונים אחרונים</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="font-medium">{d.businessName}</span>
                  <span className="mr-2 text-sm text-slate-500">
                    {DIAGNOSIS_STATUS_LABEL[d.status]}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {d.overall != null && <span className="text-sm font-semibold">{d.overall}/100</span>}
                  {d.status === "report_ready" && (
                    <Link href={`/report/${d.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      לדוח ←
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
