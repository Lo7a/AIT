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
// צורת ה-HTML האמיתית של Next.js App Router — בלי __NEXT_DATA__ ובלי id="__next" (אלה Pages Router)
const APP_ROUTER_HTML = `<html><head><script src="/_next/static/chunks/webpack-abc123.js" async></script></head>
<body><div class="min-h-screen bg-gray-50"><div class="animate-pulse"></div></div>
<script>self.__next_f=self.__next_f||[];self.__next_f.push([0])</script></body></html>`;

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

  it("does not count redirect duplicates: three inner paths that all land on the homepage = 1 page", async () => {
    // באג מאומת: הדדופ היה על כתובת התור בלבד, וההוספה ל-crawledUrls הייתה על finalUrl -
    // שלושה נתיבים שמפנים לעמוד הבית נספרו כארבעה עמודים וזיכו בחוק multi_page (דורש 4+)
    const home = `<html><body><a href="/about">אודות</a><a href="/contact">צור קשר</a>
      <a href="/services">שירותים</a></body></html>`;
    const fetchImpl = vi.fn(async () => htmlResponse(home, "https://example.co.il/"));
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 8 });
    expect(signals.pagesCrawled).toBe(1);
    expect(signals.crawledUrls).toEqual(["https://example.co.il/"]);
    expect(new Set(signals.crawledUrls).size).toBe(signals.crawledUrls.length);
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

  it("merges accessibility statement/widget signals with OR across pages", async () => {
    // עמוד בית בלי שום איתות נגישות + עמוד פנימי עם קישור הצהרת נגישות ורכיב userway -
    // רמת האתר חייבת לזכות ב-OR, בדיוק כמו כל שאר ה-BOOL_KEYS
    const contact = `<html><body>
      <a href="/statement">הצהרת נגישות</a>
      <script src="https://cdn.userway.org/widget.js"></script>
    </body></html>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/contact")) return htmlResponse(contact);
      if (u.includes("/gallery")) return htmlResponse(GALLERY);
      return htmlResponse(HOME);
    });
    const signals = await crawlWebsite("https://example.co.il", { fetchImpl, maxPages: 3 });
    expect(signals.hasAccessibilityStatement).toBe(true);
    expect(signals.hasAccessibilityWidget).toBe(true);
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

  it("flags jsRendered on a Next.js App Router skeleton (the real Lavan Group shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(APP_ROUTER_HTML));
    const signals = await crawlWebsite("https://approuter.co.il", { fetchImpl });
    expect(signals.jsRendered).toBe(true);
  });

  it("does NOT flag a JS-marker page that still has internal links", async () => {
    const withLinks = `<html><body><div id="__next"></div><a href="/about">אודות</a><a href="/contact">צור קשר</a></body></html>`;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(withLinks));
    const signals = await crawlWebsite("https://hybrid.co.il", { fetchImpl });
    expect(signals.jsRendered).toBe(false);
  });
});

// באג מאומת (דוח SSRF): בדיקת המארח רצה רק בשכבת ה-API על הכתובת שהוגשה, ו-fetchPage עקב
// אחרי הפניות עם redirect ברירת המחדל - מארח ציבורי שמחזיר 302 ל-127.0.0.1 גרר את הסורק
// לרשת הפנימית וגם לקישורים שנמצאו שם. ההגנה עברה לשכבת ה-fetch: כל כתובת, בכל קפיצה
describe("crawlWebsite - חסימת מארחים פנימיים בשכבת ה-fetch", () => {
  function redirectResponse(status: number, location: string | null, url = "") {
    return {
      ok: false, status, url,
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) },
      text: async () => "",
    } as unknown as Response;
  }
  const calledUrls = (fetchImpl: { mock: { calls: unknown[][] } }) =>
    fetchImpl.mock.calls.map((c) => String(c[0]));

  it("הפניה ממארח ציבורי ל-127.0.0.1 נכשלת סגור - אין בקשה שנייה לרשת הפנימית", async () => {
    const INTERNAL = `<html><body><a href="/admin">admin</a><a href="/keys">keys</a></body></html>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("attacker.example")) return redirectResponse(302, "http://127.0.0.1:6379/");
      return htmlResponse(INTERNAL, u);
    });
    await expect(crawlWebsite("https://attacker.example", { fetchImpl })).rejects.toThrow(/127\.0\.0\.1/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calledUrls(fetchImpl).some((u) => u.includes("127.0.0.1"))).toBe(false);
  });

  it("עמוד פנימי שמפנה ללופבק נופל לבד - הסריקה שורדת ובלי כתובת פנימית ב-crawledUrls", async () => {
    const home = `<html><body><a href="/r">הפניה</a><a href="/contact">צור קשר</a></body></html>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/r")) return redirectResponse(302, "http://127.0.0.1:6379/keys");
      if (u.includes("/contact")) return htmlResponse(CONTACT, u);
      return htmlResponse(home, u);
    });
    const signals = await crawlWebsite("https://example.co.il/", { fetchImpl, maxPages: 5 });
    expect(signals.hasWhatsappLink).toBe(true); // צור קשר כן נסרק
    expect(signals.crawledUrls.some((u) => u.includes("127.0.0.1"))).toBe(false);
    expect(calledUrls(fetchImpl).some((u) => u.includes("127.0.0.1"))).toBe(false);
  });

  it("שרשרת הפניות ציבורית נעקבת (כולל Location יחסי) וה-finalUrl הוא היעד", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u === "https://example.co.il/") return redirectResponse(301, "/step2");
      if (u === "https://example.co.il/step2") return redirectResponse(302, "https://www.example.co.il/final");
      return htmlResponse(GALLERY, ""); // url ריק - ה-finalUrl מגיע ממעקב ההפניות שלנו
    });
    const signals = await crawlWebsite("https://example.co.il/", { fetchImpl, maxPages: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(signals.crawledUrls).toEqual(["https://www.example.co.il/final"]);
  });

  it("שרשרת ארוכה מהחסם נכשלת אחרי 5 קפיצות", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => redirectResponse(302, `https://example.co.il/hop${++n}`));
    await expect(crawlWebsite("https://example.co.il/", { fetchImpl })).rejects.toThrow(/הפניות/);
    expect(fetchImpl).toHaveBeenCalledTimes(6); // בקשה ראשונה + 5 קפיצות מותרות
  });

  it("כתובת פתיחה עם מארח חסום נדחית לפני כל בקשה", async () => {
    const fetchImpl = vi.fn();
    await expect(crawlWebsite("http://169.254.169.254/latest/meta-data/", { fetchImpl }))
      .rejects.toThrow(/169\.254\.169\.254/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Location שאינו http/https (file://) נדחה ולא נחשף בהודעה", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse(302, "file:///etc/passwd"));
    const err = await crawlWebsite("https://example.co.il/", { fetchImpl }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("passwd");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("הפניה בלי כותרת Location נכשלת בהודעה ברורה", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse(302, null));
    await expect(crawlWebsite("https://example.co.il/", { fetchImpl })).rejects.toThrow(/Location/);
  });
});

describe("homepage timeout retry", () => {
  const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

  it("retries the homepage once with a longer timeout after a timeout (Kampai case)", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValue(htmlResponse(CONTACT));
    const signals = await crawlWebsite("https://slow.co.il", { fetchImpl, timeoutMs: 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signals.pagesCrawled).toBe(1);
    expect(signals.hasWhatsappLink).toBe(true); // האותות נאספו למרות שהניסיון הראשון קרס
  });

  it("does not retry a non-timeout homepage failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 500, url: "", headers: { get: () => null }, text: async () => "",
    } as unknown as Response);
    await expect(crawlWebsite("https://down.co.il", { fetchImpl })).rejects.toThrow("HTTP 500");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up when the patient retry also times out", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError());
    await expect(crawlWebsite("https://dead.co.il", { fetchImpl })).rejects.toThrow("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
