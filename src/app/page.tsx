import Link from "next/link";
import { prisma } from "../server/db";
import { listRecentDiagnoses } from "../server/diagnosis-read";
import { DIAGNOSIS_STATUS_LABEL } from "../pipeline/report/presenter";
import { SearchBox } from "./search-box";

export const dynamic = "force-dynamic"; // הרשימה חייבת להיות טרייה - בלי קאש סטטי

export default async function HomePage() {
  const recent = await listRecentDiagnoses(prisma, 8);
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="animate-fade-up font-[family-name:var(--font-serif)] text-4xl font-bold tracking-tight">
        כמה שווה הנוכחות הדיגיטלית של העסק שלך?
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#787774]" style={{ animationDelay: "80ms" }}>
        מכניסים שם עסק או כתובת אתר. תוך דקה מקבלים תמונה אמיתית: מה עובד, מה חסר ומה כדאי לתקן קודם.
      </p>
      <SearchBox />

      {recent.length > 0 && (
        <section className="mt-14 animate-fade-up" style={{ animationDelay: "160ms" }}>
          <h2 className="font-[family-name:var(--font-serif)] text-lg font-bold tracking-tight">
            אבחונים אחרונים
          </h2>
          <ul className="mt-3 divide-y divide-black/[0.06] rounded-lg border border-black/[0.06] bg-white">
            {recent.map((d, i) => (
              <li
                key={d.id}
                className="flex animate-fade-up items-center justify-between px-4 py-3"
                style={{ animationDelay: `${200 + i * 80}ms` }}
              >
                <span>
                  <span className="font-medium">{d.businessName}</span>
                  <span className="mr-2 text-sm text-[#787774]">
                    {DIAGNOSIS_STATUS_LABEL[d.status]}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {d.overall != null && (
                    <span className="tabular-nums text-sm font-semibold">{d.overall}/100</span>
                  )}
                  {d.status === "report_ready" && (
                    <Link
                      href={`/report/${d.id}`}
                      className="text-sm font-medium text-[#111111] underline-offset-4 hover:underline"
                    >
                      לדוח
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
