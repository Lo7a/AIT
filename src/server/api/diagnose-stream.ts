import { normalizeSiteUrl } from "../../pipeline/site-url";
import type { DiagnoseEvent } from "../diagnose-events";
import type { DiagnoseTarget } from "../run-diagnosis";

// צר בכוונה — ה-handler צריך רק diagnosisId; ה-fake בבדיקות לא נדרש לבנות DiagnoseOutcome מלא
export type DiagnoseRunner = (
  target: DiagnoseTarget,
  onEvent: (e: DiagnoseEvent) => void,
) => Promise<{ diagnosisId: string }>;

export function parseDiagnoseBody(body: unknown): DiagnoseTarget | { error: string } {
  if (body == null || typeof body !== "object") return { error: "גוף הבקשה חייב להיות JSON עם placeId+name או url" };
  const b = body as { placeId?: unknown; name?: unknown; city?: unknown; url?: unknown };
  const hasPlace = typeof b.placeId === "string" && b.placeId.length > 0;
  const hasUrl = typeof b.url === "string" && b.url.length > 0;
  // בדיוק אחד מהמסלולים; שדה בטיפוס לא-נכון (placeId מספרי) לא עובר המרה שקטה
  if (hasPlace === hasUrl || (b.placeId != null && typeof b.placeId !== "string") || (b.url != null && typeof b.url !== "string")) {
    return { error: "יש לשלוח placeId+name או url — בדיוק אחד מהם" };
  }
  if (hasUrl) {
    try {
      return { kind: "url", url: normalizeSiteUrl(b.url as string).href };
    } catch (err) {
      return { error: `כתובת האתר לא תקינה: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (typeof b.name !== "string" || b.name.length === 0) return { error: "מסלול Places דורש גם name" };
  return {
    kind: "places", placeId: b.placeId as string, name: b.name,
    city: typeof b.city === "string" && b.city ? b.city : undefined,
  };
}

export function makeDiagnoseHandler(run: DiagnoseRunner) {
  return async function handle(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "גוף הבקשה חייב להיות JSON" }, { status: 400 });
    }
    const target = parseDiagnoseBody(body);
    if ("error" in target) return Response.json(target, { status: 400 });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        let closed = false;
        // emit עמיד לניתוק: המשתמש רענן? enqueue ייכשל, נסמן closed — אבל הסריקה ממשיכה
        // עד report_ready. עקרון "הכול נשמר" (אפיון 3.1): האבחון יופיע ב"אבחונים אחרונים".
        // (גם runDiagnosis עצמו מגן על emit — זו הגנת עומק בשכבת הטרנספורט)
        const emit = (e: DiagnoseEvent) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
          } catch {
            closed = true;
          }
        };
        // done נפלט על ידי ה-runner עצמו (בעלות האירועים מתועדת ב-diagnose-events) — כאן רק error וסגירה
        run(target, emit)
          .catch((err) => emit({ type: "error", message: err instanceof Error ? err.message : "האבחון נכשל" }))
          .finally(() => {
            if (!closed) {
              try { controller.close(); } catch { /* כבר נסגר */ }
            }
          });
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  };
}
