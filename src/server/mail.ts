import { defaultFetch, readErrorBody, type FetchLike } from "../pipeline/http";

// תובלת המייל של המערכת (30.8): נולדה מתוך run-brief.ts כשהלקוח הסמוי (משימה 10) נזקק לאותה
// שליחה בדיוק - עם שולח משתנה (כתובת הבדיקה) ו-Reply-To. ה-Brief ממשיך לעבוד דרך העטיפות
// שלו (run-brief.ts), רק המימוש זז לכאן. ספק אחד (Resend), REST ישיר, אפס SDK.

export interface MailMessage {
  to: string;           // רשימה מופרדת בפסיקים נתמכת - הפיצול קורה כאן
  subject: string;
  body: string;         // טקסט פשוט
  from?: string;        // חסר = ברירת המחדל של התובלה
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

// כתובת ה-sandbox הציבורית של Resend (לא סוד) - עובדת בלי אימות דומיין
export const MAIL_FROM_DEFAULT = "onboarding@resend.dev";

// ברירת מחדל לפיתוח (בלי RESEND_API_KEY): כתיבה ללוג השרת בלבד
export const consoleMailTransport: MailTransport = {
  async send(msg) {
    console.log(`[BedekEsek mail] אל: ${msg.to}\nמאת: ${msg.from ?? MAIL_FROM_DEFAULT}\nנושא: ${msg.subject}\n\n${msg.body}`);
  },
};

// תובלת Resend אמיתית. fetchImpl מוזרק כדי שהבדיקות יישארו אופליין (אותה תבנית כמו pagespeed.ts).
// כשל HTTP נזרק כשגיאה - הקוראים מחליטים אם הוא קריטי
export function makeResendTransport(apiKey: string, defaultFrom: string, fetchImpl: FetchLike = defaultFetch): MailTransport {
  return {
    async send(msg) {
      const recipients = msg.to.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: msg.from ?? defaultFrom,
          to: recipients,
          subject: msg.subject,
          text: msg.body,
          ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
          ...(msg.headers ? { headers: msg.headers } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Resend החזיר ${res.status}: ${await readErrorBody(res)}`);
    },
  };
}

// מייל שהתקבל דרך Resend Receiving (הלקוח הסמוי, משימה 10). ה-webhook של email.received נושא
// מטא-דאטה בלבד; הגוף נמשך כאן. נתיב ה-API לפי תיעוד Resend (נובמבר 2025):
// GET /emails/receiving/{id} - לאמת מול החשבון בחיבור הראשון
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  createdAt: string | null;
  raw: unknown; // הגוף המלא כפי שחזר - נשמר ב-payload (כלל שימור מלא)
}

export async function fetchReceivedEmail(apiKey: string, id: string, fetchImpl: FetchLike = defaultFetch): Promise<ReceivedEmail> {
  const res = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Resend Receiving החזיר ${res.status}: ${await readErrorBody(res)}`);
  const body = (await res.json()) as Record<string, unknown>;
  const toRaw = body.to;
  const to = Array.isArray(toRaw) ? toRaw.filter((s): s is string => typeof s === "string") : typeof toRaw === "string" ? [toRaw] : [];
  const text = typeof body.text === "string" ? body.text : typeof body.html === "string" ? stripHtml(body.html) : "";
  return {
    id: typeof body.id === "string" ? body.id : id,
    from: typeof body.from === "string" ? body.from : "",
    to,
    subject: typeof body.subject === "string" ? body.subject : "",
    text,
    createdAt: typeof body.created_at === "string" ? body.created_at : null,
    raw: body,
  };
}

// טקסט מתוך HTML כשאין חלק text - רק לציטוט קצר, לא לפרסור אמיתי
export function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// בחירת התובלה לפי הסביבה: RESEND_API_KEY מוגדר => Resend, אחרת console. env ו-fetch מוזרקים
// לבדיקות. הטיפוס רחב מ-ProcessEnv בכוונה: הבדיקות מזריקות אובייקט חלקי
export function chooseMailTransport(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = defaultFetch,
  fromKey = "BRIEF_FROM_EMAIL",
): MailTransport {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return consoleMailTransport;
  const from = env[fromKey]?.trim() || MAIL_FROM_DEFAULT;
  return makeResendTransport(apiKey, from, fetchImpl);
}
