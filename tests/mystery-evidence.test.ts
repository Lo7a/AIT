import { describe, expect, it } from "vitest";
import {
  probeVerdict, probeFactLine, probeSentence, formatDuration, formatWhen, answerDelayMs, RESPONSE_WINDOW_MS,
} from "../src/pipeline/mystery/evidence";
import type { MysteryProbeResult, ScanFindings } from "../src/pipeline/types";

// כל הבדיקות כאן טהורות: findings בזיכרון בלבד. התאריכים ב-UTC; שעון ישראל בקיץ = UTC+3

function findingsWith(results: MysteryProbeResult[]): ScanFindings {
  return {
    business: { placeId: "p1", name: "מספרת הדוגמה" },
    partial: [],
    meta: { startedAt: "2026-08-30T08:00:00Z", durationMs: 1, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
    mystery: { results },
  };
}

// יום שלישי 1.9.2026, 11:30 בישראל = 08:30 UTC
const SENT = "2026-09-01T08:30:00Z";

describe("probeVerdict", () => {
  it("בלי ראיה - none (לא נבדק, לא פער)", () => {
    expect(probeVerdict(findingsWith([]))).toBe("none");
    expect(probeVerdict({ ...findingsWith([]), mystery: undefined })).toBe("none");
  });

  it("תשובה בתוך החלון בכל הערוצים - answered_fast", () => {
    const f = findingsWith([
      { channel: "email", sentAt: SENT, answeredAt: "2026-09-01T09:12:00Z", closedAt: "2026-09-01T09:12:00Z" },
      { channel: "form", sentAt: SENT, answeredAt: "2026-09-01T08:31:00Z", closedAt: "2026-09-01T08:31:00Z" },
    ]);
    expect(probeVerdict(f)).toBe("answered_fast");
  });

  it("תשובה אחרי החלון - answered_slow, וגבול החלון עצמו עדיין מזכה", () => {
    const edge = new Date(Date.parse(SENT) + RESPONSE_WINDOW_MS).toISOString();
    expect(probeVerdict(findingsWith([{ channel: "email", sentAt: SENT, answeredAt: edge, closedAt: edge }]))).toBe("answered_fast");
    const late = new Date(Date.parse(SENT) + RESPONSE_WINDOW_MS + 60_000).toISOString();
    expect(probeVerdict(findingsWith([{ channel: "email", sentAt: SENT, answeredAt: late, closedAt: late }]))).toBe("answered_slow");
  });

  it("ערוץ אחד שלא נענה מכריע את כל הסבב - הלקוח שפנה שם נשאר בלי תשובה", () => {
    const f = findingsWith([
      { channel: "email", sentAt: SENT, answeredAt: "2026-09-01T08:40:00Z", closedAt: "2026-09-01T08:40:00Z" },
      { channel: "form", sentAt: SENT, closedAt: "2026-09-04T08:30:00Z" },
    ]);
    expect(probeVerdict(f)).toBe("unanswered");
  });
});

describe("formatDuration - עברית מדוברת, עיגול כלפי מטה", () => {
  it.each([
    [30_000, "פחות מדקה"],
    [60_000, "דקה"],
    [42 * 60_000, "42 דקות"],
    [60 * 60_000, "שעה"],
    [2 * 60 * 60_000 + 5 * 60_000, "שעתיים ו-5 דקות"],
    [3 * 60 * 60_000 + 20 * 60_000, "3 שעות ו-20 דקות"],
    [24 * 60 * 60_000, "יום"],
    [48 * 60 * 60_000 + 3 * 60 * 60_000, "יומיים"],
    [72 * 60 * 60_000, "3 ימים"],
  ])("%d ms -> %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("formatWhen - שעון ישראל, יום בשבוע ושעה", () => {
  it("11:30 בישראל בקיץ", () => {
    expect(formatWhen(SENT)).toBe("ביום שלישי בשעה 11:30");
  });
});

describe("probeSentence / probeFactLine", () => {
  it("נענה: יום, שעה ומשך שנמדד - בלי אחוזים", () => {
    const r: MysteryProbeResult = { channel: "email", sentAt: SENT, answeredAt: "2026-09-01T11:50:00Z", closedAt: "2026-09-01T11:50:00Z" };
    expect(answerDelayMs(r)).toBe(200 * 60_000);
    expect(probeSentence(r)).toBe("הלקוח הסמוי פנה במייל ביום שלישי בשעה 11:30 וקיבל תשובה אחרי 3 שעות ו-20 דקות");
  });

  it("לא נענה: כמה זמן חיכינו, לא שיעור", () => {
    const r: MysteryProbeResult = { channel: "form", sentAt: SENT, closedAt: "2026-09-04T08:30:00Z" };
    expect(probeSentence(r)).toBe("הלקוח הסמוי פנה דרך הטופס באתר ביום שלישי בשעה 11:30 ולא קיבל תשובה במשך 3 ימים");
    expect(probeSentence(r)).not.toMatch(/%/);
  });

  it("שורת העובדה מחברת את כל הערוצים; בלי ראיה - null", () => {
    expect(probeFactLine(findingsWith([]))).toBeNull();
    const line = probeFactLine(findingsWith([
      { channel: "email", sentAt: SENT, answeredAt: "2026-09-01T08:45:00Z", closedAt: "2026-09-01T08:45:00Z" },
      { channel: "whatsapp", sentAt: SENT, closedAt: "2026-09-04T08:30:00Z" },
    ]));
    expect(line).toContain("במייל");
    expect(line).toContain("; הלקוח הסמוי פנה בוואטסאפ");
  });

  it("תאריך שבור לא מפיל את הניסוח - משך אפס במקום NaN", () => {
    const r: MysteryProbeResult = { channel: "email", sentAt: SENT, closedAt: "לא תאריך" };
    expect(probeSentence(r)).toContain("במשך פחות מדקה");
  });
});
