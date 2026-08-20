import { describe, it, expect } from "vitest";
import { readMailHealth, type MailDeps } from "../src/pipeline/health/dns-mail";

// שגיאת DNS מזויפת עם קוד - הקוד הוא כל ההבדל בין "אין רשומה" ל"לא נבדק"
function dnsError(code: string): Error {
  const err = new Error(`queryDns ${code}`) as Error & { code?: string };
  err.code = code;
  return err;
}

const fail = (code: string) => () => Promise.reject(dnsError(code));

// רזולברים מזויפים בלבד. אין כאן שום פנייה ל-DNS אמיתי, בשום מקרה בדיקה
function deps(over: Partial<MailDeps>): Partial<MailDeps> {
  return over;
}

// צורת MX אמיתית של Google Workspace כפי שנצפתה חי (כולל אותיות גדולות ונקודה סופית,
// שני דברים שהתשובה האמיתית מכילה ושבלי נרמול היו מפילים את הזיהוי)
const GOOGLE_MX = [
  { exchange: "ALT1.ASPMX.L.GOOGLE.COM.", priority: 5 },
  { exchange: "aspmx.l.google.com", priority: 1 },
  { exchange: "alt4.aspmx.l.google.com", priority: 10 },
  { exchange: "aspmx3.googlemail.com", priority: 10 },
];

describe("readMailHealth - זיהוי ספק", () => {
  it("מזהה Google Workspace מרשומות MX אמיתיות ומדווח hasMx", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: fail("ENODATA"),
    }));
    expect(mail?.provider).toBe("Google Workspace");
    expect(mail?.hasMx).toBe(true);
  });

  it("מזהה Microsoft 365 בשתי צורות הנקודה החדשה והישנה", async () => {
    const old = await readMailHealth("zap.co.il", deps({
      resolveMx: async () => [{ exchange: "zap-co-il.mail.protection.outlook.com", priority: 0 }],
      resolveTxt: fail("ENODATA"),
    }));
    const fresh = await readMailHealth("aroma.co.il", deps({
      resolveMx: async () => [{ exchange: "aroma-co-il.mail.eo.outlook.com", priority: 5 }],
      resolveTxt: fail("ENODATA"),
    }));
    expect(old?.provider).toBe("Microsoft 365");
    expect(fresh?.provider).toBe("Microsoft 365");
  });

  it("מזהה ספק ישראלי מרשומת MX של inbox.co.il", async () => {
    const mail = await readMailHealth("upress.co.il", deps({
      resolveMx: async () => [
        { exchange: "mx1.inbox.co.il", priority: 10 },
        { exchange: "mx2.inbox.co.il", priority: 20 },
      ],
      resolveTxt: fail("ENODATA"),
    }));
    expect(mail?.provider).toBe("Inbox.co.il");
  });

  it("בוחר את שער הדואר הראשי לפי priority כשיש שער לפני תיבת הדואר", async () => {
    const mail = await readMailHealth("upress.io", deps({
      resolveMx: async () => [
        { exchange: "upress-io.mail.protection.outlook.com", priority: 10 },
        { exchange: "upress-inc.in.tmes.trendmicro.com", priority: 1 },
      ],
      resolveTxt: fail("ENODATA"),
    }));
    expect(mail?.provider).toBe("Trend Micro Email Security");
  });

  it("לא מנחש ספק כשאין טביעת אצבע - לא מחזיר את שם ה-MX הגולמי", async () => {
    const mail = await readMailHealth("golf.co.il", deps({
      resolveMx: async () => [{ exchange: "golf.co.il", priority: 10 }],
      resolveTxt: fail("ENODATA"),
    }));
    expect(mail?.hasMx).toBe(true);
    expect(mail?.provider).toBeUndefined();
  });
});

describe("readMailHealth - SPF ו-DMARC", () => {
  it("מזהה SPF קיים לצד רשומות TXT אחרות, ומתעלם מ-TXT שרק מזכירה spf", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: fail("ENODATA"),
      resolveTxt: async (host) =>
        host.startsWith("_dmarc.")
          ? []
          : [
              ["google-site-verification=abc"],
              ["this text mentions spf but is not a record"],
              ["v=spf1 include:_spf.google.com ~all"],
            ],
    }));
    expect(mail?.hasSpf).toBe(true);
  });

  it("מדווח hasSpf=false כשיש TXT בלי רשומת SPF", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: fail("ENODATA"),
      resolveTxt: async () => [["google-site-verification=abc"]],
    }));
    expect(mail?.hasSpf).toBe(false);
  });

  it("מזהה DMARC על _dmarc בלבד, לא על הדומיין עצמו", async () => {
    const asked: string[] = [];
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: fail("ENODATA"),
      resolveTxt: async (host) => {
        asked.push(host);
        return host === "_dmarc.example.co.il"
          ? [["v=DMARC1; p=reject; rua=mailto:x@example.co.il"]]
          : [["v=spf1 -all"]];
      },
    }));
    expect(asked).toContain("_dmarc.example.co.il");
    expect(mail?.hasDmarc).toBe(true);
    expect(mail?.hasSpf).toBe(true);
  });

  it("מחבר מקטעי TXT ארוכה לפני ההשוואה - רשומה שנחתכה ל-255 בתים", async () => {
    const longSpf = "v=spf1 include:_spf.google.com include:servers.mcsv.net include:sendgrid.net";
    const chunks = [longSpf.slice(0, 20), longSpf.slice(20)];
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: fail("ENODATA"),
      // המקטע הראשון לבדו אינו רשומת SPF שלמה - רק החיבור חושף אותה
      resolveTxt: async (host) => (host.startsWith("_dmarc.") ? [] : [chunks]),
    }));
    expect(chunks[0].startsWith("v=spf1 include:_spf.g")).toBe(false);
    expect(mail?.hasSpf).toBe(true);
  });
});

// המקרה החי jems.co.il (20.8): שתי רשומות SPF על אותו דומיין, אחת של Microsoft 365 ואחת
// של elasticemail. לפי RFC 7208 סעיף 4.5 זו permerror - הבדיקה מתבטלת כולה, ולא "יש הגנה
// כפולה". עד התיקון דיווחנו hasSpf=true ופספסנו ממצא דליוורביליות אמיתי
describe("readMailHealth - רשומה כפולה מבטלת את ההגנה", () => {
  const JEMS_SPF = [
    ["v=spf1 include:spf.protection.outlook.com -all"],
    ["v=spf1 include:_spf.elasticemail.com ~all"],
  ];

  it("שתי רשומות SPF: הקיום נשאר נכון, וההתנגשות מדווחת בשדה נפרד", async () => {
    const mail = await readMailHealth("jems.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async (host) => (host.startsWith("_dmarc.") ? [] : JEMS_SPF),
    }));
    // hasSpf נשאר true כי זו האמת: יש רשומות. מה שלא עובד הוא הבדיקה, וזה השדה השני
    expect(mail?.hasSpf).toBe(true);
    expect(mail?.spfConflict).toBe(true);
  });

  it("רשומת SPF אחת לצד TXT אחרות אינה התנגשות", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async (host) =>
        host.startsWith("_dmarc.")
          ? []
          : [["google-site-verification=abc"], ["v=spf1 include:_spf.google.com ~all"], ["MS=ms12345"]],
    }));
    expect(mail?.hasSpf).toBe(true);
    expect(mail?.spfConflict).toBe(false);
  });

  it("בלי שום רשומת SPF אין גם התנגשות", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async () => [["google-site-verification=abc"]],
    }));
    expect(mail?.hasSpf).toBe(false);
    expect(mail?.spfConflict).toBe(false);
  });

  it("שתי רשומות DMARC נספרות באותה דרך (RFC 7489 - המדיניות נזרקת)", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async (host) =>
        host.startsWith("_dmarc.")
          ? [["v=DMARC1; p=none"], ["v=DMARC1; p=reject"]]
          : [["v=spf1 -all"]],
    }));
    expect(mail?.hasDmarc).toBe(true);
    expect(mail?.dmarcConflict).toBe(true);
  });

  it("ההתנגשות נשארת חסרה כששאילתת ה-TXT לא הושלמה - כמו שאר השדות", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: fail("SERVFAIL"),
    }));
    expect(mail).not.toHaveProperty("spfConflict");
    expect(mail).not.toHaveProperty("dmarcConflict");
    expect(mail?.hasMx).toBe(true);
  });
});

describe("readMailHealth - כנות: אין רשומה מול לא נבדק", () => {
  it("ENOTFOUND ו-ENODATA שניהם מייצרים hasDmarc=false", async () => {
    for (const code of ["ENOTFOUND", "ENODATA"]) {
      const mail = await readMailHealth("example.co.il", deps({
        resolveMx: fail("ENODATA"),
        resolveTxt: async (host) => {
          if (host.startsWith("_dmarc.")) throw dnsError(code);
          return [["v=spf1 -all"]];
        },
      }));
      expect(mail?.hasDmarc, code).toBe(false);
    }
  });

  it("SERVFAIL או timeout משאירים את השדה חסר, לעולם לא false", async () => {
    for (const code of ["SERVFAIL", "ETIMEOUT", "EAI_AGAIN", "ECONNREFUSED"]) {
      const mail = await readMailHealth("example.co.il", deps({
        resolveMx: async () => GOOGLE_MX,
        resolveTxt: async (host) => {
          if (host.startsWith("_dmarc.")) throw dnsError(code);
          return [["v=spf1 -all"]];
        },
      }));
      expect(mail?.hasDmarc, code).toBeUndefined();
      expect(mail, code).not.toHaveProperty("hasDmarc");
      // שאר הבדיקות שהושלמו נשמרות כרגיל - כישלון אחד לא מוחק ממצאים אחרים
      expect(mail?.hasSpf, code).toBe(true);
      expect(mail?.hasMx, code).toBe(true);
    }
  });

  it("שגיאה בלי קוד כלל נחשבת ללא נבדק", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async () => {
        throw new Error("משהו לא צפוי");
      },
    }));
    expect(mail).not.toHaveProperty("hasSpf");
    expect(mail).not.toHaveProperty("hasDmarc");
    expect(mail?.hasMx).toBe(true);
  });

  it("כשכל השאילתות לא הושלמו מוחזר undefined ולא אובייקט ריק", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: fail("SERVFAIL"),
      resolveTxt: fail("SERVFAIL"),
    }));
    expect(mail).toBeUndefined();
  });
});

describe("readMailHealth - MX", () => {
  it("דומיין בלי MX עם רשומת A מדווח hasMx=false ותו לא", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      // ENODATA על MX הוא בדיוק המצב של דומיין שיש לו A אבל אין לו MX
      resolveMx: fail("ENODATA"),
      resolveTxt: async (host) => (host.startsWith("_dmarc.") ? [] : [["v=spf1 -all"]]),
    }));
    expect(mail?.hasMx).toBe(false);
    expect(mail?.provider).toBeUndefined();
    // אין שום שדה נוסף שנגזר מהיעדר ה-MX: המידע היחיד הוא שלא פורסמה רשומה. שדות
    // ההתנגשות כן מופיעים, אבל הם נגזרים משאילתות ה-TXT שהושלמו - לא מה-MX שנכשל
    expect(Object.keys(mail ?? {}).sort()).toEqual([
      "dmarcConflict", "hasDmarc", "hasMx", "hasSpf", "spfConflict",
    ]);
  });

  it("null MX (רשומה ריקה, RFC 7505) נספר כאין MX ולא כספק", async () => {
    const mail = await readMailHealth("landver.co.il", deps({
      resolveMx: async () => [{ exchange: "", priority: 0 }],
      resolveTxt: async (host) => (host.startsWith("_dmarc.") ? [] : [["v=spf1 -all"]]),
    }));
    expect(mail?.hasMx).toBe(false);
    expect(mail?.provider).toBeUndefined();
  });

  it("מערך MX ריק שקול לאין רשומה", async () => {
    const mail = await readMailHealth("example.co.il", deps({
      resolveMx: async () => [],
      resolveTxt: fail("ENODATA"),
    }));
    expect(mail?.hasMx).toBe(false);
  });
});

describe("readMailHealth - אין דומיין של העסק", () => {
  it("אתר על פלטפורמה (wixsite) מחזיר undefined בלי לשאול את ה-DNS", async () => {
    let calls = 0;
    const count = async () => {
      calls += 1;
      return [];
    };
    const mail = await readMailHealth("mybiz.wixsite.com", deps({
      resolveMx: count,
      resolveTxt: count,
    }));
    expect(mail).toBeUndefined();
    // הרשומות של Wix אינן של העסק - אסור אפילו לשאול עליהן ולהציג אותן כשלו
    expect(calls).toBe(0);
  });

  it("כתובת IP מחזירה undefined", async () => {
    const mail = await readMailHealth("93.184.216.34", deps({
      resolveMx: async () => GOOGLE_MX,
      resolveTxt: async () => [["v=spf1 -all"]],
    }));
    expect(mail).toBeUndefined();
  });

  it("שם מארח פגום מחזיר undefined", async () => {
    for (const bad of ["", "localhost", "   "]) {
      const mail = await readMailHealth(bad, deps({
        resolveMx: async () => GOOGLE_MX,
        resolveTxt: async () => [["v=spf1 -all"]],
      }));
      expect(mail, bad).toBeUndefined();
    }
  });

  it("כתובת מלאה עם פרוטוקול ונתיב נחתכת לדומיין הרשום", async () => {
    const asked: string[] = [];
    await readMailHealth("https://www.example.co.il/contact?x=1", deps({
      resolveMx: async (host) => {
        asked.push(host);
        return GOOGLE_MX;
      },
      resolveTxt: async (host) => {
        asked.push(host);
        return [];
      },
    }));
    expect(asked).toEqual(["example.co.il", "example.co.il", "_dmarc.example.co.il"]);
  });
});
