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

  it("path נזרק בכוונה - עסק = דומיין ב-MVP", () => {
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

  it("כינויי תת-דומיין חברתיים ידועים (m./business./web.) מתקפלים לדומיין הבסיסי - אותו עמוד, לא עסק אחר (תיקון סקירת קוד m3)", () => {
    const base = websiteKeyOf("https://www.facebook.com/mybusiness");
    expect(websiteKeyOf("https://m.facebook.com/mybusiness")).toBe(base);
    expect(websiteKeyOf("https://business.facebook.com/mybusiness")).toBe(base);
    expect(base).toBe("facebook.com/mybusiness");
  });

  it("דומיין חברתי חשוף בלי path נשאר כמו היום - חשוף לדומיין בלבד", () => {
    expect(websiteKeyOf("https://www.facebook.com")).toBe("facebook.com");
    expect(websiteKeyOf("https://www.facebook.com/")).toBe("facebook.com");
  });
});

// שבעת הצורות מסקירת הקוד (M1): מקטע path ראשון לבדו לא מספיק לזהות עמוד ספציפי - או כי הוא
// קונטיינר גנרי (pages/p/company/in, המזהה במקטע השני) או כי המזהה האמיתי הוא ב-query string
// (profile.php?id=, send?phone=, watch?v=). בכל מקרה: שני עמודים שונים חייבים לקבל מפתחות שונים
describe("websiteKeyOf - זהות עמוד חברתי לפי צורת ה-URL (סקירת קוד M1)", () => {
  it("facebook profile.php?id= - המזהה האמיתי הוא ה-id, לא 'profile.php' לבדו", () => {
    const keyA = websiteKeyOf("https://www.facebook.com/profile.php?id=100063111111111");
    const keyB = websiteKeyOf("https://www.facebook.com/profile.php?id=100063222222222");
    expect(keyA).toBe("facebook.com/profile.php?id=100063111111111");
    expect(keyA).not.toBe(keyB);
  });

  it("facebook /pages/* - קונטיינר, לוקח את שני המקטעים הראשונים", () => {
    const keyA = websiteKeyOf("https://www.facebook.com/pages/business-one/111111");
    const keyB = websiteKeyOf("https://www.facebook.com/pages/business-two/222222");
    expect(keyA).toBe("facebook.com/pages/business-one");
    expect(keyA).not.toBe(keyB);
  });

  it("instagram /p/* - קונטיינר של פוסט, לוקח את שני המקטעים הראשונים", () => {
    const keyA = websiteKeyOf("https://www.instagram.com/p/post-aaa111");
    const keyB = websiteKeyOf("https://www.instagram.com/p/post-bbb222");
    expect(keyA).toBe("instagram.com/p/post-aaa111");
    expect(keyA).not.toBe(keyB);
  });

  it("linkedin /company/* - קונטיינר, לוקח את שני המקטעים הראשונים", () => {
    const keyA = websiteKeyOf("https://www.linkedin.com/company/business-one");
    const keyB = websiteKeyOf("https://www.linkedin.com/company/business-two");
    expect(keyA).toBe("linkedin.com/company/business-one");
    expect(keyA).not.toBe(keyB);
  });

  it("linkedin /in/* - קונטיינר, לוקח את שני המקטעים הראשונים", () => {
    const keyA = websiteKeyOf("https://www.linkedin.com/in/john-doe");
    const keyB = websiteKeyOf("https://www.linkedin.com/in/jane-doe");
    expect(keyA).toBe("linkedin.com/in/john-doe");
    expect(keyA).not.toBe(keyB);
  });

  it("api.whatsapp.com/send?phone= - המזהה האמיתי הוא הטלפון, לא 'send' לבדו", () => {
    const keyA = websiteKeyOf("https://api.whatsapp.com/send?phone=972500000001");
    const keyB = websiteKeyOf("https://api.whatsapp.com/send?phone=972500000002");
    expect(keyA).toBe("api.whatsapp.com/send?phone=972500000001");
    expect(keyA).not.toBe(keyB);
  });

  it("youtube.com/watch?v= - המזהה האמיתי הוא ה-v, לא 'watch' לבדו", () => {
    const keyA = websiteKeyOf("https://www.youtube.com/watch?v=video-aaa");
    const keyB = websiteKeyOf("https://www.youtube.com/watch?v=video-bbb");
    expect(keyA).toBe("youtube.com/watch?v=video-aaa");
    expect(keyA).not.toBe(keyB);
  });

  it("מקטע query בלי הפרמטר הצפוי נופל בחזרה למקטע הראשון לבדו (הגנה, לא זריקה)", () => {
    expect(websiteKeyOf("https://www.facebook.com/profile.php")).toBe("facebook.com/profile.php");
  });

  it("רגרסיה: דומיין לא-חברתי ודומיין חברתי חשוף עדיין מתנהגים כמו קודם", () => {
    expect(websiteKeyOf("https://shop.x.co.il")).toBe("shop.x.co.il"); // תת-דומיין לא-חברתי - נשאר נפרד
    expect(websiteKeyOf("https://www.facebook.com")).toBe("facebook.com"); // חשוף בלי path
  });
});
