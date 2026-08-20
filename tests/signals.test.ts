import { describe, it, expect } from "vitest";
import { extractSignals, collectShortenerLinks } from "../src/pipeline/crawler/signals";

const BASE = "https://example.co.il";

const RICH_HTML = `
<html><head>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script>gtag('config','G-XYZ');</script>
</head><body>
  <a href="https://wa.me/972539860164">ווטסאפ</a>
  <a href="tel:04-1234567">התקשרו</a>
  <a href="mailto:info@example.co.il">מייל</a>
  <a href="/contact">צור קשר</a>
  <a href="/about">אודות</a>
  <a href="https://other-site.com/page">חיצוני</a>
  <a href="#top">למעלה</a>
  <form action="/submit"><input name="name"/><textarea name="message"></textarea></form>
  <link href="/wp-content/themes/x/style.css" rel="stylesheet"/>
</body></html>`;

describe("extractSignals", () => {
  it("detects contact channels, pixels, platform and internal links", () => {
    const s = extractSignals(RICH_HTML, BASE);
    expect(s.hasWhatsappLink).toBe(true);
    expect(s.hasPhoneLink).toBe(true);
    expect(s.hasEmailLink).toBe(true);
    expect(s.hasContactForm).toBe(true);
    expect(s.hasFacebookPixel).toBe(true);
    expect(s.hasGoogleAnalytics).toBe(true);
    expect(s.hasOnlineBooking).toBe(false);
    expect(s.hasChatWidget).toBe(false);
    expect(s.platform).toBe("wordpress");
    expect(s.internalLinks).toContain(`${BASE}/contact`);
    expect(s.internalLinks).toContain(`${BASE}/about`);
    expect(s.internalLinks.some((u) => u.includes("other-site.com"))).toBe(false);
    expect(s.internalLinks.some((u) => u.includes("#"))).toBe(false);
  });

  it("does not treat a WordPress search form as a contact form", () => {
    const html = `<form role="search" action="/"><input type="search" name="s"/></form>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(false);
  });

  it("accepts a two-field lead form without a textarea as a contact form", () => {
    const html = `<form action="/lead"><input name="name"/><input name="phone"/></form>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(true);
  });

  it("does not report the Facebook SDK (like box) as a pixel", () => {
    const html = `<script src="https://connect.facebook.net/he_IL/sdk.js"></script>`;
    expect(extractSignals(html, BASE).hasFacebookPixel).toBe(false);
  });

  it("detects Messenger customer chat as a chat widget", () => {
    const html = `<script src="https://connect.facebook.net/he_IL/sdk/xfbml.customerchat.js"></script>`;
    expect(extractSignals(html, BASE).hasChatWidget).toBe(true);
  });

  it("detects web.whatsapp.com links too", () => {
    const html = `<a href="https://web.whatsapp.com/send?phone=972501234567">שלח הודעה</a>`;
    expect(extractSignals(html, BASE).hasWhatsappLink).toBe(true);
  });

  it("detects booking and chat widgets and the wix platform", () => {
    const html = `<html><body>
      <script src="https://static.wixstatic.com/x.js"></script>
      <script src="https://embed.tawk.to/abc/default"></script>
      <a href="https://www.vcita.com/book/somebiz">קבע תור</a>
    </body></html>`;
    const s = extractSignals(html, BASE);
    expect(s.hasOnlineBooking).toBe(true);
    expect(s.hasChatWidget).toBe(true);
    expect(s.platform).toBe("wix");
  });

  // המקרה החי (פיצה סבא אדוארד): מערכת הזמנות ישראלית + טופס Elementor בלי תגית form.
  // מאז 20.8 שלושת הערוצים מופרדים: הזמנה ישירה, הזמנת מקומות, ומשלוח דרך פלטפורמה
  it("separates direct ordering, table booking and third-party delivery", () => {
    const ordering = extractSignals(`<a href="https://order.bitetech.co.il/#/617/home">להזמנות</a>`, BASE);
    expect(ordering.hasOrderingSystem).toBe(true);
    expect(ordering.hasDeliveryPlatform).toBe(false);

    const generic = extractSignals(`<a href="https://order.some-pizza.co.il/menu">תפריט</a>`, BASE);
    expect(generic.hasOrderingSystem).toBe(true);

    // תפריט והזמנות של Mealy - אומת חי ב-caramelcafe.co.il
    expect(extractSignals(`<a href="https://app.mealy.co.il/x">תפריט</a>`, BASE).hasOrderingSystem).toBe(true);

    // הזמנת מקומות היא כן קביעת תור
    expect(extractSignals(`<a href="https://www.tabit.cloud/somebiz">הזמינו שולחן</a>`, BASE).hasOnlineBooking).toBe(true);
  });

  // וולט אינה ערוץ ישיר של העסק אלא תלות בצד שלישי - ולכן לא מזכה בקביעת תור
  it("does not count a delivery platform as online booking", () => {
    const s = extractSignals(`<a href="https://wolt.com/he/isr/beer-sheva/restaurant/x">וולט</a>`, BASE);
    expect(s.hasDeliveryPlatform).toBe(true);
    expect(s.hasOnlineBooking).toBe(false);
    expect(s.hasOrderingSystem).toBe(false);
  });

  it("detects Israeli appointment vendors that the catalog already prices", () => {
    for (const href of [
      "https://calmark.co.il/page/1050",
      "https://www.clickynder.com/biz/abc",
      "https://plannie.co.il/x",
      "https://mytor.co.il/x",
      "https://yoman.co.il/x",
      "https://nello.co.il/x",
      "https://fizikal.co.il/x",
    ]) {
      // טקסט עוגן ניטרלי בכוונה - כדי שהבדיקה תוכיח את זיהוי הספק ולא את זיהוי הטקסט
      expect(extractSignals(`<a href="${href}">לחצו כאן</a>`, BASE).hasOnlineBooking).toBe(true);
    }
  });

  // מערכת תורים עצמית, בלי ספק מזוהה
  it("detects a self-built booking link by anchor text plus a real destination", () => {
    expect(extractSignals(`<a href="/appointments">לקביעת תור</a>`, BASE).hasOnlineBooking).toBe(true);
    expect(extractSignals(`<a href="/x">להזמנת תור</a>`, BASE).hasOnlineBooking).toBe(true);
    expect(extractSignals(`<a href="/x">Book now</a>`, BASE).hasOnlineBooking).toBe(true);
  });

  it("detects a self-built booking form by date plus time fields", () => {
    const html = `<form><input type="date" name="d"><input type="time" name="t"><input type="tel" name="p"></form>`;
    expect(extractSignals(html, BASE).hasOnlineBooking).toBe(true);
  });

  // המלכודת שהתבנית נבנתה סביבה: "לקביעת תור התקשרו" הוא קביעת תור בטלפון, ההפך הגמור
  it('"לקביעת תור התקשרו" is phone booking, never online booking', () => {
    expect(extractSignals(`<a href="tel:031234567">לקביעת תור התקשרו</a>`, BASE).hasOnlineBooking).toBe(false);
    expect(extractSignals(`<p>לקביעת תור התקשרו 03-1234567</p>`, BASE).hasOnlineBooking).toBe(false);
    expect(extractSignals(`<a href="#">לקביעת תור</a>`, BASE).hasOnlineBooking).toBe(false);
    expect(extractSignals(`<button>לקביעת תור</button>`, BASE).hasOnlineBooking).toBe(false);
  });

  // מקצר כתובות מסתיר את היעד - המקרה החי habarber.co.il
  it("flags a link shortener so a WhatsApp negative can be downgraded", () => {
    const s = extractSignals(`<a href="https://bit.ly/3abcDEF">וואטסאפ</a>`, BASE);
    expect(s.hasLinkShortener).toBe(true);
    expect(s.hasWhatsappLink).toBe(false);
    expect(extractSignals(`<a href="/x">רגיל</a>`, BASE).hasLinkShortener).toBe(false);
  });

  // did.li - מקצר ישראלי, המקרה החי jems.co.il: did.li/tabitjems מפנה ל-tabitorder.com
  it("flags did.li, the Israeli shortener behind the Jems booking link", () => {
    const s = extractSignals(`<a href="https://did.li/tabitjems">להזמנת מקום</a>`, BASE);
    expect(s.hasLinkShortener).toBe(true);
    expect(collectShortenerLinks(`<a href="https://did.li/tabitjems">x</a>`, BASE))
      .toEqual(["https://did.li/tabitjems"]);
  });

  // t.co לא מעוגן היה תופס כל מארח שנגמר באותן אותיות, ומכבה חוק של 25 נקודות בהתאמת שווא
  it("does not mistake a host that merely ends in t.co for the Twitter shortener", () => {
    expect(extractSignals(`<a href="https://smartsupport.co/help">עזרה</a>`, BASE).hasLinkShortener).toBe(false);
    expect(extractSignals(`<a href="https://t.co/abc123">קישור</a>`, BASE).hasLinkShortener).toBe(true);
  });

  it("plain English prose with the word order is not online booking", () => {
    const html = `<p>In order to visit us, call ahead.</p>`;
    expect(extractSignals(html, BASE).hasOnlineBooking).toBe(false);
  });

  it("detects a formless (JS-submitted) contact form: textarea plus email/tel input outside any form tag", () => {
    const html = `<div class="elementor-widget">
      <input type="text" name="fullname"/>
      <input type="tel" name="phone"/>
      <textarea name="message"></textarea>
      <button>שליחה</button>
    </div>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(true);
  });

  it("a lone loose textarea without contact inputs is not a contact form", () => {
    expect(extractSignals(`<textarea name="notes"></textarea>`, BASE).hasContactForm).toBe(false);
  });

  it("a blog comment form is not a contact form", () => {
    const html = `<form id="commentform" action="/wp-comments-post.php">
      <input name="author"/><input type="email" name="email"/><textarea name="comment"></textarea>
    </form>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(false);
  });

  it("detects a hand-rolled chat widget by structural class/function names (סבא אדוארד live case)", () => {
    const html = `<!-- CHAT -->
      <div class="chat-fab" onclick="toggleChat()"><i class="fa-solid fa-comments"></i><div class="chat-pulse"></div></div>
      <div class="chat-window" id="chatWindow"></div>`;
    expect(extractSignals(html, BASE).hasChatWidget).toBe(true);
  });

  it("free-text mentions of chat are not a chat widget", () => {
    expect(extractSignals(`<p>Talk to us via chat or WhatsApp anytime.</p>`, BASE).hasChatWidget).toBe(false);
    expect(extractSignals(`<a href="https://chat.openai.com">ChatGPT</a>`, BASE).hasChatWidget).toBe(false);
    expect(extractSignals(`<p>דברו איתנו בצ'אט</p>`, BASE).hasChatWidget).toBe(false);
  });

  it("detects shopify, and wordpress wins when multiple platform markers exist", () => {
    expect(extractSignals(`<script src="https://cdn.shopify.com/x.js"></script>`, BASE).platform).toBe("shopify");
    const mixed = `<link href="/wp-content/a.css"/><script src="https://static.wixstatic.com/x.js"></script>`;
    expect(extractSignals(mixed, BASE).platform).toBe("wordpress");
  });

  it("excludes self-links, assets, javascript: and duplicates; keeps protocol-relative same-origin", () => {
    const html = `
      <a href="/">בית</a>
      <a href="/contact">1</a>
      <a href="/contact">2</a>
      <a href="/gallery/pic.jpg">תמונה</a>
      <a href="/files/mehiron.pdf">מחירון</a>
      <a href="javascript:void(0)">כפתור</a>
      <a href="//example.co.il/x">פרוטוקול יחסי</a>`;
    const s = extractSignals(html, BASE);
    expect(s.internalLinks).toEqual([`${BASE}/contact`, `${BASE}/x`]);
  });

  it("returns all-false for an empty page", () => {
    const s = extractSignals("<html><body>שלום</body></html>", BASE);
    expect(s).toEqual({
      hasContactForm: false,
      hasWhatsappLink: false,
      hasPhoneLink: false,
      hasEmailLink: false,
      hasOnlineBooking: false,
      hasChatWidget: false,
      hasFacebookPixel: false,
      hasGoogleAnalytics: false,
      hasAccessibilityStatement: false,
      hasAccessibilityWidget: false,
      hasOrderingSystem: false,
      hasDeliveryPlatform: false,
      hasLinkShortener: false,
      platform: undefined,
      clientFramework: undefined,
      internalLinks: [],
    });
  });

  it("ignores malformed hrefs without throwing", () => {
    const s = extractSignals('<a href="http://">x</a><a href="/ok">ok</a>', BASE);
    expect(s.internalLinks).toEqual([`${BASE}/ok`]);
  });

  it("does not fire booking on prose or names, only on real booking vendors", () => {
    expect(extractSignals(`<p>התקשרו לקביעת תור: call to schedule an appointment</p>`, BASE).hasOnlineBooking).toBe(false);
    expect(extractSignals(`<title>Amelia Beauty Salon</title>`, BASE).hasOnlineBooking).toBe(false);
    expect(extractSignals(`<link href="/wp-content/plugins/ameliabooking/css/amelia-booking.css"/>`, BASE).hasOnlineBooking).toBe(true);
    expect(extractSignals(`<script src="/plugins/bookly-responsive-appointment-booking-tool/x.js"></script>`, BASE).hasOnlineBooking).toBe(true);
  });

  it("does not reject a contact form whose path merely contains 'research'", () => {
    const html = `<form action="/research/contact"><input name="name"/><textarea name="msg"></textarea></form>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(true);
  });

  it("counts a select as a real field (service dropdown + phone)", () => {
    const html = `<form action="/lead"><select name="service"><option>א</option></select><input name="phone"/></form>`;
    expect(extractSignals(html, BASE).hasContactForm).toBe(true);
  });
});

// הצהרת נגישות (תקנות נגישות השירות) ורכיב נגישות מותקן - פיצ'ר עמידה בדין הישראלי (משימת המייסד)
describe("accessibility statement + widget detection", () => {
  it("detects a statement link by the short Hebrew nav label (נגישות בלבד)", () => {
    const html = `<nav><a href="/x">נגישות</a></nav>`;
    expect(extractSignals(html, BASE).hasAccessibilityStatement).toBe(true);
  });

  it("detects a statement link by the full Hebrew phrase", () => {
    const html = `<footer><a href="/page">הצהרת נגישות</a></footer>`;
    expect(extractSignals(html, BASE).hasAccessibilityStatement).toBe(true);
  });

  it("detects a statement link by English href pattern", () => {
    expect(extractSignals(`<a href="/accessibility-statement">Accessibility</a>`, BASE).hasAccessibilityStatement).toBe(true);
    expect(extractSignals(`<a href="/negishut">site</a>`, BASE).hasAccessibilityStatement).toBe(true);
  });

  it("detects a statement link by percent-encoded Hebrew href", () => {
    const encoded = encodeURIComponent("הצהרת-נגישות");
    const html = `<a href="/info/${encoded}">מידע</a>`;
    expect(extractSignals(html, BASE).hasAccessibilityStatement).toBe(true);
  });

  it("tolerates a malformed percent-encoding in the href without throwing", () => {
    const html = `<a href="/page%E2%28%">קישור</a>`;
    expect(() => extractSignals(html, BASE)).not.toThrow();
    expect(extractSignals(html, BASE).hasAccessibilityStatement).toBe(false);
  });

  it("a plain paragraph mentioning נגישות (not an anchor) is not detected", () => {
    const html = `<p>אנחנו מחויבים לנגישות מלאה באתר שלנו</p>`;
    expect(extractSignals(html, BASE).hasAccessibilityStatement).toBe(false);
  });

  it.each([
    ["userway", `<script src="https://cdn.userway.org/widget.js"></script>`],
    ["equalweb", `<script src="https://cdn.equalweb.com/core/4.2.0/accessibility.js"></script>`],
    ["accessibe/acsbapp", `<script src="https://acsbapp.com/apps/app/dist/js/app.js"></script>`],
    ["nagich", `<script src="https://www.nagich.co.il/widget.js"></script>`],
    ["enable.co.il", `<script src="https://www.enable.co.il/widget.js"></script>`],
    ["accessible-poetry", `<link rel="stylesheet" href="/wp-content/plugins/accessible-poetry/style.css"/>`],
    ["accessiway", `<script src="https://widget.accessiway.com/scan.js"></script>`],
    ["negishim", `<script src="https://negishim.co.il/widget.js"></script>`],
  ])("detects the %s accessibility widget fingerprint", (_label, html) => {
    expect(extractSignals(html, BASE).hasAccessibilityWidget).toBe(true);
  });

  it('"enable" as a plain English word is not an accessibility widget (word-boundary care)', () => {
    const html = `<p>This feature will enable better performance for our users.</p>`;
    expect(extractSignals(html, BASE).hasAccessibilityWidget).toBe(false);
  });

  it("plain page text mentioning a provider name in prose is still detected (fingerprint, not word-filtered)", () => {
    // userway/equalweb וכו' הם שמות ספק ולא מילים אנגליות נפוצות - אין סיכון להתנגשות במילה חופשית
    expect(extractSignals(`<div class="userway-widget"></div>`, BASE).hasAccessibilityWidget).toBe(true);
  });

  // הספק שאומת חי הוא zap.dbusiness.co. בלי עיגון התבנית תפסה גם dbusiness.com,
  // שאינו אותו ספק - ואזכור אחד מזכה אתר בחוק נגישות שלא מגיע לו (סקירה 20.8)
  it("detects the verified dbusiness.co widget host", () => {
    const html = `<script src="https://zap.dbusiness.co/accessibility.js"></script>`;
    expect(extractSignals(html, BASE).hasAccessibilityWidget).toBe(true);
  });

  it("does not treat a different dbusiness TLD as the accessibility widget", () => {
    expect(extractSignals(`<a href="https://dbusiness.com/news">x</a>`, BASE).hasAccessibilityWidget).toBe(false);
    expect(extractSignals(`<a href="https://dbusiness.couk/x">x</a>`, BASE).hasAccessibilityWidget).toBe(false);
  });
});

// זיהוי תשתית קליינט (Vue/React/Angular) - המקרה החי: edrieng.co.il, אתר Vue שה-HTML הגולמי שלו
// לא מכיל אף <form>/<input> כי הטופס האמיתי מרונדר בדפדפן. בלי הזיהוי הזה הדוח טוען בביטחון
// "אין טופס יצירת קשר" - הגזמה, פשוט לא ראינו
describe("clientFramework detection", () => {
  it("detects Vue via the data-v- scoped-style attribute", () => {
    const html = `<div data-v-7a7a37b1 class="app"></div>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("vue");
  });

  it("detects Vue/Nuxt via the __NUXT__ marker", () => {
    const html = `<script>window.__NUXT__={}</script>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("vue");
  });

  it("detects Vue/Nuxt via the /_nuxt/ build path", () => {
    const html = `<script src="/_nuxt/entry.abc123.js"></script>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("vue");
  });

  it("detects React/Next via __NEXT_DATA__", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{}</script>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("react");
  });

  it("detects React/Next via /_next/static/ (App Router shape)", () => {
    const html = `<script src="/_next/static/chunks/webpack-abc.js"></script>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("react");
  });

  it("detects React via the data-reactroot marker", () => {
    const html = `<div id="root" data-reactroot=""></div>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("react");
  });

  it("detects Angular via ng-version", () => {
    const html = `<app-root ng-version="17.0.0"></app-root>`;
    expect(extractSignals(html, BASE).clientFramework).toBe("angular");
  });

  it("plain server-rendered HTML has no clientFramework", () => {
    const html = `<html><body><h1>ברוכים הבאים</h1><p>טלפון: 03-1234567</p></body></html>`;
    expect(extractSignals(html, BASE).clientFramework).toBeUndefined();
  });

  it("a WordPress site with no JS-framework markers has no clientFramework", () => {
    expect(extractSignals(RICH_HTML, BASE).clientFramework).toBeUndefined();
  });
});
