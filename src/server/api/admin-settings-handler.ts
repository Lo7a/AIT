// עריכת מגבלות הקצב מהניהול (הכרעת מייסד 17.8): טופס מעמוד האדמין, אדמין אמיתי בלבד -
// אותו שער בדיוק כמו ההתחזות (makeImpersonateHandler): לא-אדמין מקבל "לא נמצא" (404),
// והזהות נבדקת על המשתמש האמיתי (getRealUser) כך שגם אדמין באמצע התחזות נרשם בשמו.
// כל שינוי בפועל נרשם ביומן (settings_changed) עם הערך הישן והחדש.
import type { SessionUser } from "../auth/session";
import { isAdmin } from "../auth/guard";
import { GLOBAL_RULES, RATE_RULES } from "../rate-limit";
import type { UsageEventInput } from "../usage-events";

// הרשימה הסגורה של מפתחות שמותר לערוך מהטופס - נגזרת מהחוקים עצמם (מקור אמת יחיד).
// מפתח שלא כאן נדחה - הטופס לא יכול לכתוב הגדרות שרירותיות לטבלה
export const EDITABLE_SETTINGS: { settingKey: string; defaultLimit: number }[] = [
  ...Object.values(RATE_RULES).map((r) => ({ settingKey: r.settingKey, defaultLimit: r.limit })),
  ...Object.values(GLOBAL_RULES).map((r) => ({ settingKey: r.settingKey, defaultLimit: r.limit })),
];

export interface SettingsDeps {
  getRealUser: () => Promise<SessionUser | null>;
  readSetting: (key: string) => Promise<string | null>;
  writeSetting: (key: string, value: string) => Promise<void>;
  clearSetting: (key: string) => Promise<void>;
  emit: (input: UsageEventInput) => Promise<void>;
}

export function makeSettingsHandler(deps: SettingsDeps) {
  return async function handle(req: Request): Promise<Response> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
    }

    const real = await deps.getRealUser();
    if (real == null) return Response.json({ error: "נדרשת התחברות" }, { status: 401 });
    if (!isAdmin(real)) return Response.json({ error: "לא נמצא" }, { status: 404 });

    // ולידציה של כל השדות לפני כתיבה כלשהי - טופס עם ערך פסול אחד לא משנה כלום (הכול או כלום)
    const changes: { key: string; raw: string | null }[] = [];
    for (const { settingKey } of EDITABLE_SETTINGS) {
      const raw = form.get(settingKey);
      if (raw == null) continue; // שדה שלא נשלח - לא נוגעים בו
      if (typeof raw !== "string") return Response.json({ error: "ערך לא תקין" }, { status: 400 });
      const trimmed = raw.trim();
      if (trimmed === "") {
        changes.push({ key: settingKey, raw: null }); // ריק = חזרה לברירת המחדל שבקוד
        continue;
      }
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        return Response.json({ error: `ערך לא תקין עבור ${settingKey}: נדרש מספר שלם 0 ומעלה` }, { status: 400 });
      }
      changes.push({ key: settingKey, raw: String(n) });
    }

    for (const change of changes) {
      const before = await deps.readSetting(change.key);
      // אין שינוי בפועל => אין כתיבה ואין אירוע יומן - הטופס נשלח תמיד עם כל השדות
      if (before === change.raw || (before == null && change.raw == null)) continue;
      if (change.raw == null) await deps.clearSetting(change.key);
      else await deps.writeSetting(change.key, change.raw);
      await deps.emit({
        type: "settings_changed", userId: real.id,
        metadata: { key: change.key, from: before, to: change.raw },
      }).catch(() => undefined);
    }

    // חזרה לעמוד הניהול (טופס -> GET)
    return new Response(null, {
      status: 303,
      headers: { location: new URL("/admin", req.url).toString() },
    });
  };
}
