// הצד הכותב של ארכיון הקריאות החיצוניות (external_calls) - משלים את התפר הטהור
// src/pipeline/observe.ts: ה-pipeline מדווח בלי לדעת על DB, וכאן הדיווח מקבל את הקשר הבקשה
// (מי המשתמש, איזה אבחון) ונכתב לטבלה. אותו משטר כמו usage-events: כתיבה לעולם לא זורקת
// ולעולם לא מעכבת את הבקשה (fire and forget).
import { AsyncLocalStorage } from "node:async_hooks";
import { setExternalCallSink, type ExternalCallRecord } from "../pipeline/observe";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExternalCallDb = { externalCall: { create: (args: { data: any }) => Promise<unknown> } };

// חיבור ה-sink - נקרא פעם אחת מ-db.ts עם ה-prisma של התהליך. exported גם לבדיקות (עם fake)
export function installExternalCallSink(db: ExternalCallDb): void {
  setExternalCallSink((record: ExternalCallRecord) => {
    const ctx = contextStore.getStore() ?? {};
    void db.externalCall
      .create({
        data: {
          service: record.service,
          context: record.context,
          diagnosisId: ctx.diagnosisId ?? null,
          userId: ctx.userId ?? null,
          ok: record.ok,
          durationMs: Math.max(0, Math.round(record.durationMs)),
          inputTokens: record.inputTokens ?? null,
          outputTokens: record.outputTokens ?? null,
          payload: (record.payload ?? null) as object | null,
        },
      })
      .catch((err: unknown) => {
        console.error("ארכיון קריאות חיצוניות: כתיבה נכשלה (לא קריטי):", err instanceof Error ? err.message : err);
      });
  });
}
