import type { InterviewSnapshot, TurnInput, TurnResult } from "../run-interview";

// שגיאות עבריות שלנו עוברות ללקוח; כל השאר נשאר בלוג השרת (הדפוס מ-2ב).
// ההבחנה: הודעות המערכת שלנו כתובות עברית, שגיאות תשתית לא
function isOurs(err: unknown): err is Error {
  return err instanceof Error && /[א-ת]/.test(err.message);
}

function errorResponse(err: unknown): Response {
  if (isOurs(err)) {
    const status = /לא נמצא/.test(err.message) ? 404
      : /מעבר סטטוס/.test(err.message) ? 409
      : 400;
    return Response.json({ error: err.message }, { status });
  }
  console.error("interview handler failure:", err);
  return Response.json({ error: "משהו השתבש, נסו שוב בעוד רגע" }, { status: 500 });
}

export function makeStateHandler(getState: (id: string) => Promise<InterviewSnapshot>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      return Response.json(await getState(id));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function makeStartHandler(start: (id: string) => Promise<InterviewSnapshot>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      return Response.json(await start(id));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function makeMessageHandler(turn: (id: string, input: TurnInput) => Promise<TurnResult>) {
  return async function handle(req: Request, id: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "גוף הבקשה חייב להיות JSON" }, { status: 400 });
    }
    const b = body as { content?: unknown; questionKey?: unknown; isFreeText?: unknown } | null;
    if (b == null || typeof b.content !== "string" || b.content.trim().length === 0
      || (b.questionKey != null && typeof b.questionKey !== "string")
      || typeof b.isFreeText !== "boolean") {
      return Response.json({ error: "נדרשים content (מחרוזת לא ריקה) ו-isFreeText" }, { status: 400 });
    }
    try {
      return Response.json(await turn(id, {
        content: b.content, questionKey: b.questionKey ?? undefined, isFreeText: b.isFreeText,
      }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function makeFinishHandler(finish: (id: string) => Promise<void>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      await finish(id);
      return Response.json({ ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
