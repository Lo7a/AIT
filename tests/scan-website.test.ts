import { describe, it, expect } from "vitest";
import { scanWebsiteOnly } from "../src/pipeline/scan-website";
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
    expect(findings.partial).toContain("no_gbp");
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

  it("turns a crawl failure into a crawl_failed flag instead of throwing", async () => {
    const findings = await scanWebsiteOnly("https://x.co.il", {
      crawl: async () => { throw new Error("ECONNREFUSED"); },
      pagespeed: async () => PSI,
    });
    expect(findings.partial).toContain("crawl_failed");
    expect(findings.partialDetails?.crawl_failed).toContain("ECONNREFUSED");
    expect(findings.pageSpeed).toEqual(PSI);
  });
});
