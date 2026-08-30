import type { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { InterviewError } from "../pipeline/interview/contract";
import type { MysteryChannel, MysteryProbeResult, ScanFindings } from "../pipeline/types";
import { toFindings, toModelView } from "./diagnosis-read";
import { scoreWithModel } from "../pipeline/score/engine";
import { industryOf } from "../pipeline/industry";
import { pickSendTime, openingPeriodsFromRaw } from "../pipeline/mystery/schedule";
import { composeInquiry, pickPersona, disclosureText, INQUIRY_SUBJECT } from "../pipeline/mystery/message";
import { findContactForm, submitForm } from "../pipeline/mystery/form";
import { probeVerdict } from "../pipeline/mystery/evidence";
import { fetchPage } from "../pipeline/crawler/crawl";
import { extractSignals } from "../pipeline/crawler/signals";
import { defaultFetch, type FetchLike } from "../pipeline/http";
import { defaultLookup, type LookupLike } from "../pipeline/resolve-guard";
import { consoleMailTransport, type MailTransport } from "./mail";
import { emitUsageEvent } from "./usage-events";

// הלקוח הסמוי (משימה 10, הכרעת מייסד 30.8) - האורקסטרטור. ארבע פעולות:
// 1. requestMysteryRun: בעל העסק לחץ (הסכמה) - מתכננים סבב: ערוץ לכל דרך פנייה שנמצאה, מועד
//    אקראי לכל אחד. שום דבר לא נשלח כאן.
// 2. tickMystery: התקתוק השעתי (pg_cron) - שולח מה שהגיע זמנו (מייל/טופס), סוגר מה שחיכה
//    72 שעות בלי תשובה, וכותב לדוח סבבים שנסגרו.
// 3. recordInboundReply: תשובה שחזרה לכתובת הבדיקה (webhook) - הרגע שנמדד.
// 4. adminMarkProbe: הערוצים המסייעים (וואטסאפ/טלפון) - מישהו מהחברה שלח ביד ומתעד.
// כל ראיה נכתבת ל-scan.findings.mystery והציון מחושב מחדש באותו מסלול כמו אחרי ראיון.
// כנות: תוצאה = יום, שעה ומשך שנמדדו. אף פעם לא שיעור

export const PROBE_STATUSES = ["planned", "sent", "answered", "unanswered", "failed", "skipped"] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];
const OPEN_STATUSES: ProbeStatus[] = ["planned", "sent"];
// ערוצים שהמערכת שולחת בעצמה; השאר מסייעים (ביד)
const AUTO_CHANNELS: MysteryChannel[] = ["email", "form"];

export const RUN_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const WAIT_FOR_REPLY_MS = 72 * 60 * 60 * 1000;
const REPLY_EXCERPT_MAX = 200;
const FETCH_TIMEOUT_MS = 10_000;
const TICK_BATCH = 20;
const CONTACT_LINK_RE = /contact|קשר|צור/i;

export interface MysteryDeps {
  now?: () => Date;
  random?: () => number;
  fetchImpl?: FetchLike;
  lookupImpl?: LookupLike;
  mail?: MailTransport;
  // הדומיין שממנו יוצאות פניות הבדיקה ואליו חוזרות התשובות. null = ערוצי המייל והטופס כבויים
  mailDomain?: string | null;
  // כתובת האתר לקישור בדוח במייל לבעלים (למשל https://bedekesek.co.il). null = בלי קישור
  siteUrl?: string | null;
}

interface ResolvedDeps {
  now: () => Date;
  random: () => number;
  fetchImpl: FetchLike;
  lookupImpl: LookupLike;
  mail: MailTransport;
  mailDomain: string | null;
  siteUrl: string | null;
}

function resolve(deps: MysteryDeps): ResolvedDeps {
  return {
    now: deps.now ?? (() => new Date()),
    random: deps.random ?? Math.random,
    fetchImpl: deps.fetchImpl ?? defaultFetch,
    lookupImpl: deps.lookupImpl ?? defaultLookup,
    mail: deps.mail ?? consoleMailTransport,
    mailDomain: deps.mailDomain ?? null,
    siteUrl: deps.siteUrl ?? null,
  };
}

/** קריאת ההגדרות מהסביבה - הנתיבים קוראים בלי ארגומנטים, הבדיקות מזריקות */
export function mysteryDepsFromEnv(env: Record<string, string | undefined> = process.env): Pick<MysteryDeps, "mailDomain" | "siteUrl"> {
  const domain = env.MYSTERY_MAIL_DOMAIN?.trim() || null;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return { mailDomain: domain, siteUrl: host ? `https://${host}` : null };
}

// שורת probe כפי שהיא חוזרת מ-prisma (הפייק מחזיר אותה צורה)
export interface ProbeRow {
  id: string;
  diagnosisId: string;
  runId: string;
  channel: string;
  status: string;
  target: string | null;
  probeAddress: string | null;
  senderName: string | null;
  messageBody: string | null;
  scheduledFor: Date;
  sentAt: Date | null;
  answeredAt: Date | null;
  closedAt: Date | null;
  replyExcerpt: string | null;
  failReason: string | null;
  reportedAt: Date | null;
  disclosedAt: Date | null;
  consentUserId: string;
  consentAt: Date;
  payload: unknown;
  createdAt: Date;
}

const isOpen = (p: ProbeRow) => OPEN_STATUSES.includes(p.status as ProbeStatus);

/**
 * אילו ערוצים אפשר לבדוק לעסק הזה, מתוך מה שהסריקה מצאה. מייל וטופס דורשים דומיין מייל
 * מוגדר (התשובה חוזרת אליו); אתר שמרונדר ב-JS לא נותן טופס שאפשר לשלוח בלי דפדפן.
 * וואטסאפ וטלפון נשלחים ביד, ולכן מספיק שיש מספר (מגוגל) או קישור וואטסאפ באתר
 */
export function availableChannels(f: ScanFindings, phone: string | null, mailDomain: string | null): MysteryChannel[] {
  const ws = f.websiteSignals;
  const out: MysteryChannel[] = [];
  if (mailDomain && ws?.hasEmailLink) out.push("email");
  if (mailDomain && ws?.hasContactForm && ws.jsRendered !== true) out.push("form");
  if (ws?.hasWhatsappLink || phone) out.push("whatsapp");
  if (phone) out.push("phone");
  return out;
}

async function loadDiagnosis(prisma: PrismaClient, diagnosisId: string) {
  const d = await prisma.diagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      business: { include: { owner: { select: { email: true } } } },
      scans: { orderBy: { createdAt: "desc" }, take: 1 },
      businessModel: true,
    },
  });
  if (!d) throw new InterviewError("האבחון לא נמצא", "not_found");
  return d;
}

export interface RequestResult { runId: string; channels: MysteryChannel[] }

export async function requestMysteryRun(
  prisma: PrismaClient, diagnosisId: string, consentUserId: string, depsIn: MysteryDeps = {},
): Promise<RequestResult> {
  const deps = resolve(depsIn);
  const now = deps.now();
  const d = await loadDiagnosis(prisma, diagnosisId);
  const scan = d.scans[0];
  if (!scan) throw new InterviewError("עוד אין סריקה לאבחון הזה", "invalid");
  const findings = toFindings(scan.findings);

  const existing = (await prisma.mysteryProbe.findMany({
    where: { diagnosisId }, orderBy: { createdAt: "desc" },
  })) as ProbeRow[];
  if (existing.some(isOpen)) throw new InterviewError("בדיקת לקוח סמוי כבר בדרך - נעדכן אותך כשיש תוצאה", "conflict");
  const last = existing[0];
  if (last && last.consentAt.getTime() + RUN_COOLDOWN_MS > now.getTime()) {
    throw new InterviewError("אפשר להזמין בדיקה פעם בחודש - הבדיקה הקודמת עוד טרייה", "conflict");
  }

  const channels = availableChannels(findings, d.business.phone, deps.mailDomain);
  if (channels.length === 0) {
    throw new InterviewError("לא מצאנו ערוץ שאפשר לבדוק: אין באתר כתובת מייל או טופס, ואין מספר טלפון בגוגל", "invalid");
  }

  const raw = scan.raw as { placeDetails?: unknown } | null;
  const periods = openingPeriodsFromRaw(raw?.placeDetails);
  const model = d.businessModel ? toModelView(d.businessModel) : null;
  const industry = industryOf(findings, model).slug;
  const persona = pickPersona(deps.random);
  const runId = randomUUID();

  for (const channel of channels) {
    const scheduledFor = pickSendTime({ now, random: deps.random, periods })
      ?? pickSendTime({ now, random: deps.random })
      ?? new Date(now.getTime() + 60 * 60 * 1000);
    const inquiry = composeInquiry(channel, industry, persona);
    const auto = AUTO_CHANNELS.includes(channel);
    const target = channel === "email"
      ? findings.websiteSignals?.contactEmail ?? null
      : channel === "form"
        ? d.business.website ?? findings.business.website ?? null
        : d.business.phone ?? null;
    await prisma.mysteryProbe.create({
      data: {
        diagnosisId, runId, channel, status: "planned", target,
        probeAddress: auto ? `probe-${randomBytes(6).toString("hex")}@${deps.mailDomain}` : null,
        senderName: inquiry.senderName, messageBody: inquiry.body,
        scheduledFor, consentUserId, consentAt: now,
      },
    });
  }
  return { runId, channels };
}

// --- שליחה ---

interface Located { email?: string; formHtml?: string; formPageUrl?: string }

// איתור יעד הפנייה באתר החי: עמוד הבית, ואם חסר - עד שני עמודי "צור קשר". אותה שרשרת הגנות
// כמו הסורק (fetchPage). הסריקה כבר אמרה שיש מייל/טופס; כאן מוצאים את הכתובת/הטופס עצמם
async function locateContact(siteUrl: string, deps: ResolvedDeps): Promise<Located> {
  const home = await fetchPage(siteUrl, deps.fetchImpl, deps.lookupImpl, FETCH_TIMEOUT_MS);
  const s = extractSignals(home.html, home.finalUrl);
  const out: Located = {};
  if (s.contactEmail) out.email = s.contactEmail;
  if (s.hasContactForm) { out.formHtml = home.html; out.formPageUrl = home.finalUrl; }
  if (out.email && out.formHtml) return out;
  const candidates = s.internalLinks.filter((u) => CONTACT_LINK_RE.test(safeDecode(u))).slice(0, 2);
  for (const url of candidates) {
    try {
      const page = await fetchPage(url, deps.fetchImpl, deps.lookupImpl, FETCH_TIMEOUT_MS);
      const ps = extractSignals(page.html, page.finalUrl);
      if (!out.email && ps.contactEmail) out.email = ps.contactEmail;
      if (!out.formHtml && ps.hasContactForm) { out.formHtml = page.html; out.formPageUrl = page.finalUrl; }
      if (out.email && out.formHtml) break;
    } catch {
      // עמוד קשר שנפל - ממשיכים לבא
    }
  }
  return out;
}

function safeDecode(u: string): string {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

async function markFailed(prisma: PrismaClient, p: ProbeRow, reason: string, now: Date, payload?: unknown): Promise<void> {
  await prisma.mysteryProbe.update({
    where: { id: p.id },
    data: { status: "failed", failReason: reason, closedAt: now, ...(payload !== undefined ? { payload: payload as object } : {}) },
  });
}

// שליחת פנייה אחת שהגיע זמנה. true = יצאה; false = נכשלה (עם סיבה שבעל העסק יכול לקרוא)
async function dispatchProbe(prisma: PrismaClient, p: ProbeRow, deps: ResolvedDeps): Promise<boolean> {
  const now = deps.now();
  if (!p.probeAddress || !p.messageBody || !p.senderName) {
    await markFailed(prisma, p, "הפנייה לא הוגדרה כראוי", now);
    return false;
  }
  try {
    const d = await loadDiagnosis(prisma, p.diagnosisId);
    const site = d.business.website ?? null;
    if (p.channel === "email") {
      let target = p.target;
      if (!target && site) target = (await locateContact(site, deps)).email ?? null;
      if (!target) { await markFailed(prisma, p, "לא נמצאה כתובת מייל באתר", now); return false; }
      await deps.mail.send({ to: target, from: p.probeAddress, replyTo: p.probeAddress, subject: INQUIRY_SUBJECT, body: p.messageBody });
      await prisma.mysteryProbe.update({ where: { id: p.id }, data: { status: "sent", sentAt: now, target } });
      return true;
    }
    if (p.channel === "form") {
      const pageUrl = p.target ?? site;
      if (!pageUrl) { await markFailed(prisma, p, "אין כתובת אתר", now); return false; }
      const located = await locateContact(pageUrl, deps);
      const form = located.formHtml && located.formPageUrl
        ? findContactForm(located.formHtml, located.formPageUrl, { name: p.senderName, email: p.probeAddress, message: p.messageBody })
        : null;
      if (!form) { await markFailed(prisma, p, "לא מצאנו באתר טופס שאפשר לשלוח בלי דפדפן", now); return false; }
      const res = await submitForm(form, { fetchImpl: deps.fetchImpl, lookupImpl: deps.lookupImpl });
      const payload = { formAction: form.action, status: res.status };
      if (!res.ok) { await markFailed(prisma, p, "הטופס באתר החזיר שגיאה בשליחה", now, payload); return false; }
      await prisma.mysteryProbe.update({ where: { id: p.id }, data: { status: "sent", sentAt: now, target: located.formPageUrl, payload } });
      return true;
    }
    await markFailed(prisma, p, "ערוץ לא נתמך לשליחה אוטומטית", now);
    return false;
  } catch (err) {
    await markFailed(prisma, p, "השליחה נכשלה", now, { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export interface TickResult { sent: number; failed: number; closed: number; reported: number }

export async function tickMystery(prisma: PrismaClient, depsIn: MysteryDeps = {}): Promise<TickResult> {
  const deps = resolve(depsIn);
  const now = deps.now();
  let sent = 0;
  let failed = 0;
  const due = (await prisma.mysteryProbe.findMany({
    where: { status: "planned", channel: { in: AUTO_CHANNELS }, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" }, take: TICK_BATCH,
  })) as ProbeRow[];
  for (const p of due) {
    if (await dispatchProbe(prisma, p, deps)) sent++; else failed++;
  }

  const stale = (await prisma.mysteryProbe.findMany({
    where: { status: "sent", sentAt: { lte: new Date(now.getTime() - WAIT_FOR_REPLY_MS) } },
  })) as ProbeRow[];
  for (const p of stale) {
    await prisma.mysteryProbe.update({ where: { id: p.id }, data: { status: "unanswered", closedAt: now } });
  }

  const reported = await reportCompletedRuns(prisma, depsIn);
  return { sent, failed, closed: stale.length, reported };
}

// --- תשובה נכנסת ---

export interface InboundReply {
  to: string[];
  from: string;
  receivedAt: string | null;
  text: string;
  payload: unknown;
}

// "נועה <probe-abc@x>" -> "probe-abc@x"
export function addressOf(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

export async function recordInboundReply(prisma: PrismaClient, reply: InboundReply, depsIn: MysteryDeps = {}): Promise<ProbeRow | null> {
  const deps = resolve(depsIn);
  const addresses = reply.to.map(addressOf).filter((a) => a.length > 0);
  if (addresses.length === 0) return null;
  const probe = (await prisma.mysteryProbe.findFirst({ where: { probeAddress: { in: addresses } } })) as ProbeRow | null;
  if (!probe) return null;
  // רק פנייה שיצאה ועוד מחכה נמדדת; תשובה שנייה, או תשובה אחרי שהסבב נסגר, לא משנה עובדה
  if (probe.status !== "sent") return probe;
  const parsed = reply.receivedAt ? Date.parse(reply.receivedAt) : NaN;
  const at = Number.isFinite(parsed) ? new Date(parsed) : deps.now();
  const excerpt = reply.text.replace(/\s+/g, " ").trim().slice(0, REPLY_EXCERPT_MAX);
  return (await prisma.mysteryProbe.update({
    where: { id: probe.id },
    data: {
      status: "answered", answeredAt: at, closedAt: at, replyExcerpt: excerpt,
      payload: { replyFrom: reply.from, reply: reply.payload } as object,
    },
  })) as ProbeRow;
}

// --- הערוצים המסייעים (מסך הניהול) ---

export const ADMIN_ACTIONS = ["sent", "answered", "unanswered", "skipped"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export async function adminMarkProbe(prisma: PrismaClient, probeId: string, action: AdminAction, depsIn: MysteryDeps = {}): Promise<ProbeRow> {
  const deps = resolve(depsIn);
  const now = deps.now();
  const p = (await prisma.mysteryProbe.findFirst({ where: { id: probeId } })) as ProbeRow | null;
  if (!p) throw new InterviewError("הפנייה לא נמצאה", "not_found");
  const data: Record<string, unknown> | null =
    action === "sent" && p.status === "planned" ? { status: "sent", sentAt: now }
      : action === "answered" && p.status === "sent" ? { status: "answered", answeredAt: now, closedAt: now }
        : action === "unanswered" && p.status === "sent" ? { status: "unanswered", closedAt: now }
          : action === "skipped" && p.status === "planned" ? { status: "skipped", closedAt: now, failReason: "לא נשלח" }
            : null;
  if (data == null) throw new InterviewError(`המעבר ${p.status} -> ${action} לא חוקי`, "invalid");
  const updated = (await prisma.mysteryProbe.update({ where: { id: p.id }, data })) as ProbeRow;
  await reportCompletedRuns(prisma, depsIn);
  return updated;
}

// --- כתיבה לדוח ---

/**
 * סבב שכל הפניות בו נסגרו ועוד לא נכתב לדוח: הראיה נכנסת ל-findings, הציון מחושב מחדש
 * (אותו מסלול כמו אחרי תשובת ראיון), הבעלים מקבל מייל, והעסק מקבל חשיפה בערוצי המייל.
 * מחזיר כמה סבבים נכתבו
 */
export async function reportCompletedRuns(prisma: PrismaClient, depsIn: MysteryDeps = {}): Promise<number> {
  const deps = resolve(depsIn);
  const candidates = (await prisma.mysteryProbe.findMany({
    where: { reportedAt: null, status: { notIn: OPEN_STATUSES } }, orderBy: { createdAt: "asc" },
  })) as ProbeRow[];
  const runIds = [...new Set(candidates.map((p) => p.runId))];
  let count = 0;
  for (const runId of runIds) {
    const probes = (await prisma.mysteryProbe.findMany({ where: { runId } })) as ProbeRow[];
    if (probes.length === 0 || probes.some(isOpen)) continue;
    await reportRun(prisma, probes, deps);
    count++;
  }
  return count;
}

async function reportRun(prisma: PrismaClient, probes: ProbeRow[], deps: ResolvedDeps): Promise<void> {
  const now = deps.now();
  const first = probes[0];
  const d = await loadDiagnosis(prisma, first.diagnosisId);
  const scan = d.scans[0];
  const results: MysteryProbeResult[] = probes
    .filter((p) => p.sentAt != null && (p.status === "answered" || p.status === "unanswered"))
    .map((p) => ({
      channel: p.channel as MysteryChannel,
      sentAt: p.sentAt!.toISOString(),
      ...(p.answeredAt ? { answeredAt: p.answeredAt.toISOString() } : {}),
      closedAt: (p.closedAt ?? now).toISOString(),
    }));

  let verdict = "none";
  if (scan && results.length > 0) {
    // עותק חדש ולא כתיבה על האובייקט שנטען - ה-findings שבזיכרון הם של הקורא, לא שלנו
    const findings: ScanFindings = { ...toFindings(scan.findings), mystery: { results } };
    const model = d.businessModel ? toModelView(d.businessModel) : null;
    const scores = scoreWithModel(findings, model);
    verdict = probeVerdict(findings);
    await prisma.scan.update({
      where: { id: scan.id },
      data: { findings: findings as unknown as object, scores: scores as unknown as object },
    });
  }
  await prisma.mysteryProbe.updateMany({ where: { runId: first.runId }, data: { reportedAt: now } });

  // חשיפה - תמיד, בלי אפשרות לבטל. במייל: לכתובת שפנינו אליה; בטופס: למי שענה לנו במייל
  for (const p of probes) {
    const replyFrom = (p.payload as { replyFrom?: unknown } | null)?.replyFrom;
    const to = p.channel === "email" && p.sentAt ? p.target
      : p.channel === "form" && p.status === "answered" && typeof replyFrom === "string" ? addressOf(replyFrom)
        : null;
    if (!to || !p.probeAddress) continue;
    try {
      await deps.mail.send({ to, from: p.probeAddress, subject: `Re: ${INQUIRY_SUBJECT}`, body: disclosureText(d.business.name) });
      await prisma.mysteryProbe.update({ where: { id: p.id }, data: { disclosedAt: now } });
    } catch (err) {
      console.error("שליחת החשיפה של הלקוח הסמוי נכשלה (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  const ownerEmail = d.business.owner?.email;
  if (ownerEmail) {
    const link = deps.siteUrl ? `${deps.siteUrl}/report/${d.id}` : null;
    const body = [
      `הלקוח הסמוי סיים את הבדיקה אצל ${d.business.name}.`,
      "התוצאה כבר בדוח, ליד הטיפול בפניות: מתי פנינו, באיזה ערוץ, ואם ומתי ענו לנו.",
      ...(link ? [link] : []),
      "בדק עסק",
    ].join("\n");
    try {
      await deps.mail.send({ to: ownerEmail, subject: "הלקוח הסמוי סיים - יש תוצאה בדוח", body });
    } catch (err) {
      console.error("מייל התוצאה לבעלים נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

  await emitUsageEvent(prisma, {
    type: "mystery_reported", userId: first.consentUserId,
    entityType: "diagnosis", entityId: d.id,
    metadata: { runId: first.runId, verdict, channels: probes.map((p) => `${p.channel}:${p.status}`) },
  });
}

// --- תצוגה ---

export interface ProbeView {
  id: string;
  channel: MysteryChannel;
  status: ProbeStatus;
  scheduledFor: Date;
  sentAt: Date | null;
  answeredAt: Date | null;
  closedAt: Date | null;
  failReason: string | null;
}

export interface MysteryView {
  runId: string | null;
  probes: ProbeView[];
  reportedAt: Date | null;
  available: MysteryChannel[];
  canRequest: boolean;
  nextAllowedAt: Date | null;
}

const toView = (p: ProbeRow): ProbeView => ({
  id: p.id, channel: p.channel as MysteryChannel, status: p.status as ProbeStatus,
  scheduledFor: p.scheduledFor, sentAt: p.sentAt, answeredAt: p.answeredAt, closedAt: p.closedAt, failReason: p.failReason,
});

/** מצב הלקוח הסמוי לכרטיס בדוח. findings והטלפון מגיעים מהדוח שכבר נטען - בלי שאילתה נוספת */
export async function mysteryViewFor(
  prisma: PrismaClient, diagnosisId: string, findings: ScanFindings, phone: string | null, depsIn: MysteryDeps = {},
): Promise<MysteryView> {
  const deps = resolve(depsIn);
  const now = deps.now();
  const rows = (await prisma.mysteryProbe.findMany({ where: { diagnosisId }, orderBy: { createdAt: "desc" } })) as ProbeRow[];
  const available = availableChannels(findings, phone, deps.mailDomain);
  const latest = rows[0];
  if (!latest) return { runId: null, probes: [], reportedAt: null, available, canRequest: available.length > 0, nextAllowedAt: null };
  const run = rows.filter((p) => p.runId === latest.runId).reverse();
  const open = run.some(isOpen);
  const nextAllowedAt = new Date(latest.consentAt.getTime() + RUN_COOLDOWN_MS);
  return {
    runId: latest.runId,
    probes: run.map(toView),
    reportedAt: run.every((p) => p.reportedAt != null) ? run[0].reportedAt : null,
    available,
    canRequest: !open && available.length > 0 && nextAllowedAt.getTime() <= now.getTime(),
    nextAllowedAt: open ? null : nextAllowedAt,
  };
}

export interface AdminProbeRow extends ProbeView {
  diagnosisId: string;
  runId: string;
  businessName: string;
  businessPhone: string | null;
  businessWebsite: string | null;
  target: string | null;
  senderName: string | null;
  messageBody: string | null;
  replyExcerpt: string | null;
  createdAt: Date;
}

/** הרשימה למסך הניהול: הפניות האחרונות, עם העסק - הערוצים המסייעים מטופלים משם */
export async function listMysteryProbes(prisma: PrismaClient, limit = 100): Promise<AdminProbeRow[]> {
  const rows = (await prisma.mysteryProbe.findMany({
    orderBy: { createdAt: "desc" }, take: limit,
    include: { diagnosis: { include: { business: { select: { name: true, phone: true, website: true } } } } },
  })) as (ProbeRow & { diagnosis: { business: { name: string; phone: string | null; website: string | null } } })[];
  return rows.map((p) => ({
    ...toView(p),
    diagnosisId: p.diagnosisId, runId: p.runId,
    businessName: p.diagnosis.business.name, businessPhone: p.diagnosis.business.phone, businessWebsite: p.diagnosis.business.website,
    target: p.target, senderName: p.senderName, messageBody: p.messageBody, replyExcerpt: p.replyExcerpt, createdAt: p.createdAt,
  }));
}
