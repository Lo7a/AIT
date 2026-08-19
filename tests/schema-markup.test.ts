import { describe, it, expect } from "vitest";
import { readSchemaMarkup } from "../src/pipeline/health/schema-markup";

/** עוטף בלוק JSON-LD בעמוד מינימלי, כמו שהוא מגיע מהסורק */
function page(body: string): string {
  return `<html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

function jsonLd(payload: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

describe("readSchemaMarkup", () => {
  it("מזהה LocalBusiness פשוט", () => {
    const html = page(
      jsonLd({ "@context": "https://schema.org", "@type": "LocalBusiness", name: "מספרה" }),
    );
    const res = readSchemaMarkup(html);
    expect(res).toEqual({ hasLocalBusiness: true, types: ["LocalBusiness"] });
  });

  // הרגרסיה המרכזית: רשימה ידנית של כמה שמות הייתה מכריזה "אין סימון" על עסק תקין
  it("מזהה תת-סוג ספציפי (HairSalon) כעסק מקומי", () => {
    const res = readSchemaMarkup(page(jsonLd({ "@type": "HairSalon", name: "סטודיו" })));
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["HairSalon"]);
  });

  it("מזהה CafeOrCoffeeShop כעסק מקומי", () => {
    const res = readSchemaMarkup(page(jsonLd({ "@type": "CafeOrCoffeeShop" })));
    expect(res?.hasLocalBusiness).toBe(true);
  });

  it.each(["Dentist", "Restaurant", "AutoRepair", "BeautySalon", "Bakery", "Plumber"])(
    "מזהה את תת-הסוג %s כעסק מקומי",
    (type) => {
      expect(readSchemaMarkup(page(jsonLd({ "@type": type })))?.hasLocalBusiness).toBe(true);
    },
  );

  it("קורא עטיפת graph@ (התבנית של Yoast ודומיו)", () => {
    const html = page(
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", url: "https://example.co.il" },
          { "@type": "Dentist", name: "מרפאה" },
        ],
      }),
    );
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["WebSite", "Dentist"]);
  });

  it("קורא מערך ברמה העליונה", () => {
    const html = page(
      jsonLd([{ "@type": "WebPage" }, { "@type": "Bakery", name: "מאפייה" }]),
    );
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["WebPage", "Bakery"]);
  });

  it("קורא type@ שהוא מערך של כמה סוגים", () => {
    const html = page(jsonLd({ "@type": ["Organization", "Restaurant", "Place"] }));
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["Organization", "Restaurant", "Place"]);
  });

  it("קורא סוג שנכתב ככתובת מלאה", () => {
    const html = page(jsonLd({ "@type": "https://schema.org/Florist" }));
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["Florist"]);
  });

  it("מזהה microdata דרך itemtype", () => {
    const html = page(
      `<div itemscope itemtype="http://schema.org/AutoRepair"><span itemprop="name">מוסך</span></div>`,
    );
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["AutoRepair"]);
  });

  it("מתעלם מ-itemtype שאינו schema.org", () => {
    const html = page(`<div itemscope itemtype="http://data-vocabulary.org/Organization"></div>`);
    const res = readSchemaMarkup(html);
    expect(res).toEqual({ hasLocalBusiness: false, types: [] });
  });

  it("עמוד עם WebSite ו-WebPage בלבד אינו עסק מקומי, והסוגים מוצגים כראיה", () => {
    const html = page(jsonLd({ "@graph": [{ "@type": "WebSite" }, { "@type": "WebPage" }] }));
    expect(readSchemaMarkup(html)).toEqual({
      hasLocalBusiness: false,
      types: ["WebSite", "WebPage"],
    });
  });

  it("Organization לבדו אינו עסק מקומי", () => {
    const res = readSchemaMarkup(page(jsonLd({ "@type": "Organization", name: "חברה" })));
    expect(res?.hasLocalBusiness).toBe(false);
    expect(res?.types).toEqual(["Organization"]);
  });

  it("בלוק JSON-LD שבור לא מוחק בלוק תקין שלצידו", () => {
    const html = page(
      `<script type="application/ld+json">{ this is not json ,,, }</script>` +
        jsonLd({ "@type": "Restaurant", name: "מסעדה" }),
    );
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["Restaurant"]);
  });

  it("בלוק שבור לבדו מדווח נבדק-ולא-נמצא, לא נופל", () => {
    const html = page(`<script type="application/ld+json">{{{</script>`);
    expect(() => readSchemaMarkup(html)).not.toThrow();
    expect(readSchemaMarkup(html)).toEqual({ hasLocalBusiness: false, types: [] });
  });

  it("מחרוזת ריקה מחזירה undefined - לא נבדק כלום", () => {
    expect(readSchemaMarkup("")).toBeUndefined();
    expect(readSchemaMarkup("   \n  ")).toBeUndefined();
  });

  it("קלט שאינו HTML מחזיר undefined ולא קביעה שלילית", () => {
    expect(readSchemaMarkup("Service Unavailable")).toBeUndefined();
  });

  it("עמוד בלי שום סימון מובנה: נבדק, לא נמצא, רשימה ריקה", () => {
    const html = page(`<h1>ברוכים הבאים</h1><p>אנחנו כאן</p>`);
    expect(readSchemaMarkup(html)).toEqual({ hasLocalBusiness: false, types: [] });
  });

  it("מוצא ישות מקוננת שאינה ברמה העליונה", () => {
    const html = page(
      jsonLd({ "@type": "WebPage", mainEntity: { "@type": "ExerciseGym", name: "חדר כושר" } }),
    );
    const res = readSchemaMarkup(html);
    expect(res?.hasLocalBusiness).toBe(true);
    expect(res?.types).toEqual(["WebPage", "ExerciseGym"]);
  });

  it("מפרק עטיפת CDATA בתבניות ישנות", () => {
    const html = page(
      `<script type="application/ld+json">//<![CDATA[
      {"@type":"Locksmith"}
      //]]></script>`,
    );
    expect(readSchemaMarkup(html)?.hasLocalBusiness).toBe(true);
  });

  it("סוג כפול בשני בלוקים מופיע פעם אחת", () => {
    const html = page(jsonLd({ "@type": "Bakery" }) + jsonLd({ "@type": "bakery" }));
    expect(readSchemaMarkup(html)?.types).toEqual(["Bakery"]);
  });

  it("התאמה חסרת רגישות לאותיות גדולות", () => {
    expect(readSchemaMarkup(page(jsonLd({ "@type": "localbusiness" })))?.hasLocalBusiness).toBe(
      true,
    );
  });

  it("מזהה בלוק שה-type שלו נכתב באותיות שונות בתגית", () => {
    const html = page(
      `<script type="Application/LD+JSON">{"@type":"Pharmacy"}</script>`,
    );
    expect(readSchemaMarkup(html)?.hasLocalBusiness).toBe(true);
  });
});
