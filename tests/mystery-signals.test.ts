import { describe, expect, it } from "vitest";
import { extractSignals } from "../src/pipeline/crawler/signals";

const BASE = "https://example.co.il";

// contactEmail (משימה 10): היעד של הלקוח הסמוי במייל - נגזר מ-mailto, רק כשהכתובת תקינה
describe("extractSignals.contactEmail", () => {
  it("הכתובת הראשונה מקישור mailto, מנורמלת לאותיות קטנות, בלי פרמטרים", () => {
    const html = `<a href="mailto:Info@Example.co.il?subject=hi">מייל</a><a href="mailto:second@example.co.il">2</a>`;
    const s = extractSignals(html, BASE);
    expect(s.hasEmailLink).toBe(true);
    expect(s.contactEmail).toBe("info@example.co.il");
  });

  it("mailto מקודד נפתח; mailto ריק או שבור לא מפיק כתובת אבל hasEmailLink נשאר", () => {
    expect(extractSignals(`<a href="mailto:a%40example.co.il">x</a>`, BASE).contactEmail).toBe("a@example.co.il");
    const empty = extractSignals(`<a href="mailto:?subject=hi">x</a><a href="mailto:not-an-address">y</a>`, BASE);
    expect(empty.hasEmailLink).toBe(true);
    expect(empty.contactEmail).toBeUndefined();
  });

  it("בלי mailto - השדה לא קיים בכלל (לא undefined מפורש שמזהם JSON)", () => {
    const s = extractSignals(`<a href="/contact">קשר</a>`, BASE);
    expect("contactEmail" in s).toBe(false);
  });
});
