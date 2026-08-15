import { describe, expect, it } from "vitest";
import { socialSearchQueryOf } from "../src/app/social-search-query";

describe("socialSearchQueryOf", () => {
  it("שם חנייה (vanity slug) הופך למילים מופרדות ברווח", () => {
    expect(socialSearchQueryOf("https://facebook.com/CafeGreg")).toBe("CafeGreg");
    expect(socialSearchQueryOf("https://instagram.com/some.business")).toBe("some business");
    expect(socialSearchQueryOf("https://facebook.com/cafe-greg")).toBe("cafe greg");
    expect(socialSearchQueryOf("https://facebook.com/cafe_greg")).toBe("cafe greg");
  });

  it("profile.php עם מזהה מספרי - אין שם קריא", () => {
    expect(socialSearchQueryOf("https://www.facebook.com/profile.php?id=100063527290202")).toBeNull();
  });

  it("דומיין חשוף בלי נתיב - אין שם קריא", () => {
    expect(socialSearchQueryOf("https://facebook.com")).toBeNull();
    expect(socialSearchQueryOf("https://www.facebook.com/")).toBeNull();
  });

  it("קישור וואטסאפ (מספר טלפון גרידא) - אין שם קריא", () => {
    expect(socialSearchQueryOf("https://wa.me/972500000000")).toBeNull();
  });

  it("עמוד pages ישן עם מזהה מספרי - אין שם קריא", () => {
    expect(socialSearchQueryOf("https://www.facebook.com/pages/101234567890")).toBeNull();
  });

  it("קיצור פוסט בודד (p/) - אין שם עסק", () => {
    expect(socialSearchQueryOf("https://www.instagram.com/p/CxYz123abc")).toBeNull();
  });

  it("כתובת לא-חברתית - null (הקורא נופל חזרה לחיפוש לפי דומיין)", () => {
    expect(socialSearchQueryOf("https://gentleman.co.il")).toBeNull();
    expect(socialSearchQueryOf("https://www.gentleman.co.il/store")).toBeNull();
  });
});
