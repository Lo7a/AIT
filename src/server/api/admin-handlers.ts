// ראוט ההתחזות כפונקציה מוזרקת (אותו דפוס כמו auth-handlers): טופס מהעמוד האדמיני -
// action=start עם userId, או action=stop. הכול נבדק אופליין עם closures מזויפים.
import type { SessionUser } from "../auth/session";
import { isAdmin } from "../auth/guard";
import { IMPERSONATE_COOKIE } from "../auth/impersonation";
import type { UsageEventInput } from "../usage-events";

export interface ImpersonateDeps {
  getRealUser: () => Promise<SessionUser | null>;
  findUserById: (id: string) => Promise<SessionUser | null>;
  emit: (input: UsageEventInput) => Promise<void>;
}

// cookie session (בלי Max-Age): ההתחזות מתה עם סגירת הדפדפן - אדמין לא נשאר "תקוע" בתור
// משתמש אחר אחרי הפסקה. הנתיב הביתה ב-303 (טופס -> GET)
function redirectWithCookie(req: Request, cookieValue: string | null): Response {
  const res = new Response(null, {
    status: 303,
    headers: { location: new URL("/", req.url).toString() },
  });
  res.headers.append(
    "set-cookie",
    cookieValue != null
      ? `${IMPERSONATE_COOKIE}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax`
      : `${IMPERSONATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return res;
}

// ה-target הנוכחי מה-cookie של הבקשה (לרישום אירוע העצירה) - פרסור ידני מינימלי
function impersonatedIdOf(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${IMPERSONATE_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export function makeImpersonateHandler(deps: ImpersonateDeps) {
  return async function handle(req: Request): Promise<Response> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
    }
    const action = form.get("action");

    const real = await deps.getRealUser();
    if (real == null) return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
    // לא-אדמין מקבל בדיוק את מה שעמוד לא קיים היה מחזיר - אין מה להסגיר (כמו /admin עצמו)
    if (!isAdmin(real)) return Response.json({ error: "לא נמצא" }, { status: 404 });

    if (action === "stop") {
      const currentTarget = impersonatedIdOf(req);
      if (currentTarget != null) {
        await deps.emit({
          type: "impersonation_stopped", userId: currentTarget, actorUserId: real.id,
        }).catch(() => undefined);
      }
      return redirectWithCookie(req, null);
    }

    if (action !== "start") return Response.json({ error: "פעולה לא מוכרת" }, { status: 400 });
    const userId = form.get("userId");
    if (typeof userId !== "string" || userId.length === 0) {
      return Response.json({ error: "חסר מזהה משתמש" }, { status: 400 });
    }
    if (userId === real.id) return Response.json({ error: "אי אפשר להתחזות לעצמך" }, { status: 400 });
    const target = await deps.findUserById(userId);
    if (target == null) return Response.json({ error: "לא נמצא" }, { status: 404 });

    await deps.emit({
      type: "impersonation_started", userId: target.id, actorUserId: real.id,
    }).catch(() => undefined);
    return redirectWithCookie(req, target.id);
  };
}
