import { describe, expect, it } from "vitest";
import { healthFacts } from "../src/pipeline/report/health-facts";
import type { HealthSignals } from "../src/pipeline/types";

// אין כאן שום קריאת רשת ושום LLM: הפונקציה טהורה, ובדיוק בגלל זה אפשר לבדוק עליה
// את הכלל החשוב ביותר במוצר - ששדה חסר מוצג "לא נבדק" ולעולם לא כפער

const NOW = new Date("2026-08-19T00:00:00.000Z");

describe("healthFacts", () => {
  it("מחזיר רשימה ריקה כשאין בכלל בדיקות תקינות", () => {
    expect(healthFacts(undefined, NOW)).toEqual([]);
  });

  it("מציג את ארבע השורות גם כשרק אחת מהן נבדקה", () => {
    const facts = healthFacts({ safeBrowsing: { flagged: false } }, NOW);
    expect(facts.map((f) => f.key)).toEqual(["domain", "mail", "schema", "safeBrowsing"]);
  });

  it("שדה שלא נבדק מקבל לא נבדק וטון unknown, לא ממצא שלילי", () => {
    const facts = healthFacts({ safeBrowsing: { flagged: false } }, NOW);
    const domain = facts.find((f) => f.key === "domain");
    expect(domain?.value).toBe("לא נבדק");
    expect(domain?.tone).toBe("unknown");
    // הנקודה כולה: אין כאן טענה שאין דומיין, ואין הסבר שמרמז על בעיה
    expect(domain?.why).toBeNull();
  });

  it("תוקף דומיין רחוק הוא ממצא תקין עם התאריך ומספר הימים", () => {
    const health: HealthSignals = {
      domain: { registrar: "Domain The Net Technologies Ltd", expiresAt: "2027-11-01T00:00:00.000Z", daysToExpiry: 438 },
    };
    const domain = healthFacts(health, NOW).find((f) => f.key === "domain");
    expect(domain?.tone).toBe("good");
    expect(domain?.value).toContain("2027");
    expect(domain?.why).toMatch(/^נשארו \d+ ימים\.$/);
    expect(domain?.note).toContain("Domain The Net Technologies Ltd");
  });

  it("הספירה לאחור מחושבת מול היום ולא מול רגע הסריקה", () => {
    // daysToExpiry נשמר בסריקה שרצה מזמן ואומר "עוד שנה ורבע", אבל תאריך הפקיעה
    // כבר בעוד עשרה ימים. הדוח חי, ולכן התאריך הוא הקובע
    const stale: HealthSignals = { domain: { daysToExpiry: 438, expiresAt: "2026-08-29T00:00:00.000Z" } };
    const domain = healthFacts(stale, NOW).find((f) => f.key === "domain");
    expect(domain?.tone).toBe("bad");
    expect(domain?.why).toContain("10");
  });

  it("דומיין שפג בקרוב עולה לאזהרה, וקרוב מאוד לתקלה", () => {
    const soon = healthFacts({ domain: { daysToExpiry: 60, expiresAt: "2026-10-18T00:00:00.000Z" } }, NOW);
    expect(soon.find((f) => f.key === "domain")?.tone).toBe("warn");

    const urgent = healthFacts({ domain: { daysToExpiry: 9, expiresAt: "2026-08-28T00:00:00.000Z" } }, NOW);
    expect(urgent.find((f) => f.key === "domain")?.tone).toBe("bad");
  });

  it("דומיין שכבר פג נאמר במפורש", () => {
    const facts = healthFacts({ domain: { daysToExpiry: -3, expiresAt: "2026-08-16T00:00:00.000Z" } }, NOW);
    const domain = facts.find((f) => f.key === "domain");
    expect(domain?.tone).toBe("bad");
    expect(domain?.value).toContain("פג");
  });

  it("דואר מוגן ב-SPF וב-DMARC הוא ממצא תקין ששם הספק מופיע בו", () => {
    const mail = healthFacts(
      { mail: { hasMx: true, provider: "Microsoft 365", hasSpf: true, hasDmarc: true } }, NOW,
    ).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("good");
    expect(mail?.note).toContain("Microsoft 365");
  });

  it("דואר בלי DMARC מוסבר כסיכון התחזות ולא כציון", () => {
    const mail = healthFacts({ mail: { hasMx: true, hasSpf: true, hasDmarc: false } }, NOW)
      .find((f) => f.key === "mail");
    expect(mail?.tone).toBe("warn");
    expect(mail?.why).toContain("מתחזות");
  });

  it("יש דואר אבל ההגנה לא נבדקה - לא טוב ולא רע", () => {
    // בדיוק המצב ש-mailAuthGap מחזיר בו undefined: אומרים את מה שידוע (יש דואר)
    // ולא מסיקים מזה שההגנה עומדת
    const mail = healthFacts({ mail: { hasMx: true } }, NOW).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("unknown");
    expect(mail?.value).toBe("מוגדר");
    expect(mail?.why).toBeNull();
  });

  it("שתי רשומות SPF הן הגנה מבוטלת, לא הגנה כפולה", () => {
    // המקרה שאלעד מצא ב-jems.co.il: hasSpf נשאר true כי הרשומות קיימות, אבל התקן
    // מבטל את הבדיקה. בלי הדגל הזה הפאנל היה כותב "מוגדר ומוגן" - שקר מול בעל העסק
    const mail = healthFacts(
      { mail: { hasMx: true, hasSpf: true, hasDmarc: true, spfConflict: true } }, NOW,
    ).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("bad");
    expect(mail?.value).not.toContain("מוגן");
    expect(mail?.why).toContain("SPF");
  });

  it("ריבוי רשומות DMARC מטופל באותה חומרה", () => {
    const mail = healthFacts(
      { mail: { hasMx: true, hasSpf: true, hasDmarc: true, dmarcConflict: true } }, NOW,
    ).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("bad");
    expect(mail?.why).toContain("DMARC");
  });

  it("שני קונפליקטים יחד מדווחים יחד ולא רק אחד מהם", () => {
    const mail = healthFacts(
      { mail: { hasMx: true, hasSpf: true, hasDmarc: true, spfConflict: true, dmarcConflict: true } }, NOW,
    ).find((f) => f.key === "mail");
    expect(mail?.why).toContain("SPF");
    expect(mail?.why).toContain("DMARC");
  });

  it("בלי קונפליקט DMARC תקין נשאר ממצא תקין", () => {
    const mail = healthFacts(
      { mail: { hasMx: true, hasSpf: true, hasDmarc: true, spfConflict: false, dmarcConflict: false } }, NOW,
    ).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("good");
  });

  it("אין רשומת דואר בכלל - ממצא, לא לא-נבדק", () => {
    const mail = healthFacts({ mail: { hasMx: false } }, NOW).find((f) => f.key === "mail");
    expect(mail?.tone).toBe("warn");
    expect(mail?.value).not.toBe("לא נבדק");
  });

  it("סימון עסק מקומי קיים וחסר", () => {
    const has = healthFacts({ schema: { hasLocalBusiness: true } }, NOW).find((f) => f.key === "schema");
    expect(has?.tone).toBe("good");
    const missing = healthFacts({ schema: { hasLocalBusiness: false } }, NOW).find((f) => f.key === "schema");
    expect(missing?.tone).toBe("warn");
  });

  it("אתר מסומן ברשימת האתרים המסוכנים הוא הממצא החמור ביותר", () => {
    const flagged = healthFacts({ safeBrowsing: { flagged: true } }, NOW).find((f) => f.key === "safeBrowsing");
    expect(flagged?.tone).toBe("bad");
  });

  it("שום טקסט לא מכיל תווים אסורים", () => {
    const health: HealthSignals = {
      domain: { registrar: "Wix.com Ltd.", expiresAt: "2027-04-18T00:00:00.000Z", daysToExpiry: 241, createdAt: "2022-04-18T00:00:00.000Z" },
      mail: { hasMx: true, provider: "Google Workspace", hasSpf: false, hasDmarc: false },
      schema: { hasLocalBusiness: false },
      safeBrowsing: { flagged: false },
    };
    const text = healthFacts(health, NOW)
      .flatMap((f) => [f.label, f.value, f.why ?? "", f.note ?? ""])
      .join(" ");
    // אותה רשימת קודים שבודקת את תוויות החוקים (tests/presenter.test.ts) - מקף ארוך,
    // שלוש נקודות כתו יחיד, תווי כיווניות ואמוג'י
    const range = (a: number, b: number) => {
      const out: number[] = [];
      for (let cp = a; cp <= b; cp++) out.push(cp);
      return out;
    };
    const FORBIDDEN = new Set<number>([
      0x2013, 0x2014, 0x2026,
      ...range(0x200b, 0x200f),
      ...range(0x202a, 0x202e),
      ...range(0x2066, 0x2069),
      ...range(0x1f300, 0x1faff),
      ...range(0x2600, 0x27bf),
    ]);
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      expect(FORBIDDEN.has(cp), `forbidden U+${cp.toString(16)} in health facts`).toBe(false);
    }
  });
});
