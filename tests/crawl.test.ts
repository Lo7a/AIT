import { describe, it, expect, vi } from "vitest";
import { crawlWebsite } from "../src/pipeline/crawler/crawl";

const HOME = `<html><body>
  <a href="/contact">צור קשר</a>
  <a href="/gallery">גלריה</a>
  <form action="/lead"><input name="name"/><textarea name="msg"></textarea></form>
</body></html>`;
const CONTACT = `<html><body><a href="https://wa.me/972501234567">וואטסאפ</a></body></html>`;
const GALLERY = `<html><body>תמונות</body></html>`;

function htmlResponse(html: string) {
  return { ok: true, status: 200, text: async () => html } as unknown as Response;
}

describe("crawlWebsite", () => {
  it("crawls home + prioritized pages and merges signals with OR", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(CONTACT);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.pagesCrawled).toBe(3);
    expect(signals.hasContactForm).toBe(true);   // מעמוד הבית
    expect(signals.hasWhatsappLink).toBe(true);  // מעמוד צור קשר
    // עמוד "צור קשר" מקבל עדיפות על "גלריה" בתור
    expect(signals.crawledUrls[1]).toContain("/contact");
    expect(signals.crawledUrls).toHaveLength(3);
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
    await expect(
      crawlWebsite("https://down.example", { fetchImpl }),
    ).rejects.toThrow();
  });

  it("throws a clear error on a non-OK homepage", async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: false, status: 503, text: async () => "maintenance" } as unknown as Response));
    await expect(
      crawlWebsite("https://example.co.il", { fetchImpl }),
    ).rejects.toThrow(/503/);
  });
});
