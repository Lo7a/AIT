import { describe, expect, it } from "vitest";
import { makeFakeDb } from "./fakes/fake-db";
import {
  requestMysteryRun, tickMystery, recordInboundReply, adminMarkProbe, reportCompletedRuns, mysteryViewFor,
  availableChannels, addressOf, listMysteryProbes, mysteryDepsFromEnv, RUN_COOLDOWN_MS, WAIT_FOR_REPLY_MS,
  type MysteryDeps,
} from "../src/server/run-mystery";
import type { MailMessage, MailTransport } from "../src/server/mail";
import type { ScanFindings } from "../src/pipeline/types";
import type { LookupLike } from "../src/pipeline/resolve-guard";

// הכול אופליין: fake-db, תובלת מייל מרגלת, fetch מדומה לאתר של העסק, שעון ואקראיות קבועים.
// ראשון 30.8.2026 09:00 בישראל = 06:00 UTC

const SITE = "https://biz.example.co.il";
const NOW = new Date("2026-08-30T06:00:00Z");
const publicLookup: LookupLike = async () => [{ address: "93.184.216.34", family: 4 }];

const FINDINGS: ScanFindings = {
  business: { placeId: "p1", name: "מספרת הדוגמה", phone: "03-0000000", website: SITE, primaryType: "hair_salon" },
  websiteSignals: {
    pagesCrawled: 1, crawledUrls: [SITE], hasContactForm: true, hasWhatsappLink: true, hasPhoneLink: true,
    hasEmailLink: true, contactEmail: "info@biz.example.co.il", hasOnlineBooking: false, hasChatWidget: false,
    hasFacebookPixel: false, hasGoogleAnalytics: false,
  },
  partial: [],
  meta: { startedAt: NOW.toISOString(), durationMs: 1, placesCalls: 0, llmInputTokens: 0, llmOutputTokens: 0, estCostUsd: 0 },
};

const SITE_HTML = `<html><body>
  <a href="mailto:info@biz.example.co.il">מייל</a>
  <form method="post" action="/send.php"><input name="name"/><input type="email" name="email"/><textarea name="message"></textarea></form>
</body></html>`;

function makeMail() {
  const sent: MailMessage[] = [];
  const mail: MailTransport = { async send(msg) { sent.push(msg); } };
  return { mail, sent };
}

function makeFetch(posts: { url: string; body: string }[] = [], postStatus = 200) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push({ url: String(url), body: String(init.body) });
      return new Response("", { status: postStatus });
    }
    return new Response(SITE_HTML, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

async function seed(fake: ReturnType<typeof makeFakeDb>, opts: { withSite?: boolean } = {}) {
  const owner = await fake.db.user.create({ data: { authId: "auth-1", email: "owner@example.test" } });
  const biz = await fake.db.business.upsert({
    where: { placeId: "p1" }, update: {},
    create: { name: "מספרת הדוגמה", placeId: "p1", phone: "03-0000000", website: opts.withSite === false ? null : SITE, ownerUserId: owner.id },
  });
  const d = await fake.db.diagnosis.create({ data: { businessId: biz.id } });
  // עותק עמוק: הפייק שומר את האובייקט עצמו כשורה, ובדיקה אחת לא אמורה לראות את הראיה של קודמתה
  await fake.db.scan.create({ data: { diagnosisId: d.id, findings: structuredClone(FINDINGS), scores: null, raw: null, createdAt: NOW } });
  return { owner, biz, d };
}

const baseDeps = (over: Partial<MysteryDeps> = {}): MysteryDeps => ({
  now: () => NOW, random: () => 0, mailDomain: "bedekesek.test", lookupImpl: publicLookup, siteUrl: "https://bedekesek.test", ...over,
});

describe("availableChannels", () => {
  it("מייל וטופס רק עם דומיין מייל; וואטסאפ עם קישור או טלפון; טלפון רק עם מספר", () => {
    expect(availableChannels(FINDINGS, "03-0000000", "bedekesek.test")).toEqual(["email", "form", "whatsapp", "phone"]);
    expect(availableChannels(FINDINGS, "03-0000000", null)).toEqual(["whatsapp", "phone"]);
    expect(availableChannels(FINDINGS, null, "bedekesek.test")).toEqual(["email", "form", "whatsapp"]);
    const noSite: ScanFindings = { ...FINDINGS, websiteSignals: undefined };
    expect(availableChannels(noSite, null, "bedekesek.test")).toEqual([]);
    const js: ScanFindings = { ...FINDINGS, websiteSignals: { ...FINDINGS.websiteSignals!, jsRendered: true } };
    expect(availableChannels(js, null, "bedekesek.test")).toEqual(["email", "whatsapp"]);
  });
});

describe("requestMysteryRun", () => {
  it("מתכנן פנייה לכל ערוץ: מועד בשעות הפעילות, כתובת בדיקה למייל ולטופס בלבד, הסכמה נשמרת", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    const result = await requestMysteryRun(fake.db, d.id, owner.id, baseDeps());
    expect(result.channels).toEqual(["email", "form", "whatsapp", "phone"]);
    expect(fake.probes).toHaveLength(4);
    for (const p of fake.probes) {
      expect(p.runId).toBe(result.runId);
      expect(p.status).toBe("planned");
      expect(p.consentUserId).toBe(owner.id);
      expect(p.consentAt).toEqual(NOW);
      // random=0: החלון הראשון (היום), מתחיל שעה מעכשיו = 10:00 בישראל = 07:00 UTC
      expect(p.scheduledFor.toISOString()).toBe("2026-08-30T07:00:00.000Z");
      expect(p.messageBody).not.toMatch(/\p{N}/u);
    }
    const email = fake.probes.find((p) => p.channel === "email")!;
    expect(email.probeAddress).toMatch(/^probe-[0-9a-f]{12}@bedekesek\.test$/);
    expect(email.target).toBe("info@biz.example.co.il");
    expect(fake.probes.find((p) => p.channel === "form")!.target).toBe(SITE);
    expect(fake.probes.find((p) => p.channel === "phone")!.probeAddress).toBeNull();
    expect(fake.probes.find((p) => p.channel === "whatsapp")!.target).toBe("03-0000000");
  });

  it("סבב פתוח = conflict; סבב טרי מהחודש האחרון = conflict; אחרי חודש מותר", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    await requestMysteryRun(fake.db, d.id, owner.id, baseDeps());
    await expect(requestMysteryRun(fake.db, d.id, owner.id, baseDeps())).rejects.toMatchObject({ kind: "conflict" });
    for (const p of fake.probes) { p.status = "unanswered"; p.closedAt = NOW; }
    const soon = new Date(NOW.getTime() + RUN_COOLDOWN_MS - 1);
    await expect(requestMysteryRun(fake.db, d.id, owner.id, baseDeps({ now: () => soon }))).rejects.toMatchObject({ kind: "conflict" });
    const later = new Date(NOW.getTime() + RUN_COOLDOWN_MS);
    await expect(requestMysteryRun(fake.db, d.id, owner.id, baseDeps({ now: () => later }))).resolves.toBeTruthy();
  });

  it("אבחון שלא קיים = not_found; בלי סריקה = invalid; בלי אף ערוץ = invalid", async () => {
    const fake = makeFakeDb();
    await expect(requestMysteryRun(fake.db, "אין", "u", baseDeps())).rejects.toMatchObject({ kind: "not_found" });
    const biz = await fake.db.business.upsert({ where: { placeId: "p9" }, update: {}, create: { name: "בלי סריקה", placeId: "p9" } });
    const d = await fake.db.diagnosis.create({ data: { businessId: biz.id } });
    await expect(requestMysteryRun(fake.db, d.id, "u", baseDeps())).rejects.toMatchObject({ kind: "invalid" });
    await fake.db.scan.create({ data: { diagnosisId: d.id, findings: { ...FINDINGS, websiteSignals: undefined }, createdAt: NOW } });
    await expect(requestMysteryRun(fake.db, d.id, "u", baseDeps())).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("tickMystery - שליחה, המתנה, סגירה וכתיבה לדוח", () => {
  it("המסלול המלא: מייל וטופס נשלחים, תשובה במייל נמדדת, הטופס מתיישן, הערוצים המסייעים מתועדים ביד, והסבב נכתב לדוח", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    const { mail, sent } = makeMail();
    const posts: { url: string; body: string }[] = [];
    const deps = baseDeps({ mail, fetchImpl: makeFetch(posts) });
    await requestMysteryRun(fake.db, d.id, owner.id, deps);

    // לפני המועד - כלום לא זז
    expect(await tickMystery(fake.db, deps)).toEqual({ sent: 0, failed: 0, closed: 0, reported: 0 });

    const t1 = new Date("2026-08-30T07:00:00Z");
    const tick1 = await tickMystery(fake.db, { ...deps, now: () => t1 });
    expect(tick1).toEqual({ sent: 2, failed: 0, closed: 0, reported: 0 });
    const email = fake.probes.find((p) => p.channel === "email")!;
    const form = fake.probes.find((p) => p.channel === "form")!;
    expect(email.status).toBe("sent");
    expect(email.sentAt).toEqual(t1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "info@biz.example.co.il", from: email.probeAddress, replyTo: email.probeAddress, subject: "שאלה קטנה" });
    expect(sent[0].body).toContain("ראיתי אתכם בגוגל");
    expect(form.status).toBe("sent");
    expect(form.target).toBe(SITE);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`${SITE}/send.php`);
    expect(posts[0].body).toContain(encodeURIComponent(form.probeAddress));

    // תשובה במייל אחרי 42 דקות
    const t2 = new Date("2026-08-30T07:42:00Z");
    const probe = await recordInboundReply(fake.db, {
      to: [`מספרת הדוגמה <${email.probeAddress}>`], from: "info@biz.example.co.il", receivedAt: t2.toISOString(),
      text: "  היי נועה,\n בטח, יש לנו תור ביום שלישי. ", payload: { id: "em_1" },
    }, deps);
    expect(probe?.status).toBe("answered");
    expect(email.answeredAt).toEqual(t2);
    expect(email.replyExcerpt).toBe("היי נועה, בטח, יש לנו תור ביום שלישי.");
    // תשובה שנייה לא משנה את המדידה
    await recordInboundReply(fake.db, { to: [email.probeAddress], from: "x", receivedAt: null, text: "שוב", payload: null }, deps);
    expect(email.answeredAt).toEqual(t2);
    // כתובת לא מוכרת - null
    expect(await recordInboundReply(fake.db, { to: ["someone@else.test"], from: "x", receivedAt: null, text: "", payload: null }, deps)).toBeNull();

    // 73 שעות אחרי השליחה: הטופס מתיישן. הסבב עוד לא נכתב - וואטסאפ וטלפון פתוחים
    const t3 = new Date(t1.getTime() + WAIT_FOR_REPLY_MS + 60_000);
    const tick2 = await tickMystery(fake.db, { ...deps, now: () => t3 });
    expect(tick2).toMatchObject({ closed: 1, reported: 0 });
    expect(form.status).toBe("unanswered");
    expect(form.closedAt).toEqual(t3);
    expect(fake.scans[0].findings.mystery).toBeUndefined();

    // הערוצים המסייעים: וואטסאפ נשלח ונענה, טלפון דולג
    const wa = fake.probes.find((p) => p.channel === "whatsapp")!;
    const phone = fake.probes.find((p) => p.channel === "phone")!;
    const t4 = new Date(t3.getTime() + 60_000);
    await adminMarkProbe(fake.db, wa.id, "sent", { ...deps, now: () => t4 });
    await expect(adminMarkProbe(fake.db, wa.id, "sent", deps)).rejects.toMatchObject({ kind: "invalid" });
    await adminMarkProbe(fake.db, wa.id, "answered", { ...deps, now: () => new Date(t4.getTime() + 5 * 60_000) });
    expect(fake.scans[0].findings.mystery).toBeUndefined(); // הטלפון עדיין פתוח
    const t5 = new Date(t4.getTime() + 10 * 60_000);
    await adminMarkProbe(fake.db, phone.id, "skipped", { ...deps, now: () => t5 });

    // עכשיו הכול סגור: הראיה בדוח, הציון חושב מחדש, כולם מסומנים reported
    const evidence = fake.scans[0].findings.mystery;
    expect(evidence.results).toHaveLength(3); // מייל, טופס, וואטסאפ - הטלפון שדולג לא נמדד
    expect(evidence.results.find((r: { channel: string }) => r.channel === "email")).toEqual({
      channel: "email", sentAt: t1.toISOString(), answeredAt: t2.toISOString(), closedAt: t2.toISOString(),
    });
    expect(evidence.results.find((r: { channel: string }) => r.channel === "form").answeredAt).toBeUndefined();
    const process = fake.scans[0].scores.dimensions.find((x: { key: string }) => x.key === "process");
    const lead = process.rules.find((r: { key: string }) => r.key === "lead_handling");
    expect(lead.known).toBe(true);
    expect(lead.earned).toBe(false); // הטופס לא נענה - הלקוח שפנה שם נשאר בלי תשובה
    expect(lead.text).toContain("ולא קיבל תשובה במשך 3 ימים");
    expect(fake.probes.every((p) => p.reportedAt?.getTime() === t5.getTime())).toBe(true);

    // חשיפה: לכתובת המייל שפנינו אליה (פעם אחת, מהכתובת של הבדיקה), ומייל תוצאה לבעלים עם קישור
    const disclosures = sent.filter((m) => m.subject === "Re: שאלה קטנה");
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0]).toMatchObject({ to: "info@biz.example.co.il", from: email.probeAddress });
    expect(disclosures[0].body).toContain("בדיקת לקוח סמוי מטעם בדק עסק");
    expect(email.disclosedAt).toEqual(t5);
    const ownerMail = sent.find((m) => m.to === "owner@example.test")!;
    expect(ownerMail.subject).toContain("יש תוצאה");
    expect(ownerMail.body).toContain(`https://bedekesek.test/report/${d.id}`);
    expect(fake.usageEvents.some((e) => e.type === "mystery_reported" && e.userId === owner.id)).toBe(true);

    // כתיבה חוזרת לא קורית
    expect(await reportCompletedRuns(fake.db, deps)).toBe(0);

    // התצוגה לדוח אחרי הסגירה
    const view = await mysteryViewFor(fake.db, d.id, FINDINGS, "03-0000000", { ...deps, now: () => t5 });
    expect(view.runId).toBe(email.runId);
    expect(view.probes.map((p) => `${p.channel}:${p.status}`)).toEqual(["email:answered", "form:unanswered", "whatsapp:answered", "phone:skipped"]);
    expect(view.reportedAt).toEqual(t5);
    expect(view.canRequest).toBe(false);
    expect(view.nextAllowedAt).toEqual(new Date(NOW.getTime() + RUN_COOLDOWN_MS));
  });

  it("טופס שהאתר דוחה = נכשל עם סיבה קריאה, ומייל בלי כתובת באתר = נכשל; סבב שכולו נכשל נסגר בלי ראיה", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    const { mail, sent } = makeMail();
    const noEmailFindings: ScanFindings = { ...FINDINGS, websiteSignals: { ...FINDINGS.websiteSignals!, contactEmail: undefined, hasWhatsappLink: false } };
    fake.scans[0].findings = noEmailFindings;
    fake.businesses[0].phone = null;
    const noContactHtml = `<html><body><form method="post" action="/x"><input name="a"/><input name="b"/><textarea name="m"></textarea></form></body></html>`;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST" ? new Response("", { status: 500 }) : new Response(noContactHtml, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const deps = baseDeps({ mail, fetchImpl });
    const r = await requestMysteryRun(fake.db, d.id, owner.id, deps);
    expect(r.channels).toEqual(["email", "form"]);
    const t1 = new Date("2026-08-30T07:00:00Z");
    expect(await tickMystery(fake.db, { ...deps, now: () => t1 })).toEqual({ sent: 0, failed: 2, closed: 0, reported: 1 });
    const email = fake.probes.find((p) => p.channel === "email")!;
    const form = fake.probes.find((p) => p.channel === "form")!;
    expect(email).toMatchObject({ status: "failed", failReason: "לא נמצאה כתובת מייל באתר" });
    expect(form).toMatchObject({ status: "failed", failReason: "הטופס באתר החזיר שגיאה בשליחה" });
    expect(form.payload).toEqual({ formAction: `${SITE}/x`, status: 500 });
    expect(fake.scans[0].findings.mystery).toBeUndefined();
    expect(sent.filter((m) => m.subject === "Re: שאלה קטנה")).toHaveLength(0);
    expect(sent.find((m) => m.to === "owner@example.test")).toBeTruthy();
  });

  it("שגיאת רשת בשליחה לא מפילה את התקתוק - הפנייה מסומנת נכשלה וממשיכים", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    const failingMail: MailTransport = { async send() { throw new Error("Resend החזיר 500"); } };
    const deps = baseDeps({ mail: failingMail, fetchImpl: makeFetch() });
    await requestMysteryRun(fake.db, d.id, owner.id, deps);
    const t1 = new Date("2026-08-30T07:00:00Z");
    const r = await tickMystery(fake.db, { ...deps, now: () => t1 });
    expect(r.sent).toBe(1); // הטופס
    expect(r.failed).toBe(1); // המייל
    expect(fake.probes.find((p) => p.channel === "email")).toMatchObject({ status: "failed", failReason: "השליחה נכשלה" });
  });
});

describe("mysteryViewFor / listMysteryProbes / עזרים", () => {
  it("בלי סבב: אפשר להזמין כשיש ערוץ; בזמן סבב פתוח: לא, ובלי מועד הבא", async () => {
    const fake = makeFakeDb();
    const { d, owner } = await seed(fake);
    const empty = await mysteryViewFor(fake.db, d.id, FINDINGS, null, baseDeps());
    expect(empty).toMatchObject({ runId: null, probes: [], canRequest: true, nextAllowedAt: null, available: ["email", "form", "whatsapp"] });
    await requestMysteryRun(fake.db, d.id, owner.id, baseDeps());
    const open = await mysteryViewFor(fake.db, d.id, FINDINGS, null, baseDeps());
    expect(open.canRequest).toBe(false);
    expect(open.nextAllowedAt).toBeNull();
    expect(open.reportedAt).toBeNull();
    const admin = await listMysteryProbes(fake.db);
    expect(admin).toHaveLength(4);
    expect(admin[0]).toMatchObject({ businessName: "מספרת הדוגמה", businessPhone: "03-0000000", diagnosisId: d.id });
    expect(admin[0].messageBody).toBeTruthy();
  });

  it("addressOf ו-mysteryDepsFromEnv", () => {
    expect(addressOf("נועה <Probe-AB@X.test>")).toBe("probe-ab@x.test");
    expect(addressOf("  plain@x.test ")).toBe("plain@x.test");
    expect(mysteryDepsFromEnv({})).toEqual({ mailDomain: null, siteUrl: null });
    expect(mysteryDepsFromEnv({ MYSTERY_MAIL_DOMAIN: " bedekesek.co.il ", VERCEL_PROJECT_PRODUCTION_URL: "bedekesek.co.il" }))
      .toEqual({ mailDomain: "bedekesek.co.il", siteUrl: "https://bedekesek.co.il" });
  });
});
