import { describe, it, expect, vi } from "vitest";
import { readDomainHealth, type DomainDeps } from "../src/pipeline/health/domain-age";

// כל ה-query כאן מזויף. הבדיקות אופליין בלבד ולעולם לא פותחות סוקט אל שרת whois
const NOW = new Date("2026-08-18T00:00:00.000Z");
const now = () => NOW;

const queryOf = (bodies: Record<string, string>) =>
  vi.fn<DomainDeps["query"]>(async (server) => {
    const body = bodies[server];
    if (body == null) throw new Error(`שרת לא צפוי בבדיקה: ${server}`);
    return body;
  });

// תשובת ISOC-IL אמיתית בצורתה, כולל פרטי אדם - כדי לוודא שהם לא דולפים לתוצאה
const ISOC_BODY = `% The data in the WHOIS database of the .il registry is provided by ISOC-IL
% for information purposes only.

query:        example.co.il

reg-name:     example
domain:       example.co.il

descr:        Example Marketing Ltd
descr:        Ha-Melacha 5
descr:        Tel Aviv
descr:        Israel
phone:        972 3 5555555
e-mail:       hostmaster AT example.co.il
admin-c:      LI-AB1234-IL
tech-c:       LI-AB1234-IL
nserver:      ns1.example-dns.co.il
nserver:      ns2.example-dns.co.il
validity:     30-11-2027
DNSSEC:       unsigned
status:       Transfer Locked
changed:      domain-registrar AT isoc.org.il 20231130

person:       Yossi Cohen
address:      Ha-Melacha 5, Tel Aviv, Israel
phone:        972 3 5555555
e-mail:       yossi AT example.co.il

registrar name: Domain The Net Technologies Ltd
registrar info: http://www.domainthenet.net
`;

// רשומת השורש של IANA, ממנה מתגלה השרת המוסמך
const IANA_COM_BODY = `% IANA WHOIS server
% for more information on IANA, visit http://www.iana.org

domain:       COM

organisation: VeriSign Global Registry Services
address:      Reston Virginia 20190
address:      United States

whois:        whois.verisign-grs.com
status:       ACTIVE
remarks:      Registration information: http://www.verisigninc.com

created:      1985-01-01
changed:      2023-12-07
source:       IANA
`;

const VERISIGN_BODY = `Domain Name: EXAMPLE.COM
Registry Domain ID: 2336799_DOMAIN_COM-VRSN
Registrar WHOIS Server: whois.namecheap.com
Registrar URL: http://www.namecheap.com
Updated Date: 2025-02-11T09:20:15Z
Creation Date: 2014-03-11T09:20:15Z
Registry Expiry Date: 2027-03-11T09:20:15Z
Registrar: NameCheap, Inc.
Registrar IANA ID: 1068
Registrar Abuse Contact Email: abuse@namecheap.com
Registrar Abuse Contact Phone: +1.6613102107
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
Name Server: DNS1.REGISTRAR-SERVERS.COM
DNSSEC: unsigned
>>> Last update of whois database: 2026-08-18T00:00:00Z <<<
`;

describe("readDomainHealth - רישום ישראלי", () => {
  it("קורא תוקף, רשם וימים לפקיעה מתשובת ISOC-IL", async () => {
    const query = queryOf({ "whois.isoc.org.il": ISOC_BODY });
    const result = await readDomainHealth("https://www.example.co.il/contact", { query, now });

    expect(result).toEqual({
      registrar: "Domain The Net Technologies Ltd",
      expiresAt: "2027-11-30T00:00:00.000Z",
      daysToExpiry: 469,
    });
    // ישירות אל הרישום הישראלי, בלי קפיצה דרך IANA
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("whois.isoc.org.il", "example.co.il");
  });

  it("לא מחזיר את הגוף הגולמי ולא שום פרט אישי מתוכו", async () => {
    const query = queryOf({ "whois.isoc.org.il": ISOC_BODY });
    const result = await readDomainHealth("example.co.il", { query, now });

    expect(Object.keys(result!).sort()).toEqual(["daysToExpiry", "expiresAt", "registrar"]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Yossi Cohen");
    expect(serialized).not.toContain("yossi AT example.co.il");
    expect(serialized).not.toContain("Ha-Melacha");
    expect(serialized).not.toContain("nserver");
  });

  it("רשומה ותיקה עם validity: N/A - בלי תוקף ובלי ימים, אבל עם הרשם", async () => {
    const legacy = `domain:       old.co.il
descr:        Old Business
validity:     N/A
status:       Transfer Locked
registrar name: Communication Ltd
`;
    const result = await readDomainHealth("old.co.il", { query: queryOf({ "whois.isoc.org.il": legacy }), now });

    expect(result).toEqual({ registrar: "Communication Ltd" });
    expect(result!.expiresAt).toBeUndefined();
    expect(result!.daysToExpiry).toBeUndefined();
  });

  it("תוקף שכבר עבר מחזיר מספר ימים שלילי, בלי לרכך אותו", async () => {
    const expired = `domain:       late.co.il
validity:     01-06-2026
registrar name: Domain The Net Technologies Ltd
`;
    const result = await readDomainHealth("late.co.il", { query: queryOf({ "whois.isoc.org.il": expired }), now });

    expect(result!.expiresAt).toBe("2026-06-01T00:00:00.000Z");
    expect(result!.daysToExpiry).toBe(-78);
  });
});

describe("readDomainHealth - סיומות אחרות דרך IANA", () => {
  it("קפיצת הפניה אחת: IANA מגלה את השרת המוסמך והוא זה שנשאל על הדומיין", async () => {
    const query = queryOf({
      "whois.iana.org": IANA_COM_BODY,
      "whois.verisign-grs.com": VERISIGN_BODY,
    });
    const result = await readDomainHealth("www.example.com", { query, now });

    expect(result).toEqual({
      registrar: "NameCheap, Inc.",
      createdAt: "2014-03-11T09:20:15.000Z",
      expiresAt: "2027-03-11T09:20:15.000Z",
      daysToExpiry: 205,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, "whois.iana.org", "com");
    expect(query).toHaveBeenNthCalledWith(2, "whois.verisign-grs.com", "example.com");
  });

  it("שדה refer מתקבל בדיוק כמו whois", async () => {
    const ianaRefer = `domain:       SHOP

organisation: GMO Registry
refer:        whois.nic.shop
status:       ACTIVE
source:       IANA
`;
    const query = queryOf({
      "whois.iana.org": ianaRefer,
      "whois.nic.shop": "Domain Name: example.shop\nRegistrar: Gandi SAS\nExpiry Date: 2028-01-15T00:00:00Z\n",
    });
    const result = await readDomainHealth("example.shop", { query, now });

    expect(query).toHaveBeenNthCalledWith(2, "whois.nic.shop", "example.shop");
    expect(result!.registrar).toBe("Gandi SAS");
    expect(result!.expiresAt).toBe("2028-01-15T00:00:00.000Z");
  });

  it("רשומת IANA בלי הפניה - לא נבדק, ובלי קפיצה נוספת", async () => {
    const query = queryOf({ "whois.iana.org": "domain: TEST\nstatus: ACTIVE\nsource: IANA\n" });
    const result = await readDomainHealth("example.test", { query, now });

    expect(result).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("ערך refer שאינו שם מארח נדחה במקום להיות מטרה לפנייה", async () => {
    const query = queryOf({ "whois.iana.org": "domain: EVIL\nrefer:  127.0.0.1 -x ; rm\nsource: IANA\n" });

    expect(await readDomainHealth("example.evil", { query, now })).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("readDomainHealth - כשלים ותאריכים לא תקינים", () => {
  it("query שזורק נזרק הלאה עם הסיבה - כך היא מגיעה להערות האיסוף (תחקיר 21.8)", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const query = vi.fn<DomainDeps["query"]>(async () => {
      throw err;
    });
    // קוד השגיאה מועדף על ההודעה: קצר, חד-משמעי, ולא גורר גוף תשובה
    await expect(readDomainHealth("example.co.il", { query, now })).rejects.toThrow("whois נכשל: ECONNREFUSED");
  });

  it("timeout בלי code נזרק עם ההודעה עצמה", async () => {
    const query = vi.fn<DomainDeps["query"]>(async () => {
      throw new Error("whois timeout");
    });
    await expect(readDomainHealth("example.com", { query, now })).rejects.toThrow("whois נכשל: whois timeout");
  });

  it("כשל בקפיצה השנייה בלבד גם הוא נזרק", async () => {
    const query = vi.fn<DomainDeps["query"]>(async (server) => {
      if (server === "whois.iana.org") return IANA_COM_BODY;
      throw new Error("socket hang up");
    });
    await expect(readDomainHealth("example.com", { query, now })).rejects.toThrow("whois נכשל");
  });

  it("תאריך שלא ניתן לפענוח נשאר לא נבדק ולעולם לא Invalid Date", async () => {
    const body = `domain: broken.co.il
validity: soon
registrar name: Communication Ltd
`;
    const result = await readDomainHealth("broken.co.il", { query: queryOf({ "whois.isoc.org.il": body }), now });

    expect(result).toEqual({ registrar: "Communication Ltd" });
    expect(JSON.stringify(result)).not.toContain("Invalid");
  });

  it("תאריך בצורה תקינה אבל לא קיים בלוח השנה נדחה", async () => {
    const body = "domain: broken2.co.il\nvalidity: 31-02-2027\n";
    expect(await readDomainHealth("broken2.co.il", { query: queryOf({ "whois.isoc.org.il": body }), now })).toBeUndefined();
  });

  it("שנה מחוץ לטווח נדחית - גם רחוקה מדי וגם ישנה מדי", async () => {
    const far = "domain: far.co.il\nvalidity: 2999-01-01\n";
    const old = "domain: old.co.il\nvalidity: 1970-01-01\n";

    expect(await readDomainHealth("far.co.il", { query: queryOf({ "whois.isoc.org.il": far }), now })).toBeUndefined();
    expect(await readDomainHealth("old.co.il", { query: queryOf({ "whois.isoc.org.il": old }), now })).toBeUndefined();
  });

  it("תשובה ריקה או רשומה שלא נמצאה - לא נבדק, לא אובייקט ריק", async () => {
    const query = queryOf({ "whois.isoc.org.il": "% No entries found for the selected source(s).\n" });
    expect(await readDomainHealth("missing.co.il", { query, now })).toBeUndefined();
  });
});

describe("readDomainHealth - מה שאין טעם לשאול עליו", () => {
  it("אתר על פלטפורמה וכתובת IP לא נשאלים בכלל", async () => {
    const query = vi.fn<DomainDeps["query"]>(async () => ISOC_BODY);

    expect(await readDomainHealth("mybiz.wixsite.com", { query, now })).toBeUndefined();
    expect(await readDomainHealth("https://shop.myshopify.com/collections", { query, now })).toBeUndefined();
    expect(await readDomainHealth("192.0.2.10", { query, now })).toBeUndefined();
    expect(await readDomainHealth("", { query, now })).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
