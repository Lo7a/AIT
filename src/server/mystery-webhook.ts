import { createHmac, timingSafeEqual } from "node:crypto";

// אימות חתימת webhook של Resend (פורמט Svix): svix-id / svix-timestamp / svix-signature,
// סוד whsec_ בבסיס 64, HMAC-SHA256 על "id.timestamp.body", חלון של חמש דקות, ואפשר כמה
// חתימות מופרדות ברווח ("v1,xxx v1,yyy" בזמן החלפת סוד). טהור - נבדק אופליין

const TOLERANCE_MS = 5 * 60 * 1000;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function svixHeadersOf(headers: Headers): SvixHeaders {
  return {
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
  };
}

export function verifySvixSignature(h: SvixHeaders, rawBody: string, secret: string, now: Date = new Date()): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now.getTime() - ts * 1000) > TOLERANCE_MS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();

  for (const entry of h.signature.split(" ")) {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

// גוף אירוע email.received - רק מה שצריך כדי למשוך את המייל. כל סטייה = null (מתעלמים)
export interface ReceivedEvent {
  emailId: string;
  to: string[];
  from: string;
  createdAt: string | null;
}

export function parseReceivedEvent(rawBody: string): ReceivedEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  const obj = parsed as { type?: unknown; data?: unknown };
  if (obj.type !== "email.received" || obj.data == null || typeof obj.data !== "object") return null;
  const data = obj.data as Record<string, unknown>;
  const emailId = typeof data.email_id === "string" ? data.email_id : typeof data.id === "string" ? data.id : null;
  if (emailId == null) return null;
  const toRaw = data.to;
  const to = Array.isArray(toRaw) ? toRaw.filter((s): s is string => typeof s === "string") : typeof toRaw === "string" ? [toRaw] : [];
  return {
    emailId,
    to,
    from: typeof data.from === "string" ? data.from : "",
    createdAt: typeof data.created_at === "string" ? data.created_at : null,
  };
}
