// הצד הכותב של ארכיון הקריאות החיצוניות (external_calls) - משלים את התפר הטהור
// src/pipeline/observe.ts: ה-pipeline מדווח בלי לדעת על DB, וכאן הדיווח מקבל את הקשר הבקשה
// (מי המשתמש, איזה אבחון) ונכתב לטבלה. אותו משטר כמו usage-events: כתיבה לעולם לא זורקת
// ולעולם לא מעכבת את הבקשה (fire and forget).
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { setExternalCallSink, stripHeavyStrings, type ExternalCallRecord } from "../pipeline/observe";
import { uploadArtifact } from "./storage";

export interface CallContext {
  userId?: string;
  diagnosisId?: string;
}

const contextStore = new AsyncLocalStorage<CallContext>();

// עוטף קטע עבודה בהקשר: ערכים חדשים מתמזגים על ההקשר הקיים (route עוטף עם userId,
// אורקסטרטור פנימי מוסיף diagnosisId - שניהם מגיעים לאותה שורת ארכיון)
export function withCallContext<T>(ctx: CallContext, fn: () => Promise<T>): Promise<T> {
  const merged = { ...contextStore.getStore(), ...ctx };
  return contextStore.run(merged, fn);
}

// הסטת blobs לבאקט (הכרעת מייסד 17.8, "לא זורקים כלום"): מחרוזת data:image ענקית בפיילוד
// (צילומי המסך של PageSpeed) מפוענחת חזרה לתמונה אמיתית ועולה לבאקט הפרטי scan-artifacts;
// בפיילוד נשאר מצביע storage:// במקום הטקסט הענק. העלאה שנכשלה (או סביבה בלי מפתח סודי)
// נופלת לחיתוך של stripHeavyStrings - הארכיון לעולם לא נחסם על ארטיפקט.
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const OFFLOAD_MIN_CHARS = 10_000;

type Uploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<boolean>;

export async function offloadHeavyPayload(value: unknown, upload: Uploader): Promise<unknown> {
  if (typeof value === "string") {
    const m = DATA_IMAGE_RE.exec(value);
    if (m != null && value.length > OFFLOAD_MIN_CHARS) {
      const ext = m[1];
      const path = `psi/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
      try {
        const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
        if (await upload(path, bytes, `image/${ext}`)) return `storage://scan-artifacts/${path}`;
      } catch {
        // base64 פגום או כשל העלאה - נופלים לחיתוך למטה
      }
    }
    return stripHeavyStrings(value);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => offloadHeavyPayload(v, upload)));
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await offloadHeavyPayload(v, upload);
    return out;
  }
  return value;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExternalCallDb = { externalCall: { create: (args: { data: any }) => Promise<unknown> } };

// חיבור ה-sink - נקרא פעם אחת מ-db.ts עם ה-prisma של התהליך. exported גם לבדיקות (עם fake)
export function installExternalCallSink(db: ExternalCallDb, upload: Uploader = uploadArtifact): void {
  setExternalCallSink((record: ExternalCallRecord) => {
    const ctx = contextStore.getStore() ?? {};
    void (async () => {
      // הסטת blobs לפני הכתיבה - צילומי מסך הופכים למצביעי storage, שאר הפיילוד נשמר כפי שהוא
      const payload = record.payload == null ? null : await offloadHeavyPayload(record.payload, upload);
      await db.externalCall.create({
        data: {
          service: record.service,
          context: record.context,
          diagnosisId: ctx.diagnosisId ?? null,
          userId: ctx.userId ?? null,
          ok: record.ok,
          durationMs: Math.max(0, Math.round(record.durationMs)),
          inputTokens: record.inputTokens ?? null,
          outputTokens: record.outputTokens ?? null,
          payload: payload as object | null,
        },
      });
    })().catch((err: unknown) => {
      console.error("ארכיון קריאות חיצוניות: כתיבה נכשלה (לא קריטי):", err instanceof Error ? err.message : err);
    });
  });
}
