import type { InterviewSnapshot, TurnInput, TurnResult } from "../run-interview";
import { InterviewError } from "../../pipeline/interview/contract";

// קוד סטטוס נגזר אך ורק מ-InterviewError.kind - לא מהיוריסטיקת regex ישנה על תוכן ההודעה
// (שממנה: כל שגיאת תשתית עם עברית בתוכה - למשל שם עסק בהודעת Prisma - הייתה חוזרת ללקוח
// כ-400 עם ההודעה הגולמית, ו"לא נמצא"/"מעבר סטטוס" בכל מקום בהודעה יכלו להתאים בטעות)
const STATUS_BY_KIND: Record<InterviewError["kind"], number> = {
  not_found: 404,
  conflict: 409,
  invalid: 400,
};

function errorResponse(err: unknown): Response {
  if (err instanceof InterviewError) {
    return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind] });
  }
  // כל שגיאה שאינה InterviewError שלנו נשארת בלוג השרת בלבד - כולל שגיאות תשתית שבמקרה
  // מכילות עברית (למשל שורת scan פגומה מ-diagnosis-read.ts, או שגיאת Prisma עם נתוני עסק)
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

// תקרת אורך תוכן (משימה 3-12): בלי זה תשובה בת מיליוני תווים עוברת ולידציה בהצלחה (היא לא
// ריקה) וממשיכה עד לפרומפט ה-LLM ולשמירה ב-DB - עלות טוקנים לא מבוקרת וזליגת זיכרון פוטנציאלית.
// נבדק לפני כל עבודה בפועל (turn), לא רק לפני השמירה
export const MAX_CONTENT_CHARS = 4000;

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
    if (b.content.length > MAX_CONTENT_CHARS) {
      return Response.json({ error: "התשובה ארוכה מדי, נסו לקצר אותה" }, { status: 400 });
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
