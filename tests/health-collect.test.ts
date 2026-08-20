import { describe, it, expect, vi } from "vitest";
import { collectHealth } from "../src/pipeline/health";
import type { MailHealth } from "../src/pipeline/types";

// משימה 3 (תחקיר 21.8): collectHealth מחזיר את סיבות הדחייה ב-failures במקום לבלוע אותן.
// כל תת-הבדיקות מוזרקות - אפס whois, אפס DNS, אפס רשת

const OK_MAIL: MailHealth = { hasMx: true };

describe("collectHealth", () => {
  it("returns an empty result without calling any check when there is no website", async () => {
    const domain = vi.fn();
    const mail = vi.fn();
    const safeBrowsing = vi.fn();
    const result = await collectHealth(undefined, { domain, mail, safeBrowsing });
    expect(result).toEqual({ failures: [] });
    expect(domain).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
    expect(safeBrowsing).not.toHaveBeenCalled();
  });

  it("collects a rejection reason per check without dropping the others", async () => {
    const result = await collectHealth("https://example.co.il", {
      domain: () => Promise.reject(new Error("connect ETIMEDOUT 43")),
      mail: async () => OK_MAIL,
      safeBrowsing: () => Promise.reject(new Error("Web Risk HTTP 403")),
    });
    expect(result.signals).toEqual({ mail: OK_MAIL });
    expect(result.failures).toEqual([
      { check: "domain", reason: "connect ETIMEDOUT 43" },
      { check: "safeBrowsing", reason: "Web Risk HTTP 403" },
    ]);
  });

  it("a rejection that is not an Error is stringified, and a long reason is truncated to 200", async () => {
    const result = await collectHealth("https://example.co.il", {
      domain: async () => undefined,
      mail: () => Promise.reject("נפל בלי אובייקט שגיאה"),
      safeBrowsing: () => Promise.reject(new Error("x".repeat(300))),
    });
    expect(result.failures).toEqual([
      { check: "mail", reason: "נפל בלי אובייקט שגיאה" },
      { check: "safeBrowsing", reason: "x".repeat(200) },
    ]);
  });

  it("checks that fulfilled with no facts stay silent: no signals and no failures", async () => {
    const result = await collectHealth("https://example.co.il", {
      domain: async () => undefined,
      mail: async () => undefined,
      safeBrowsing: async () => undefined,
    });
    // undefined ולא אובייקט ריק - בדיוק כהתנהגות הקודמת של collectHealth
    expect(result.signals).toBeUndefined();
    expect(result.failures).toEqual([]);
  });
});
