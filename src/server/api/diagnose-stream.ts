import { normalizeSiteUrl } from "../../pipeline/site-url";
// הבדיקה עצמה חיה ב-src/pipeline/forbidden-host.ts: אותה חסימה בדיוק רצה גם בשכבת ה-fetch
// של הסורק (כל הפניה, וגם אתר שהגיע מ-Places ולא עבר כאן בכלל)
import { isForbiddenHost } from "../../pipeline/forbidden-host";
import type { DiagnoseEvent } from "../diagnose-events";
import { DiagnoseFailed } from "../run-diagnosis"; // ייבוא ערכי - ה-handler צריך instanceof
import type { DiagnoseTarget } from "../run-diagnosis";

// צר בכוונה - ה-handler צריך רק diagnosisId; ה-fake בבדיקות לא נדרש לבנות DiagnoseOutcome מלא
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
    return { error: "יש לשלוח placeId+name או url - בדיוק אחד מהם" };
  }
  if (hasUrl) {
    try {
      const normalized = normalizeSiteUrl(b.url as string);
      if (isForbiddenHost(normalized.hostname)) return { error: "כתובת פנימית או מקומית אינה נתמכת" };
      return { kind: "url", url: normalized.href };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // הודעות שלנו (למשל "כתובת לא נתמכת") כתובות בעברית ועוברות כלשונן; שגיאות URL
      // מובנות של הפלטפורמה ("Invalid URL") הן באנגלית - מוחלפות בהודעה עברית קבועה
      return { error: /[א-ת]/.test(msg) ? `כתובת האתר לא תקינה: ${msg}` : "כתובת האתר לא תקינה" };
    }
  }
  if (typeof b.name !== "string") return { error: "מסלול Places דורש גם name" };
  const name = b.name.trim();
  if (name.length === 0) return { error: "מסלול Places דורש גם name" };
  // סימטריה עם placeId/url: city בטיפוס לא-נכון (מספרי וכו') לא עובר המרה שקטה ל-undefined
  if (b.city != null && typeof b.city !== "string") return { error: "city חייב להיות מחרוזת" };
  return {
    kind: "places", placeId: b.placeId as string, name,
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
        // emit עמיד לניתוק: המשתמש רענן? enqueue ייכשל, נסמן closed - אבל הסריקה ממשיכה
        // עד report_ready. עקרון "הכול נשמר" (אפיון 3.1): האבחון יופיע ב"אבחונים אחרונים".
        // (גם runDiagnosis עצמו מגן על emit - זו הגנת עומק בשכבת הטרנספורט)
        // הערה לגבי serverless: על שרת Node ארוך-טווח (הרצה מקומית, VM) הסריקה באמת ממשיכה
        // אחרי ניתוק - נבדק אמפירית. ב-Vercel serverless יש סיכון שהאינסטנס יוקפא לאחר סיום
        // התגובה; יש לחווט את after() של Next 15 לפני deploy ציבורי (חסם-deploy, לא כאן)
        const emit = (e: DiagnoseEvent) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
          } catch {
            closed = true;
          }
        };
        // done נפלט על ידי ה-runner עצמו (בעלות האירועים מתועדת ב-diagnose-events) - כאן רק error וסגירה
        // Promise.resolve().then(...) עוטף גם קריאה שזורקת סינכרונית (לפני הגעה ל-await ראשון) -
        // בלי זה, run(target, emit) עצמה הייתה זורקת בתוך start() ומפילה את בניית הזרם (500), לא NDJSON נקי
        Promise.resolve()
          .then(() => run(target, emit))
          .catch((err) => {
            // שגיאות מוכרות שלנו (עברית, נכתבו למשתמש) עוברות; כל השאר - גנרית + לוג מלא בצד שרת
            if (err instanceof DiagnoseFailed) {
              emit({ type: "error", message: err.message });
            } else {
              console.error("⚠️ אבחון נכשל (פרטים בצד שרת בלבד):", err);
              emit({ type: "error", message: "האבחון נכשל, נסו שוב בעוד רגע" });
            }
          })
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
