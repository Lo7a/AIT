import { afterEach, describe, expect, it } from "vitest";
import {
  reportExternalCall, setExternalCallSink, stripHeavyStrings,
} from "../src/pipeline/observe";
import { installExternalCallSink, offloadHeavyPayload, withCallContext } from "../src/server/external-log";

// ארכיון הקריאות החיצוניות (הכרעת מייסד 17.8): התפר הטהור (observe) + הצד הכותב (external-log).
// חוקי הברזל הנבדקים: תצפית לעולם לא זורקת, ההקשר (משתמש/אבחון) מתמזג נכון, ו-blobs נחתכים.

afterEach(() => setExternalCallSink(null));

describe("observe - התפר הטהור", () => {
  it("בלי sink - דיווח הוא no-op שקט", () => {
    expect(() => reportExternalCall({ service: "gemini", context: "t", ok: true, durationMs: 1 })).not.toThrow();
  });

  it("sink שזורק לא מפיל את המדווח", () => {
    setExternalCallSink(() => { throw new Error("sink שבור"); });
    expect(() => reportExternalCall({ service: "places", context: "t", ok: true, durationMs: 1 })).not.toThrow();
  });

  it("stripHeavyStrings חותך מחרוזות ענק ומשאיר הכל מסביבן", () => {
    const big = "x".repeat(30_000);
    const out = stripHeavyStrings({
      a: "רגיל", n: 5, arr: [big, "קטן"], nested: { shot: big, keep: true },
    }) as any;
    expect(out.a).toBe("רגיל");
    expect(out.n).toBe(5);
    expect(out.arr[0]).toBe("[stripped 30000 chars]");
    expect(out.arr[1]).toBe("קטן");
    expect(out.nested.shot).toBe("[stripped 30000 chars]");
    expect(out.nested.keep).toBe(true);
  });
});

describe("external-log - הצד הכותב", () => {
  function makeFakeArchive() {
    const rows: any[] = [];
    const db = { externalCall: { create: async ({ data }: { data: any }) => { rows.push(data); return data; } } };
    return { rows, db };
  }

  it("שורה נכתבת עם הקשר משתמש+אבחון ממוזג משתי עטיפות", async () => {
    const { rows, db } = makeFakeArchive();
    installExternalCallSink(db);
    await withCallContext({ userId: "u1" }, () =>
      withCallContext({ diagnosisId: "d1" }, async () => {
        reportExternalCall({
          service: "gemini", context: "interview_extract", ok: true, durationMs: 42,
          inputTokens: 10, outputTokens: 5, payload: { prompt: "p" },
        });
      }));
    // הכתיבה fire-and-forget - ממתינים לתור המיקרו-משימות
    await new Promise((r) => setImmediate(r));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      service: "gemini", context: "interview_extract", userId: "u1", diagnosisId: "d1",
      ok: true, durationMs: 42, inputTokens: 10, outputTokens: 5,
    });
  });

  it("בלי הקשר - שורה נכתבת עם null בשדות השיוך", async () => {
    const { rows, db } = makeFakeArchive();
    installExternalCallSink(db);
    reportExternalCall({ service: "pagespeed", context: "psi", ok: false, durationMs: 7 });
    await new Promise((r) => setImmediate(r));
    expect(rows[0]).toMatchObject({ userId: null, diagnosisId: null, ok: false, inputTokens: null });
  });

  it("כתיבת DB שנכשלת לא זורקת החוצה", async () => {
    installExternalCallSink({ externalCall: { create: async () => { throw new Error("DB נפל"); } } });
    expect(() => reportExternalCall({ service: "places", context: "t", ok: true, durationMs: 1 })).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});

describe("offloadHeavyPayload - הסטת צילומי מסך לבאקט", () => {
  const bigImage = "data:image/jpeg;base64," + "A".repeat(20_000);

  it("תמונת base64 ענקית עולה לבאקט ומוחלפת במצביע storage", async () => {
    const uploads: { path: string; contentType: string; size: number }[] = [];
    const upload = async (path: string, bytes: Uint8Array, contentType: string) => {
      uploads.push({ path, contentType, size: bytes.length });
      return true;
    };
    const out = await offloadHeavyPayload({ body: { audits: { shot: bigImage, keep: "רגיל" } } }, upload) as any;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].contentType).toBe("image/jpeg");
    expect(uploads[0].path).toMatch(/^psi\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.jpeg$/);
    expect(uploads[0].size).toBeGreaterThan(10_000);
    expect(out.body.audits.shot).toBe(`storage://scan-artifacts/${uploads[0].path}`);
    expect(out.body.audits.keep).toBe("רגיל");
  });

  it("העלאה שנכשלת - נופלים לחיתוך, לא לזריקה ולא לשמירת הענק", async () => {
    const out = await offloadHeavyPayload({ shot: bigImage }, async () => false) as any;
    expect(out.shot).toMatch(/^\[stripped \d+ chars\]$/);
  });

  it("מחרוזת ענקית שאינה תמונה נחתכת; תמונה קטנה נשארת כמו שהיא", async () => {
    const upload = async () => { throw new Error("לא אמור לעלות"); };
    const out = await offloadHeavyPayload({
      text: "y".repeat(30_000),
      smallImage: "data:image/png;base64,AAAA",
    }, upload as any) as any;
    expect(out.text).toBe("[stripped 30000 chars]");
    expect(out.smallImage).toBe("data:image/png;base64,AAAA");
  });
});
