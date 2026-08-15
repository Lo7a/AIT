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

  it("דומיין חברתי כולל את מקטע ה-path הראשון במפתח - שני עסקים שונים = מפתחות שונים (אבן דרך 4)", () => {
    const keyOne = websiteKeyOf("https://www.facebook.com/business-one");
    const keyTwo = websiteKeyOf("https://www.facebook.com/business-two");
    expect(keyOne).toBe("facebook.com/business-one");
    expect(keyTwo).toBe("facebook.com/business-two");
    expect(keyOne).not.toBe(keyTwo);
  });

  it("דומיין חברתי מנרמל רישיות ו-www באותו אופן כמו דומיין רגיל", () => {
    expect(websiteKeyOf("https://FACEBOOK.com/MyBusiness")).toBe("facebook.com/mybusiness");
    expect(websiteKeyOf("https://www.facebook.com/MyBusiness")).toBe("facebook.com/mybusiness");
  });

  it("תת-דומיין חברתי (m.facebook.com) מזוהה כחברתי וכולל path, אבל נשאר מפתח נפרד - כמו כל תת-דומיין (עקבי עם המדיניות הקיימת)", () => {
    expect(websiteKeyOf("https://m.facebook.com/mybusiness")).toBe("m.facebook.com/mybusiness");
    expect(websiteKeyOf("https://m.facebook.com/mybusiness"))
      .not.toBe(websiteKeyOf("https://www.facebook.com/mybusiness"));
  });

  it("דומיין חברתי חשוף בלי path נשאר כמו היום - חשוף לדומיין בלבד", () => {
    expect(websiteKeyOf("https://www.facebook.com")).toBe("facebook.com");
    expect(websiteKeyOf("https://www.facebook.com/")).toBe("facebook.com");
  });
});
