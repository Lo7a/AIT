import { describe, expect, it } from "vitest";
import { appendExchange, getInterviewState } from "../src/server/interview-repo";
import { deriveBusinessModel } from "../src/pipeline/model/business-model";
import { makeFakeDb } from "./fakes/fake-db";
import type { ScanFindings } from "../src/pipeline/types";

const findings: ScanFindings = {
  business: { placeId: "p1", name: "עסק" },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

function seedDiagnosis(diagnoses: any[], scans: any[], status = "interviewing") {
  diagnoses.push({ id: "d1", businessId: "b1", status });
  scans.push({ diagnosisId: "d1", findings, scores: null, narrative: null, createdAt: new Date() });
}

describe("appendExchange", () => {
  it("שומר תשובת משתמש + אישור עוזר + מודל מעודכן בטרנזקציה אחת", async () => {
    const { db, diagnoses, scans, models, messages } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, scans);
    const model = deriveBusinessModel(findings);
    await appendExchange(db, "d1", {
      user: { content: "דנה מטפלת", questionKey: "lead_flow_intake", isFreeText: false },
      assistant: { content: "מעולה, רשמתי" },
    }, model);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", questionKey: "lead_flow_intake", isFreeText: false });
    expect(messages[1]).toMatchObject({ role: "assistant", questionKey: null });
    expect(models).toHaveLength(1);
  });

  it("שני חילופין רצופים - התפקידים מתחלפים בקפדנות וה-createdAt של המשתמש קודם לזה של העוזר בכל זוג", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, scans);
    const model = deriveBusinessModel(findings);
    await appendExchange(db, "d1", {
      user: { content: "דנה מטפלת", questionKey: "lead_flow_intake", isFreeText: false },
      assistant: { content: "רשמתי" },
    }, model);
    await appendExchange(db, "d1", {
      user: { content: "תוך שעה", questionKey: "lead_flow_lost", isFreeText: false },
      assistant: { content: "מעולה" },
    }, model);
    const state = await getInterviewState(db, "d1");
    const roles = state?.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
    const msgs = state?.messages ?? [];
    for (let i = 0; i < msgs.length; i += 2) {
      expect(msgs[i].role).toBe("user");
      expect(msgs[i + 1].role).toBe("assistant");
      expect(msgs[i].createdAt.getTime()).toBeLessThan(msgs[i + 1].createdAt.getTime());
    }
  });
});

describe("getInterviewState", () => {
  it("מחזיר סטטוס, הודעות לפי סדר, מודל, וממצאי הסריקה האחרונה", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, scans);
    const model = deriveBusinessModel(findings);
    await appendExchange(db, "d1", {
      user: { content: "א", questionKey: "lead_flow_intake", isFreeText: false },
      assistant: { content: "ב" },
    }, model);
    const state = await getInterviewState(db, "d1");
    expect(state?.status).toBe("interviewing");
    expect(state?.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(state?.askedKeys).toEqual(["lead_flow_intake"]);
    expect(state?.findings.business.name).toBe("עסק");
    expect(state?.model.completenessPct).toBeGreaterThanOrEqual(0);
  });

  it("אבחון לא קיים - null", async () => {
    const { db } = makeFakeDb() as any;
    expect(await getInterviewState(db, "אין")).toBeNull();
  });

  it("אבחון בלי סריקה - null (אין על מה לראיין)", async () => {
    const { db, diagnoses } = makeFakeDb() as any;
    diagnoses.push({ id: "d2", businessId: "b1", status: "created" });
    expect(await getInterviewState(db, "d2")).toBeNull();
  });

  it("אבחון בלי מודל שמור - נגזר טרי מהממצאים", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, scans, "report_ready");
    const state = await getInterviewState(db, "d1");
    expect(state?.model.data.profile.name).toBe("עסק");
  });

  it("askedKeys ייחודיים גם כששאלה נענתה פעמיים", async () => {
    const { db, diagnoses, scans } = makeFakeDb() as any;
    seedDiagnosis(diagnoses, scans);
    const model = deriveBusinessModel(findings);
    const exch = { user: { content: "א", questionKey: "k1", isFreeText: false }, assistant: { content: "ב" } };
    await appendExchange(db, "d1", exch, model);
    await appendExchange(db, "d1", exch, model);
    const state = await getInterviewState(db, "d1");
    expect(state?.askedKeys).toEqual(["k1"]);
    expect(state?.messages).toHaveLength(4);
  });
});
