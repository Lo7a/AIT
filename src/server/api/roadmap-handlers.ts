import type { RoadmapView } from "../roadmap-repo";
import { InterviewError } from "../../pipeline/interview/contract";

// אבן דרך 4, משימה 6: שכבת ה-API של ה-Roadmap. אותו דפוס בדיוק כמו interview-handlers.ts -
// factories שמקבלים פונקציה מוזרקת (מוזרקת מה-route, לא prisma/LLM ישירות) כדי שהמבחנים כאן
// ירוצו לגמרי אופליין. STATUS_BY_KIND/errorResponse משוכפלים בכוונה (לא מיובאים מ-
// interview-handlers.ts) - InterviewError היא כבר סוג השגיאה המשותף בין run-interview.ts
// ל-run-roadmap.ts (ראו contract.ts), אז אין תלות חדשה, רק אי-תלות בין שני קבצי ה-handlers עצמם.
const STATUS_BY_KIND: Record<InterviewError["kind"], number> = {
  not_found: 404,
  conflict: 409,
  invalid: 400,
};

function errorResponse(err: unknown): Response {
  if (err instanceof InterviewError) {
    return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind] });
  }
  // כל שגיאה שאינה InterviewError שלנו נשארת בלוג השרת בלבד - אף פעם לא מגיעה ללקוח עם הודעה
  // גולמית (אותו עיקרון בדיוק כמו interview-handlers.ts)
  console.error("roadmap handler failure:", err);
  return Response.json({ error: "משהו השתבש, נסו שוב בעוד רגע" }, { status: 500 });
}

// POST /api/roadmap/[id] - יצירה/חישוב מחדש. גוף הבקשה מתעלם ממנו לגמרי בכוונה: אין req.json,
// אין ולידציה - הפעולה תלויה רק ב-id שבנתיב, כמו makeStartHandler/makeFinishHandler בראיון.
// הצורה המצומצמת { roadmapId } (בלי usage) היא באחריות ה-route שמזריק את build - ה-handler עצמו
// רק מעביר הלאה מה שהוזרק, בלי לעצב את הצורה (אותה אחריות מדויקת כמו makeStartHandler).
export function makeBuildHandler(build: (id: string) => Promise<{ roadmapId: string }>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      return Response.json(await build(id));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// GET /api/roadmap/[id] - קריאה בלבד, לא משנה מצב (מקביל ל-makeStateHandler בראיון). "אין
// Roadmap" הוא באחריות ה-route (getRoadmapView מחזיר null, לא זורק) - ה-route ממיר null ל-
// InterviewError("not_found") לפני שהוא מגיע לכאן, כדי שהמיפוי לקוד סטטוס יישאר אחיד במקום אחד.
export function makeViewHandler(getView: (id: string) => Promise<RoadmapView>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      return Response.json(await getView(id));
    } catch (err) {
      return errorResponse(err);
    }
  };
}
