import { timingSafeEqual } from "node:crypto";
import { InterviewError } from "../../pipeline/interview/contract";
import { svixHeadersOf, verifySvixSignature, parseReceivedEvent, type SvixHeaders } from "../mystery-webhook";
import type { ReceivedEmail } from "../mail";
import type { InboundReply, RequestResult, TickResult, AdminAction } from "../run-mystery";
import { ADMIN_ACTIONS } from "../run-mystery";

// שכבת ה-API של הלקוח הסמוי (משימה 10). אותו דפוס בדיוק כמו roadmap-handlers.ts: factories
// עם פונקציות מוזרקות, אפס prisma/רשת כאן, הכול נבדק אופליין. STATUS_BY_KIND משוכפל בכוונה
// (אי-תלות בין קבצי ה-handlers, ראו הנימוק שם)
const STATUS_BY_KIND: Record<InterviewError["kind"], number> = { not_found: 404, conflict: 409, invalid: 400 };

function errorResponse(err: unknown): Response {
  if (err instanceof InterviewError) {
    return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind] });
  }
  console.error("mystery handler failure:", err);
  return Response.json({ error: "משהו השתבש, נסו שוב בעוד רגע" }, { status: 500 });
}

// POST /api/mystery/[id] - ההסכמה. גוף הבקשה מתעלם ממנו: הפעולה תלויה רק ב-id
export function makeRequestMysteryHandler(request: (id: string) => Promise<RequestResult>) {
  return async function handle(_req: Request, id: string): Promise<Response> {
    try {
      return Response.json(await request(id));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function secretMatches(given: string | null, secret: string): boolean {
  if (given == null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/mystery/tick - התקתוק השעתי. בלי סוד בסביבה הנתיב סגור (503, לא פתוח לכולם);
// סוד שגוי = 401 בלי פירוט
export function makeTickHandler(deps: { secret: string | undefined; run: () => Promise<TickResult> }) {
  return async function handle(req: Request): Promise<Response> {
    const secret = deps.secret?.trim();
    if (!secret) return Response.json({ error: "הנתיב לא מוגדר" }, { status: 503 });
    if (!secretMatches(req.headers.get("x-tick-secret"), secret)) return Response.json({ error: "הבקשה נדחתה" }, { status: 401 });
    try {
      return Response.json(await deps.run());
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export interface InboundDeps {
  secret: string | undefined;
  fetchReceived: (emailId: string) => Promise<ReceivedEmail>;
  record: (reply: InboundReply) => Promise<{ matched: boolean }>;
  verify?: (h: SvixHeaders, rawBody: string, secret: string, now: Date) => boolean;
  now?: () => Date;
}

// POST /api/mystery/inbound - webhook של Resend (email.received). הגוף נקרא גולמי כי החתימה
// מחושבת עליו. אירוע שאינו email.received, או מייל שלא שייך לאף פנייה, מקבל 200 (אין מה
// לנסות שוב); כשל במשיכת המייל מקבל 500 כדי ש-Resend ינסה שוב
export function makeInboundHandler(deps: InboundDeps) {
  const verify = deps.verify ?? verifySvixSignature;
  const now = deps.now ?? (() => new Date());
  return async function handle(req: Request): Promise<Response> {
    const secret = deps.secret?.trim();
    if (!secret) return Response.json({ error: "הנתיב לא מוגדר" }, { status: 503 });
    const rawBody = await req.text();
    if (!verify(svixHeadersOf(req.headers), rawBody, secret, now())) {
      return Response.json({ error: "הבקשה נדחתה" }, { status: 401 });
    }
    const event = parseReceivedEvent(rawBody);
    if (event == null) return Response.json({ ignored: true });
    try {
      const mail = await deps.fetchReceived(event.emailId);
      const result = await deps.record({
        to: mail.to.length > 0 ? mail.to : event.to,
        from: mail.from || event.from,
        receivedAt: mail.createdAt ?? event.createdAt,
        text: mail.text,
        payload: mail.raw,
      });
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export type AdminMysteryResult = { kind: "ok"; probeId: string } | { kind: "error"; status: number; message: string };

export interface AdminMysteryDeps {
  isAdmin: () => Promise<boolean>;
  mark: (probeId: string, action: AdminAction) => Promise<unknown>;
}

const isAction = (v: unknown): v is AdminAction => typeof v === "string" && (ADMIN_ACTIONS as readonly string[]).includes(v);

// POST /api/admin/mystery - טופס HTML בלי JS מהמסך: probeId + action. אדמין אמיתי בלבד
export function makeAdminMysteryHandler(deps: AdminMysteryDeps) {
  return async function handle(form: FormData): Promise<AdminMysteryResult> {
    if (!(await deps.isAdmin())) return { kind: "error", status: 404, message: "לא קיים" };
    const probeId = form.get("probeId");
    const action = form.get("action");
    if (typeof probeId !== "string" || probeId.length === 0 || !isAction(action)) {
      return { kind: "error", status: 400, message: "בקשה לא תקינה" };
    }
    try {
      await deps.mark(probeId, action);
      return { kind: "ok", probeId };
    } catch (err) {
      if (err instanceof InterviewError) return { kind: "error", status: STATUS_BY_KIND[err.kind], message: err.message };
      console.error("admin mystery failure:", err);
      return { kind: "error", status: 500, message: "משהו השתבש" };
    }
  };
}
