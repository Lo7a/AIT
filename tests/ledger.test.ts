import { describe, expect, it } from "vitest";
import { buildLedger, missingCount } from "../src/pipeline/model/ledger";
import { deriveBusinessModel, type BusinessModel } from "../src/pipeline/model/business-model";
import type { QuantityAnswers } from "../src/server/interview-repo";
import type { ScanFindings } from "../src/pipeline/types";

const baseFindings: ScanFindings = {
  business: { placeId: "p1", name: "עסק כלשהו" },
  partial: [],
  meta: { startedAt: "t", durationMs: 1, placesCalls: 1, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

// עסק שגוגל סיווגה: primaryType מספיק כדי שהענף ייקבע בלי ראיון בכלל
const barberFindings: ScanFindings = {
  ...baseFindings,
  business: { ...baseFindings.business, primaryType: "barber_shop" },
};

const NO_ANSWERS: QuantityAnswers = { volume: null, responseTime: null, dealValue: null };

const entry = (findings: ScanFindings, model: BusinessModel | null, answers: QuantityAnswers, key: string) =>
  buildLedger(findings, model, answers).find((e) => e.key === key);

describe("buildLedger", () => {
  it("אבחון ריק: כל הרשומות חסרות, ואף אחת לא מסומנת ידועה בטעות", () => {
    const led = buildLedger(baseFindings, null, NO_ANSWERS);
    expect(led.length).toBeGreaterThan(0);
    expect(led.every((e) => !e.known)).toBe(true);
    expect(missingCount(led)).toBe(led.length);
  });

  it("לכל רשומה יש גם מה חסר וגם מה זה פותח - שורה בלי unlocks היא מטלה בלי סיבה", () => {
    for (const e of buildLedger(baseFindings, null, NO_ANSWERS)) {
      expect(e.label.length, `${e.key} בלי label`).toBeGreaterThan(0);
      expect(e.unlocks.length, `${e.key} בלי unlocks`).toBeGreaterThan(0);
    }
  });

  it("מפתחות ייחודיים - רשומה כפולה הייתה מוצגת פעמיים ונספרת פעמיים", () => {
    const keys = buildLedger(baseFindings, null, NO_ANSWERS).map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("אין מספרים בטקסט המוצג - הניסוח לא נוקב בנקודות ציון (כלל אפס מספרים מומצאים)", () => {
    // points הוא משקל בתוך הממד, והממד משוקלל בציון הכולל; "40 נקודות בציון" היה מספר שגוי
    for (const e of buildLedger(baseFindings, null, NO_ANSWERS)) {
      expect(e.unlocks, `${e.key}: ${e.unlocks}`).not.toMatch(/\p{N}/u);
    }
  });
});

describe("buildLedger - שורת ההפסד", () => {
  it("שתי התשובות נדרשות: אחת לבדה לא סוגרת את השנייה", () => {
    const answers: QuantityAnswers = { volume: "10-30", responseTime: null, dealValue: null };
    expect(entry(baseFindings, null, answers, "loss_volume")?.known).toBe(true);
    expect(entry(baseFindings, null, answers, "loss_response_time")?.known).toBe(false);
  });

  it("תשובת 'אחר' על כמות פניות אינה נחשבת ידועה - זו הרגרסיה שהפנקס קיים בשבילה", () => {
    // התשובה נשמרת במסד ככל תשובה, אבל personalLossLine לא מפרש אותה ומחזיר null. פנקס
    // שהיה בודק "יש ערך בשדה" היה מבטיח לבעל העסק שורת הפסד שלעולם לא תופיע
    const answers: QuantityAnswers = { volume: "בערך הרבה", responseTime: "כשאני מספיק", dealValue: "תלוי" };
    expect(entry(baseFindings, null, answers, "loss_volume")?.known).toBe(false);
    expect(entry(baseFindings, null, answers, "loss_response_time")?.known).toBe(false);
    expect(entry(baseFindings, null, answers, "loss_deal_value")?.known).toBe(false);
  });

  it("תשובות מהתפריט כלשונן נסגרות, כולל שווי הלקוח", () => {
    const answers: QuantityAnswers = {
      volume: "30-100", responseTime: "באותו יום", dealValue: "1,000-5,000 שקל",
    };
    expect(entry(baseFindings, null, answers, "loss_volume")?.known).toBe(true);
    expect(entry(baseFindings, null, answers, "loss_response_time")?.known).toBe(true);
    expect(entry(baseFindings, null, answers, "loss_deal_value")?.known).toBe(true);
  });

  it("רווחים מסביב לתשובה לא שוברים את ההתאמה", () => {
    const answers: QuantityAnswers = { volume: "  10-30  ", responseTime: null, dealValue: null };
    expect(entry(baseFindings, null, answers, "loss_volume")?.known).toBe(true);
  });
});

describe("buildLedger - רשומות הציון", () => {
  it("סקציה בלי קרדיט = הציון לא מודד אותה, וזה מופיע כחוסר", () => {
    const model = deriveBusinessModel(baseFindings);
    model.credits.lead_flow = 0;
    expect(entry(baseFindings, model, NO_ANSWERS, "score_lead_handling")?.known).toBe(false);
  });

  it("קרדיט מלא בסקציה סוגר את רשומת הציון שלה, ולא את של האחרות", () => {
    const model = deriveBusinessModel(baseFindings);
    model.credits.lead_flow = 1;
    model.credits.manual_tasks = 0;
    expect(entry(baseFindings, model, NO_ANSWERS, "score_lead_handling")?.known).toBe(true);
    expect(entry(baseFindings, model, NO_ANSWERS, "score_manual_tasks")?.known).toBe(false);
  });

  it("קרדיט 0.5 מהסריקה בלבד עדיין חסר - רק אישור בראיון סוגר", () => {
    const model = deriveBusinessModel(baseFindings);
    model.credits.tools = 0.5;
    expect(entry(baseFindings, model, NO_ANSWERS, "score_internal_tools")?.known).toBe(false);
  });
});

describe("buildLedger - הענף", () => {
  it("ענף שגוגל זיהתה נסגר בלי ראיון בכלל", () => {
    expect(entry(barberFindings, null, NO_ANSWERS, "industry")?.known).toBe(true);
  });

  it("ענף שלא זוהה נשאר חוסר - לא זוהה נשאר לא זוהה", () => {
    expect(entry(baseFindings, null, NO_ANSWERS, "industry")?.known).toBe(false);
  });
});

describe("missingCount", () => {
  it("סופר רק את מה שחסר, ויורד ככל שנענה", () => {
    const before = buildLedger(baseFindings, null, NO_ANSWERS);
    const after = buildLedger(barberFindings, null, { volume: "10-30", responseTime: "באותו יום", dealValue: null });
    expect(missingCount(after)).toBe(missingCount(before) - 3);
  });

  it("אבחון מלא מחזיר אפס", () => {
    const model = deriveBusinessModel(barberFindings);
    for (const k of Object.keys(model.credits)) model.credits[k as keyof typeof model.credits] = 1;
    const led = buildLedger(barberFindings, model, {
      volume: "10-30", responseTime: "באותו יום", dealValue: "עד 300 שקל",
    });
    expect(missingCount(led)).toBe(0);
  });
});
