import Link from "next/link";

export default function ReportNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="animate-fade-up font-[family-name:var(--font-frank)] text-4xl font-bold tracking-tight">
        האבחון לא נמצא
      </h1>
      <p className="mt-3 animate-fade-up text-lg text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
        ייתכן שהקישור שגוי או שהאבחון עדיין לא הושלם.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block animate-fade-up text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        style={{ animationDelay: "160ms" }}
      >
        חזרה לעמוד הראשי
      </Link>
    </main>
  );
}
