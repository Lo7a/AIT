import { describe, it, expect } from "vitest";
import { extractSignals } from "../src/pipeline/crawler/signals";

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
      platform: undefined,
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
