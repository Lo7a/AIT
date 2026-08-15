import { describe, it, expect, vi } from "vitest";
import { scanWebsiteOnly, normalizeSiteUrl } from "../src/pipeline/scan-website";
import type { WebsiteSignals, PageSpeedResult } from "../src/pipeline/types";

const SIGNALS: WebsiteSignals = {
  pagesCrawled: 3, crawledUrls: ["https://x.co.il/"],
  hasContactForm: true, hasWhatsappLink: false, hasPhoneLink: true, hasEmailLink: false,
  hasOnlineBooking: false, hasChatWidget: false, hasFacebookPixel: false, hasGoogleAnalytics: true,
  jsRendered: false,
};
const PSI: PageSpeedResult = { performanceScore: 40, seoScore: 100, lcpMs: 8000 };

describe("scanWebsiteOnly", () => {
  it("builds findings from crawl+PSI with a no_gbp flag and zero Places cost", async () => {
    const findings = await scanWebsiteOnly("https://www.lavangroup.co.il/", {
      crawl: async () => SIGNALS,
      pagespeed: async () => PSI,
    });
    expect(findings.business.placeId).toBe("");
    expect(findings.business.name).toBe("lavangroup.co.il");
    expect(findings.business.website).toBe("https://www.lavangroup.co.il/");
    expect(findings.partial).toEqual(["no_gbp"]); // בלי דגלים נוספים — רק ה-no_gbp הבסיסי
    expect(findings.partialDetails).toBeUndefined();
    expect(findings.websiteSignals).toEqual(SIGNALS);
    expect(findings.pageSpeed).toEqual(PSI);
    expect(findings.reviewInsights).toBeUndefined();
    expect(findings.meta.placesCalls).toBe(0);
    expect(findings.meta.estCostUsd).toBe(0);
  });

  it("normalizes a URL without protocol and keeps js_rendered flag", async () => {
    const findings = await scanWebsiteOnly("lavangroup.co.il", {
      crawl: async () => ({ ...SIGNALS, jsRendered: true }),
      pagespeed: async () => PSI,
    });
    expect(findings.business.website).toBe("https://lavangroup.co.il/");
    expect(findings.partial).toContain("js_rendered");
  });

  it("passes the normalized href — not the raw input — to crawl and pagespeed", async () => {
    // רגרסיה שהופכת deps.crawl(url.href) ל-deps.crawl(siteUrl) הייתה משאירה את שאר המבחנים ירוקים
    const crawl = vi.fn(async () => SIGNALS);
    const pagespeed = vi.fn(async () => PSI);
    await scanWebsiteOnly("lavangroup.co.il", { crawl, pagespeed });
    expect(crawl).toHaveBeenCalledWith("https://lavangroup.co.il/");
    expect(pagespeed).toHaveBeenCalledWith("https://lavangroup.co.il/");
  });

  it("turns a crawl failure into a crawl_failed flag instead of throwing", async () => {
    const findings = await scanWebsiteOnly("https://x.co.il", {
      crawl: async () => { throw new Error("ECONNREFUSED"); },
      pagespeed: async () => PSI,
    });
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partialDetails?.crawl_failed).toContain("ECONNREFUSED");
    expect(findings.pageSpeed).toEqual(PSI);
  });

  it("records both crawl_failed and pagespeed_failed when both sub-steps reject, without throwing", async () => {
    const findings = await scanWebsiteOnly("https://x.co.il", {
      crawl: async () => { throw new Error("crawl down"); },
      pagespeed: async () => { throw new Error("psi down"); },
    });
    expect(findings.partial).toEqual(["no_gbp", "crawl_failed", "pagespeed_failed"]);
    expect(findings.websiteSignals).toBeUndefined();
    expect(findings.pageSpeed).toBeUndefined();
    expect(findings.partialDetails?.crawl_failed).toContain("crawl down");
    expect(findings.partialDetails?.pagespeed_failed).toContain("psi down");
  });
});

// אבן דרך 4, משימה 0.7: payload גולמי לשימוש עתידי (scan.raw) - במסלול הזה לעולם אין placeDetails
describe("scanWebsiteOnly - raw payload", () => {
  it("collects pageSpeed raw and crawledUrls without leaking raw into findings.pageSpeed", async () => {
    const pageSpeedRaw = { categories: { performance: { score: 0.4 } }, metrics: { lcp: 8000 } };
    const findings = await scanWebsiteOnly("https://www.lavangroup.co.il/", {
      crawl: async () => SIGNALS,
      pagespeed: async () => ({ ...PSI, raw: pageSpeedRaw }),
    });
    expect(findings.raw).toEqual({ pageSpeed: pageSpeedRaw, crawledUrls: SIGNALS.crawledUrls });
    expect(findings.pageSpeed).toEqual(PSI);
    expect((findings.pageSpeed as { raw?: unknown }).raw).toBeUndefined();
  });

  it("social-only route: no crawl/PSI run at all, so raw is absent (nothing to save)", async () => {
    const crawl = vi.fn();
    const pagespeed = vi.fn();
    const findings = await scanWebsiteOnly("https://www.facebook.com/business-social", { crawl, pagespeed });
    expect(crawl).not.toHaveBeenCalled();
    expect(pagespeed).not.toHaveBeenCalled();
    expect(findings.raw).toBeUndefined();
  });
});

describe("normalizeSiteUrl", () => {
  it("trims leading/trailing whitespace before normalizing", () => {
    expect(normalizeSiteUrl(" https://x.co.il").href).toBe("https://x.co.il/");
  });

  it("rejects non-http(s) schemes with a clear error", () => {
    expect(() => normalizeSiteUrl("ftp://x.co.il")).toThrow(/http/);
    expect(() => normalizeSiteUrl("mailto:a@b.co")).toThrow(/http/);
  });
});
