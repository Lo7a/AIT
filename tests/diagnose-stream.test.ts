import { describe, expect, it } from "vitest";
import { makeDiagnoseHandler, parseDiagnoseBody } from "../src/server/api/diagnose-stream";
import type { DiagnoseEvent } from "../src/server/diagnose-events";
import { DiagnoseFailed } from "../src/server/run-diagnosis";
import type { DiagnoseTarget } from "../src/server/run-diagnosis";

function req(body: unknown): Request {
  return new Request("http://test/api/diagnose", { method: "POST", body: JSON.stringify(body) });
}

async function eventsOf(res: Response): Promise<DiagnoseEvent[]> {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as DiagnoseEvent);
}

describe("parseDiagnoseBody", () => {
  it("מסלול Places: placeId + name", () => {
    expect(parseDiagnoseBody({ placeId: "p1", name: "עסק" }))
      .toEqual({ kind: "places", placeId: "p1", name: "עסק", city: undefined });
  });

  it("מסלול URL: מנרמל ומחזיר href", () => {
    expect(parseDiagnoseBody({ url: "www.x.co.il" })).toEqual({ kind: "url", url: "https://www.x.co.il/" });
  });

  it("url פסול - שגיאה עברית, לא זריקה", () => {
    expect(parseDiagnoseBody({ url: "mailto:x@y.il" })).toMatchObject({ error: expect.stringContaining("כתובת") });
  });

  it("url שגורם לשגיאת URL באנגלית (Invalid URL) - מוחלפת בהודעה עברית קבועה, לא הטקסט הגולמי", () => {
    const result = parseDiagnoseBody({ url: "http://" });
    expect(result).toMatchObject({ error: "כתובת האתר לא תקינה" });
    if ("error" in result) expect(result.error).not.toMatch(/[a-zA-Z]/);
  });

  it("גם וגם / לא כלום - שגיאה", () => {
    expect(parseDiagnoseBody({})).toHaveProperty("error");
    expect(parseDiagnoseBody({ placeId: "p", name: "x", url: "https://x.co.il" })).toHaveProperty("error");
  });

  it("placeId בלי name - שגיאה", () => {
    expect(parseDiagnoseBody({ placeId: "p1" })).toHaveProperty("error");
  });

  it("שדות לא-מחרוזת - שגיאה, לא זריקה", () => {
    expect(parseDiagnoseBody({ placeId: 5, name: "x" })).toHaveProperty("error");
    expect(parseDiagnoseBody({ url: 42 })).toHaveProperty("error");
    expect(parseDiagnoseBody(null)).toHaveProperty("error");
    expect(parseDiagnoseBody("str")).toHaveProperty("error");
  });

  it("city לא-מחרוזת (ולא null) - שגיאה, בלי המרה שקטה", () => {
    expect(parseDiagnoseBody({ city: 5, placeId: "p", name: "x" })).toHaveProperty("error");
  });

  it("name של רווחים בלבד - שגיאה אחרי trim", () => {
    expect(parseDiagnoseBody({ placeId: "p1", name: "   " })).toHaveProperty("error");
  });

  it("SSRF guard: מארחים פנימיים/מקומיים נדחים בעברית", () => {
    for (const bad of [
      "http://localhost:3000",
      "http://169.254.169.254/x",
      "http://192.168.1.1",
      "http://[::1]:8080",
    ]) {
      expect(parseDiagnoseBody({ url: bad })).toMatchObject({ error: expect.stringContaining("פנימית") });
    }
  });

  it("SSRF guard: כתובת ציבורית תקינה לא נחסמת", () => {
    expect(parseDiagnoseBody({ url: "https://x.co.il" })).toEqual({ kind: "url", url: "https://x.co.il/" });
  });

  it("SSRF guard: דומיין ציבורי שמתחיל ב-fc/fd אינו IPv6 ולא נחסם", () => {
    // הבדיקות של unique-local (fc00::/7) חלות רק על ליטרל IPv6 - שם דומיין רגיל שמתחיל
    // באותן שתי אותיות הוא אתר לקוח לגיטימי לכל דבר
    for (const good of ["https://fcbarcelona.com", "https://fdny.org", "https://fe80shop.co.il"]) {
      expect(parseDiagnoseBody({ url: good })).not.toHaveProperty("error");
    }
  });

  it("SSRF guard: ליטרל IPv6 פנימי עדיין נחסם (fd00/fc00/fe80/::1)", () => {
    for (const bad of ["http://[fd00::1]", "http://[fc00::1]", "http://[fe80::1]", "http://[::1]"]) {
      expect(parseDiagnoseBody({ url: bad })).toMatchObject({ error: expect.stringContaining("פנימית") });
    }
  });
});

describe("makeDiagnoseHandler", () => {
  // ה-runner (runDiagnosis) הוא האחראי הבלעדי לאירוע done - הוא פולט אותו אחרי ה-backfill.
  // ה-handler רק מזרים וסוגר; לכן ה-fake כאן פולט done בעצמו, וה-handler לא מוסיף אחד משלו
  it("מזרים את האירועים כפי שנפלטו ומסיים בסגירת הזרם", async () => {
    const handler = makeDiagnoseHandler(async (_t, onEvent) => {
      onEvent({ type: "created", diagnosisId: "d1", businessName: "עסק" });
      onEvent({ type: "step", key: "details", label: "מאתרים" });
      onEvent({ type: "done", diagnosisId: "d1" });
      return { diagnosisId: "d1" };
    });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await eventsOf(res);
    expect(events.map((e) => e.type)).toEqual(["created", "step", "done"]);
    expect(events[2]).toEqual({ type: "done", diagnosisId: "d1" });
  });

  it("runner שנכשל עם שגיאה לא-מוכרת - אירוע error בזרם (לא 500), הודעה גנרית ולא פרטי השגיאה", async () => {
    const handler = makeDiagnoseHandler(async () => { throw new Error("הסריקה קרסה"); });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    const events = await eventsOf(res);
    expect(events[events.length - 1]).toEqual({ type: "error", message: "האבחון נכשל, נסו שוב בעוד רגע" });
  });

  it("runner שנכשל עם DiagnoseFailed - ההודעה העברית המוכרת עוברת כמות שהיא", async () => {
    const handler = makeDiagnoseHandler(async () => {
      throw new DiagnoseFailed("שני המקורות נכשלו, אין ממצאים לאבחון");
    });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    const events = await eventsOf(res);
    expect(events[events.length - 1]).toEqual({ type: "error", message: "שני המקורות נכשלו, אין ממצאים לאבחון" });
  });

  it("runner שזורק סינכרונית (בלי להגיע ל-await ראשון) - עדיין 200 וזרם עם error בסוף", async () => {
    const handler = makeDiagnoseHandler(() => { throw new Error("קורס לפני שמוחזר Promise"); });
    const res = await handler(req({ placeId: "p1", name: "עסק" }));
    expect(res.status).toBe(200);
    const events = await eventsOf(res);
    expect(events[events.length - 1]).toEqual({ type: "error", message: "האבחון נכשל, נסו שוב בעוד רגע" });
  });

  it("runner שנכשל אחרי אירועים - האירועים שקדמו נשמרים בזרם", async () => {
    const handler = makeDiagnoseHandler(async (_t, onEvent) => {
      onEvent({ type: "created", diagnosisId: "d1", businessName: "עסק" });
      throw new Error("נפל באמצע");
    });
    const events = await eventsOf(await handler(req({ placeId: "p1", name: "עסק" })));
    expect(events.map((e) => e.type)).toEqual(["created", "error"]);
  });

  it("גוף פסול - 400 JSON רגיל, בלי להריץ אבחון", async () => {
    let ran = false;
    const handler = makeDiagnoseHandler(async () => { ran = true; return { diagnosisId: "x" }; });
    const res = await handler(req({}));
    expect(res.status).toBe(400);
    expect(ran).toBe(false);
  });

  it("גוף לא-JSON - 400, לא זריקה", async () => {
    const handler = makeDiagnoseHandler(async () => ({ diagnosisId: "x" }));
    const res = await handler(new Request("http://test/api/diagnose", { method: "POST", body: "לא json" }));
    expect(res.status).toBe(400);
  });
});
