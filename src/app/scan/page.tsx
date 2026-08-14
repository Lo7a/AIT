import { ScanRunner } from "./scan-runner";

// searchParams ב-Next 15 הוא Promise; העמוד דינמי מטבעו
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ placeId?: string; name?: string; url?: string }>;
}) {
  const params = await searchParams;
  const hasPlace = !!params.placeId && !!params.name;
  const hasUrl = !!params.url;
  if (!hasPlace && !hasUrl) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-[#9F2F2D]">חסר יעד לאבחון.</p>
        <a href="/" className="text-[#111111] underline-offset-4 hover:underline">
          חזרה לעמוד הראשי
        </a>
      </main>
    );
  }
  const target = hasUrl ? { url: params.url } : { placeId: params.placeId, name: params.name };
  return <ScanRunner target={target} />;
}
