import { describe, it, expect } from "vitest";
import { DIMENSIONS, processRules } from "../src/pipeline/score/dimensions";
import { RULE_LABEL_HE, ruleLabelHe } from "../src/pipeline/report/presenter";

// הדוח היה מציג "לא נבדק - אין מידע (no_problem_themes)" - שם המשתנה הגולמי, לא עברית לבעל
// העסק (דיווח מייסד). RULE_LABEL_HE הוא מקור האמת היחיד לתרגום מפתח חוק -> שם עברי קצר,
// ובדיקה זו מוודאת שהמפה לעולם לא מפגרת אחרי dimensions.ts: חוק חדש בלי תווית נכשל כאן, לא בפרודקשן

describe("RULE_LABEL_HE", () => {
  const realKeys = new Set<string>();
  for (const d of DIMENSIONS) for (const r of d.rules) realKeys.add(r.key);
  for (const r of processRules(null)) realKeys.add(r.key);

  it("covers every real dimension rule key (DIMENSIONS + processRules(null))", () => {
    expect(realKeys.size).toBeGreaterThan(0);
    for (const key of realKeys) {
      expect(RULE_LABEL_HE[key], `missing label for "${key}"`).toBeDefined();
    }
  });

  it("every label is non-empty Hebrew text", () => {
    for (const key of realKeys) {
      expect(RULE_LABEL_HE[key].trim().length, key).toBeGreaterThan(0);
    }
  });

  it("has no stale entries beyond the real rule keys (map stays in sync with dimensions.ts)", () => {
    for (const key of Object.keys(RULE_LABEL_HE)) {
      expect(realKeys.has(key), `stale label "${key}" not a real rule key`).toBe(true);
    }
  });

  it("contains no forbidden characters (em dash, bidi control marks, emoji)", () => {
    // מקף ארוך אסור - מקף רגיל בלבד. תווי בקרת כיווניות/רוחב-אפס נסתרים ואמוג'י אסורים גם הם
    // (ראו MEMORY: no-bidi-control-chars, no-ai-writing-tells). הבדיקה בנויה על נקודות קוד
    // מספריות (hex) בכוונה - לא על תו מיוחד גולמי בקובץ הזה, כדי לא להטמיע כאן בטעות בדיוק
    // את התו הנסתר שהבדיקה אמורה לתפוס
    const range = (start: number, end: number): number[] => {
      const out: number[] = [];
      for (let cp = start; cp <= end; cp++) out.push(cp);
      return out;
    };
    const FORBIDDEN_CODEPOINTS = new Set<number>([
      0x2014, // em dash
      ...range(0x200b, 0x200f), // zero-width / bidi marks (LRM/RLM ובני משפחתם)
      ...range(0x202a, 0x202e), // bidi embedding/override
      ...range(0x2066, 0x2069), // bidi isolates
      ...range(0x1f300, 0x1faff), // emoji
      ...range(0x2600, 0x27bf), // misc symbols/dingbats (גם אמוג'י נפוצים)
    ]);
    for (const [key, label] of Object.entries(RULE_LABEL_HE)) {
      for (const ch of label) {
        const cp = ch.codePointAt(0)!;
        expect(FORBIDDEN_CODEPOINTS.has(cp), `${key}: forbidden U+${cp.toString(16)} in "${label}"`).toBe(false);
      }
    }
  });
});

// חוק ששינה שם (dmarc -> mail_auth, 20.8) נשאר במפתחות של דוחות שכבר נשמרו ב-scan.scores,
// והמפה בכוונה לא מחזיקה מפתחות היסטוריים - הבדיקה למעלה נועלת אותה. לכן מי שמרנדר חייב
// לקבל null ולא את המפתח הגולמי, אחרת מודפס "dmarc" באנגלית בתוך משפט בעברית
describe("ruleLabelHe", () => {
  it("מחזיר את התווית העברית לחוק קיים", () => {
    expect(ruleLabelHe("mail_auth")).toBe(RULE_LABEL_HE.mail_auth);
  });

  it("מחזיר null למפתח של גרסת ניקוד ישנה, ולא את המפתח עצמו", () => {
    expect(ruleLabelHe("dmarc")).toBeNull();
    expect(ruleLabelHe("spf")).toBeNull();
  });

  it("מחזיר null למפתח שלא קיים בכלל", () => {
    expect(ruleLabelHe("no_such_rule_key")).toBeNull();
  });
});
