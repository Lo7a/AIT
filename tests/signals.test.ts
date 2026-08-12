import { describe, it, expect } from "vitest";
import { extractSignals } from "../src/pipeline/crawler/signals";

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
  <form action="/submit"><input name="name"/></form>
  <link href="/wp-content/themes/x/style.css" rel="stylesheet"/>
</body></html>`;

describe("extractSignals", () => {
  it("detects contact channels, pixels, platform and internal links", () => {
    const s = extractSignals(RICH_HTML, "https://example.co.il");
    expect(s.hasWhatsappLink).toBe(true);
    expect(s.hasPhoneLink).toBe(true);
    expect(s.hasEmailLink).toBe(true);
    expect(s.hasContactForm).toBe(true);
    expect(s.hasFacebookPixel).toBe(true);
    expect(s.hasGoogleAnalytics).toBe(true);
    expect(s.hasOnlineBooking).toBe(false);
    expect(s.hasChatWidget).toBe(false);
    expect(s.platform).toBe("wordpress");
    expect(s.internalLinks).toContain("https://example.co.il/contact");
    expect(s.internalLinks).toContain("https://example.co.il/about");
    expect(s.internalLinks.some((u) => u.includes("other-site.com"))).toBe(false);
    expect(s.internalLinks.some((u) => u.includes("#"))).toBe(false);
  });

  it("detects booking and chat widgets and the wix platform", () => {
    const html = `<html><body>
      <script src="https://static.wixstatic.com/x.js"></script>
      <script src="https://embed.tawk.to/abc/default"></script>
      <a href="https://www.vcita.com/book/somebiz">קבע תור</a>
    </body></html>`;
    const s = extractSignals(html, "https://example.co.il");
    expect(s.hasOnlineBooking).toBe(true);
    expect(s.hasChatWidget).toBe(true);
    expect(s.platform).toBe("wix");
  });

  it("returns all-false for an empty page", () => {
    const s = extractSignals("<html><body>שלום</body></html>", "https://example.co.il");
    expect(s.hasWhatsappLink).toBe(false);
    expect(s.hasContactForm).toBe(false);
    expect(s.platform).toBeUndefined();
    expect(s.internalLinks).toEqual([]);
  });

  it("ignores malformed hrefs without throwing", () => {
    const s = extractSignals('<a href="http://">x</a><a href="/ok">ok</a>', "https://example.co.il");
    expect(s.internalLinks).toContain("https://example.co.il/ok");
  });
});
