import { describe, expect, it } from "vitest";
import { extractAnswer, sanitizeUpdates } from "../src/pipeline/interview/extract";
import type { ScanFindings } from "../src/pipeline/types";
import { deriveBusinessModel } from "../src/pipeline/model/business-model";

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק" },
  partial: ["no_website"],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};
const model = deriveBusinessModel(findings);

describe("sanitizeUpdates", () => {
  it("שומר רק סקציות חוקיות ושדות פרימיטיביים", () => {
    const raw = {
      updates: [
        { section: "lead_flow", fields: { handler: "דנה", responseTime: "עד שעה" } },
        { section: "לא-קיימת", fields: { a: 1 } },
        { section: "billing", fields: { nested: { evil: true }, tool: "חשבונית ירוקה" } },
      ],
    };
    const clean = sanitizeUpdates(raw);
    expect(clean).toHaveLength(2);
    expect(clean[0]).toEqual({ section: "lead_flow", fields: { handler: "דנה", responseTime: "עד שעה" } });
    expect(clean[1]).toEqual({ section: "billing", fields: { tool: "חשבונית ירוקה" } });
  });

  it("גוזם מחרוזות ארוכות ל-300 תווים ומגביל ל-4 עדכונים", () => {
    const raw = {
      updates: [
        { section: "profile", fields: { note: "א".repeat(500) } },
        { section: "channels", fields: { a: "1" } },
        { section: "service", fields: { a: "1" } },
        { section: "billing", fields: { a: "1" } },
        { section: "retention", fields: { a: "1" } },
      ],
    };
    const clean = sanitizeUpdates(raw);
    expect(clean).toHaveLength(4);
    expect((clean[0].fields.note as string).length).toBe(300);
  });

  it("קלט זבל - מערך ריק, לא זריקה", () => {
    expect(sanitizeUpdates(null)).toEqual([]);
    expect(sanitizeUpdates({ updates: "לא מערך" })).toEqual([]);
    expect(sanitizeUpdates({ updates: [{ section: "profile" }] })).toEqual([]);
  });
});

describe("extractAnswer", () => {
  it("מסלול מוצלח: עדכונים מסונטזים + תשובת אישור", async () => {
    const complete = async () => ({
      data: {
        updates: [{ section: "lead_flow", fields: { handler: "דנה", responseTime: "עד שעה" } }],
        reply: "מעולה, דנה מטפלת ותוך שעה זה זמן תגובה טוב.",
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const r = await extractAnswer(
      { findings, model, question: { key: "lead_flow_intake", section: "lead_flow", text: "מי מטפל?" }, answer: "דנה עונה תוך שעה" },
      { complete },
    );
    expect(r.usedFallback).toBe(false);
    expect(r.updates).toEqual([{ section: "lead_flow", fields: { handler: "דנה", responseTime: "עד שעה" } }]);
    expect(r.reply).toContain("דנה");
  });

  it("LLM נכשל בשאלה מונחית - fallback: התשובה הגולמית נשמרת לסקציית השאלה", async () => {
    const complete = async () => { throw new Error("down"); };
    const r = await extractAnswer(
      { findings, model, question: { key: "billing_flow", section: "billing", text: "איך גובים?" }, answer: "מזומן בלבד" },
      { complete },
    );
    expect(r.usedFallback).toBe(true);
    expect(r.updates).toEqual([{ section: "billing", fields: { ownerNotes: "מזומן בלבד" } }]);
    expect(r.reply.length).toBeGreaterThan(0);
  });

  it("LLM נכשל בכתיבה חופשית - fallback בלי עדכונים (אין סקציה ידועה)", async () => {
    const complete = async () => { throw new Error("down"); };
    const r = await extractAnswer({ findings, model, question: null, answer: "יש לי מאפייה" }, { complete });
    expect(r.usedFallback).toBe(true);
    expect(r.updates).toEqual([]);
  });

  it("תשובת ה-LLM עוברת sanitization - סקציה לא חוקית לא מחלחלת", async () => {
    const complete = async () => ({
      data: { updates: [{ section: "hack", fields: { a: "1" } }], reply: "אוקיי" },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const r = await extractAnswer({ findings, model, question: null, answer: "טקסט" }, { complete });
    expect(r.updates).toEqual([]);
    expect(r.usedFallback).toBe(false);
  });

  it("הפרומפט עוטף את תשובת המשתמש בתוחמי הזרקה ואוסר המצאה", async () => {
    let seenPrompt = "";
    const complete = async (p: string) => {
      seenPrompt = p;
      return { data: { updates: [], reply: "טוב" }, usage: { inputTokens: 1, outputTokens: 1 } };
    };
    await extractAnswer({ findings, model, question: null, answer: "התשובה שלי" }, { complete });
    expect(seenPrompt).toContain("<<<");
    expect(seenPrompt).toContain("התשובה שלי");
    expect(seenPrompt).toContain("אל תמציא");
  });
});
