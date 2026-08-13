import { describe, it, expect, vi } from "vitest";
import { crawlWebsite } from "../src/pipeline/crawler/crawl";

const HOME = `<html><body>
  <a href="/gallery">גלריה</a>
  <a href="/contact">צור קשר</a>
  <form action="/lead"><input name="name"/><textarea name="msg"></textarea></form>
</body></html>`;
const CONTACT = `<html><body><a href="https://wa.me/972501234567">וואטסאפ</a></body></html>`;
const GALLERY = `<html><body>תמונות</body></html>`;
const NEXT_HTML = `<html><head><script src="/_next/static/chunks/main.js"></script></head>
<body><div id="__next"></div></body></html>`;
const BROCHURE_HTML = `<html><body><h1>ברוכים הבאים</h1><p>טלפון: 03-1234567</p></body></html>`;

function htmlResponse(html: string, url = "") {
  return {
    ok: true, status: 200, url,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => html,
  } as unknown as Response;
}

describe("crawlWebsite", () => {
  it("crawls home + prioritized pages and merges signals with OR", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.pagesCrawled).toBe(3);
    expect(signals.hasContactForm).toBe(true);
    expect(signals.hasWhatsappLink).toBe(true);
    // "צור קשר" מנצח את "גלריה" למרות שהוא מופיע אחריו ב-DOM — העדיפות בפעולה
    expect(signals.crawledUrls[1]).toContain("/contact");
    expect(signals.crawledUrls).toHaveLength(3);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("AIT-Scanner");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("prioritizes percent-encoded Hebrew keyword pages", async () => {
    const home = `<a href="/gallery">גלריה</a><a href="/%D7%A6%D7%95%D7%A8-%D7%A7%D7%A9%D7%A8">קשר</a>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("%D7%A6%D7%95%D7%A8")) return htmlResponse(CONTACT);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(home);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 2 });
    expect(signals.pagesCrawled).toBe(2);
    expect(signals.hasWhatsappLink).toBe(true); // העמוד המקודד בעברית נבחר ראשון
  });

  it("survives a homepage link containing a literal % (malformed URI)", async () => {
    const home = `<a href="/sale-50%-off">מבצע</a><a href="/contact">צור קשר</a>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      if (u.includes("/sale")) return htmlResponse(GALLERY);
      return htmlResponse(home);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.hasWhatsappLink).toBe(true); // הסריקה לא קרסה ו"צור קשר" נסרק
  });

  it("follows the homepage's final URL after a redirect (origin change)", async () => {
    const homeAbs = `<a href="https://www.example.co.il/contact">צור קשר</a>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT, "https://www.example.co.il/contact");
      return htmlResponse(homeAbs, "https://www.example.co.il/");
    });
    const signals = await crawlWebsite("http://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.pagesCrawled).toBe(2);
    expect(signals.hasWhatsappLink).toBe(true);
  });

  it("bounds total fetch attempts even when many pages fail", async () => {
    const links = Array.from({ length: 40 }, (_, i) => `<a href="/p${i}">עמוד</a>`).join("");
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/p")) throw new Error("timeout");
      return htmlResponse(`<html><body>${links}</body></html>`);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 8 });
    expect(signals.pagesCrawled).toBe(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(1 + 8 + 4);
  });

  it("skips non-HTML inner pages (content-type guard)", async () => {
    const home = `<a href="/brochure">מחירון</a><a href="/contact">צור קשר</a>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/brochure")) {
        return {
          ok: true, status: 200, url: "",
          headers: { get: () => "application/pdf" },
          text: async () => "%PDF fbq( gtag(",
        } as unknown as Response;
      }
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      return htmlResponse(home);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 4 });
    expect(signals.hasFacebookPixel).toBe(false); // ה-PDF לא נסרק כ-HTML
    expect(signals.hasWhatsappLink).toBe(true);
    expect(signals.crawledUrls.some((u) => u.includes("brochure"))).toBe(false);
  });

  it("respects maxPages", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 2 });
    expect(signals.pagesCrawled).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("skips inner pages that fail without failing the crawl", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) throw new Error("timeout");
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.pagesCrawled).toBe(2); // בית + גלריה; צור קשר נכשל בשקט
    expect(signals.hasWhatsappLink).toBe(false);
  });

  it("throws when the homepage is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(crawlWebsite("https://down.example", { fetchImpl })).rejects.toThrow();
  });

  it("throws a clear error on a non-OK homepage", async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: false, status: 503, text: async () => "maintenance" } as unknown as Response));
    await expect(crawlWebsite("https://example.co.il", { fetchImpl })).rejects.toThrow(/503/);
  });

  it("accepts uppercase content-type header casing", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      const res = u.includes("/contact") ? htmlResponse(CONTACT) : htmlResponse(HOME);
      (res as unknown as { headers: { get: () => string } }).headers = {
        get: () => "TEXT/HTML; charset=UTF-8",
      };
      return res;
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 2 });
    expect(signals.pagesCrawled).toBe(2);
  });

  it("stops crawling when the time budget is exhausted", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3, budgetMs: -1 });
    expect(signals.pagesCrawled).toBe(1); // רק עמוד הבית — התקציב נגמר
  });

  it("merges platform found only on an inner page", async () => {
    const contactWp = `<link href="/wp-content/x.css"/><a href="https://wa.me/972501234567">וו</a>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(contactWp);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.platform).toBe("wordpress");
  });

  it("flags jsRendered on a link-less page with a JS-app root marker", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(NEXT_HTML));
    const signals = await crawlWebsite("https://spa.co.il", { fetchImpl });
    expect(signals.jsRendered).toBe(true);
    expect(signals.pagesCrawled).toBe(1);
  });

  it("does NOT flag a plain single-page brochure site", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(BROCHURE_HTML));
    const signals = await crawlWebsite("https://simple.co.il", { fetchImpl });
    expect(signals.jsRendered).toBe(false);
  });
});
