import { describe, expect, it } from "vitest";
import { socialPresenceOf, socialOnlyDetail, SOCIAL_PLATFORM_LABEL_HE } from "../src/pipeline/social-hosts";

describe("socialPresenceOf", () => {
  it.each([
    ["https://www.facebook.com/mybusiness", "facebook"],
    ["https://m.facebook.com/mybusiness", "facebook"],
    ["https://business.facebook.com/mybusiness", "facebook"],
    ["https://www.instagram.com/mybusiness", "instagram"],
    ["https://www.tiktok.com/@mybusiness", "tiktok"],
    ["https://wa.me/972500000000", "whatsapp"],
    ["https://api.whatsapp.com/send?phone=972500000000", "whatsapp"],
    ["https://linktr.ee/mybusiness", "linktree"],
    ["https://www.linkedin.com/company/mybusiness", "linkedin"],
    ["https://x.com/mybusiness", "x"],
    ["https://twitter.com/mybusiness", "x"],
    ["https://www.youtube.com/@mybusiness", "youtube"],
  ])("מזהה %s כפלטפורמה %s", (url, platform) => {
    expect(socialPresenceOf(url)).toEqual({ platform });
  });

  it.each([
    "https://lavangroup.co.il",
    "https://x.co.il",
    "https://facebookish.com", // לא תת-דומיין אמיתי של facebook.com - לא נופל בטעות ב-endsWith
    "https://notyoutube.com",
  ])("לא מזהה אתר עצמאי כנוכחות חברתית: %s", (url) => {
    expect(socialPresenceOf(url)).toBeNull();
  });

  it("לא זורק על כתובת פסולה - פשוט לא נוכחות חברתית מוכרת", () => {
    expect(socialPresenceOf("mailto:a@b.co.il")).toBeNull();
  });

  it("מתעלם מ-www ומרישיות ה-host", () => {
    expect(socialPresenceOf("https://WWW.FACEBOOK.com/mybusiness")).toEqual({ platform: "facebook" });
  });
});

describe("socialOnlyDetail", () => {
  it("בונה טקסט הערת איסוף עברי לפי הפלטפורמה", () => {
    expect(socialOnlyDetail("facebook")).toBe("הנוכחות הדיגיטלית היא עמוד פייסבוק - אין אתר עצמאי לסריקה");
  });

  it("נופל בחזרה למפתח הגולמי אם אין תווית עברית (הגנה עתידית)", () => {
    expect(socialOnlyDetail("unknown_platform")).toContain("unknown_platform");
  });

  it("יש תווית עברית לכל פלטפורמה נתמכת", () => {
    for (const platform of Object.keys(SOCIAL_PLATFORM_LABEL_HE)) {
      expect(SOCIAL_PLATFORM_LABEL_HE[platform]).toBeTruthy();
    }
  });
});
