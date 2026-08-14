import { ScanRunner } from "./scan-runner";

// searchParams ב-Next 15 הוא Promise; העמוד דינמי מטבעו
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ placeId?: string; name?: string; url?: string; city?: string }>;
}) {
  const params = await searchParams;
  const hasPlace = !!params.placeId && !!params.name;
  const hasUrl = !!params.url;
  if (!hasPlace && !hasUrl) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="animate-fade-up font-[family-name:var(--font-serif)] text-3xl font-bold tracking-tight">
          חסר יעד לאבחון
        </h1>
        <p className="mt-2 animate-fade-up text-[#6F6E6A]" style={{ animationDelay: "80ms" }}>
          לא נמצאו פרטי עסק או כתובת אתר להתחלת האבחון.
        </p>
        <a
          href="/"
          className="mt-6 inline-block animate-fade-up text-[#111111] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
          style={{ animationDelay: "160ms" }}
        >
          חזרה לעמוד הראשי
        </a>
      </main>
    );
  }
  const target = hasUrl
    ? { url: params.url }
    : { placeId: params.placeId, name: params.name, city: params.city };
  return <ScanRunner target={target} />;
}
