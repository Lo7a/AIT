import { describe, expect, it } from "vitest";
import { websiteKeyOf } from "../src/server/website-key";
import { normalizeSiteUrl } from "../src/pipeline/site-url";

describe("normalizeSiteUrl", () => {
  it("מסיר פרטי הזדהות (userinfo) - לא יגיעו ל-fetch", () => {
    const href = normalizeSiteUrl("https://someone@x.co.il").href;
    expect(href).not.toContain("@");
    expect(href).toBe("https://x.co.il/");
  });
});

describe("websiteKeyOf", () => {
  it("מנרמל סכמה, www, רישיות וסלאש סופי לאותו מפתח", () => {
    for (const input of [
      "https://www.lavangroup.co.il/",
      "http://LavanGroup.co.il",
      "lavangroup.co.il",
      "https://lavangroup.co.il/about",
    ]) {
      expect(websiteKeyOf(input)).toBe("lavangroup.co.il");
    }
  });

  it("path נזרק בכוונה — עסק = דומיין ב-MVP", () => {
    expect(websiteKeyOf("https://x.co.il/deep/page?q=1")).toBe("x.co.il");
  });

  it("תת-דומיין שונה = מפתח שונה", () => {
    expect(websiteKeyOf("https://shop.x.co.il")).toBe("shop.x.co.il");
  });

  it("סכמה לא נתמכת נדחית (מהנרמול המשותף)", () => {
    expect(() => websiteKeyOf("mailto:a@b.co.il")).toThrow();
  });
});
