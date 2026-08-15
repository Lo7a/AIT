import { describe, expect, it } from "vitest";
import { makeBuildHandler, makeViewHandler } from "../src/server/api/roadmap-handlers";
import type { RoadmapView } from "../src/server/roadmap-repo";
import { InterviewError } from "../src/pipeline/interview/contract";

// כל המבחנים כאן אופליין לגמרי - ה-handlers מקבלים פונקציות מוזרקות (build/getView), בלי DB
// אמיתי ובלי LLM אמיתי. אותו סגנון בדיוק כמו tests/interview-handlers.test.ts.

// מוקלד כ-RoadmapView (ולא as never באתר הקריאה) כדי שסטייה בין צורת התצוגה שהמסך מקבל לבין
// מה שה-repo באמת מחזיר תיפול ב-typecheck - הפיקסצ'ר הקודם הכריז phase: "quick_win" שאינו
// ערך חוקי של Phase, ואף אחד לא ראה את זה
const view: RoadmapView = {
  id: "rm1",
  diagnosisId: "d1",
  createdAt: new Date("2026-08-15T00:00:00Z"),
  items: [
    {
      id: "it1", catalogId: "cat1", score: 80, confidence: "high", phase: "quick_wins",
      status: "proposed", name: "קביעת תורים אונליין", problem: "בעיה", solution: "פתרון",
      costRange: "100-500 בחודש", savingRange: "2-5 שעות בשבוע", complexity: "low",
      installTime: "עד שבוע", reasoning: "נימוק", benchmarks: [],
    },
  ],
};

function post(body?: unknown): Request {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://t/api/roadmap/d1", init);
}

describe("makeBuildHandler", () => {
  it("הצלחה - 200 עם roadmapId", async () => {
    const h = makeBuildHandler(async () => ({ roadmapId: "rm1" }));
    const res = await h(post(), "d1");
    expect(res.status).toBe(200);
    expect((await res.json()).roadmapId).toBe("rm1");
  });

  it("גוף הבקשה מתעלם ממנו לגמרי - גם JSON תקין וגם זבל גמור לא משנים כלום ולא נקראים", async () => {
    let received: string | null = "לא נקרא";
    const h = makeBuildHandler(async (id) => {
      received = id;
      return { roadmapId: "rm1" };
    });

    const res1 = await h(post({ some: "junk", data: [1, 2, 3] }), "d1");
    expect(res1.status).toBe(200);
    expect((await res1.json()).roadmapId).toBe("rm1");
    expect(received).toBe("d1");

    // גוף שהוא לא JSON תקין בכלל - עדיין 200, כי req.json() אף פעם לא נקרא
    const res2 = await h(post("זבל שאינו json {{{"), "d1");
    expect(res2.status).toBe(200);
    expect((await res2.json()).roadmapId).toBe("rm1");
  });

  it("InterviewError('conflict') - 409 עם ההודעה המדויקת", async () => {
    const h = makeBuildHandler(async () => {
      throw new InterviewError("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (interviewing -> roadmap_ready)", "conflict");
    });
    const res = await h(post(), "d1");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("מעבר סטטוס נכשל - הסטטוס השתנה במקביל (interviewing -> roadmap_ready)");
  });

  it("InterviewError('not_found') - 404 עם ההודעה", async () => {
    const h = makeBuildHandler(async () => { throw new InterviewError("האבחון לא נמצא", "not_found"); });
    const res = await h(post(), "אין");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("האבחון לא נמצא");
  });

  it("InterviewError('invalid') - 400 עם ההודעה", async () => {
    const h = makeBuildHandler(async () => {
      throw new InterviewError("אי אפשר לבנות Roadmap במצב הנוכחי של האבחון", "invalid");
    });
    const res = await h(post(), "d1");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("אי אפשר לבנות Roadmap במצב הנוכחי של האבחון");
  });

  it("שגיאה לא-InterviewError - 500 גנרי עברית בלי דליפת פרטים", async () => {
    const h = makeBuildHandler(async () => { throw new Error("Unique constraint failed on business \"עסק בעמ\""); });
    const res = await h(post(), "d1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("עסק בעמ");
    expect(body.error).not.toContain("Unique constraint");
    expect(body.error).toMatch(/[א-ת]/);
  });
});

describe("makeViewHandler", () => {
  it("נמצא - 200 עם ה-view המלא", async () => {
    const h = makeViewHandler(async () => view);
    const res = await h(new Request("http://t"), "d1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rm1");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("קביעת תורים אונליין");
    // הצורה שהמסך יצרוך (משימה 8) עוברת שלמה דרך ה-handler, כולל השדות שמניעים תגי ביטחון
    // וקיבוץ לפי שלב - Response.json ממיר Date למחרוזת ISO, וזה מה שהלקוח מקבל בפועל
    expect(body.items[0]).toMatchObject({
      score: 80, confidence: "high", phase: "quick_wins", status: "proposed",
      costRange: "100-500 בחודש", savingRange: "2-5 שעות בשבוע", reasoning: "נימוק",
    });
    expect(body.createdAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("אין Roadmap - 404 (not_found)", async () => {
    const h = makeViewHandler(async () => { throw new InterviewError("אין Roadmap לאבחון הזה", "not_found"); });
    const res = await h(new Request("http://t"), "d1");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("אין Roadmap לאבחון הזה");
  });

  it("שגיאה לא-InterviewError - 500 גנרי בלי דליפת פרטים", async () => {
    const h = makeViewHandler(async () => { throw new Error("ECONNRESET at pool"); });
    const res = await h(new Request("http://t"), "d1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("ECONNRESET");
    expect(body.error).toMatch(/[א-ת]/);
  });
});
