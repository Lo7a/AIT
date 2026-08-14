import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";
import { logDiagnoseEvent } from "../../../server/api/diagnose-log";

// סריקה מלאה יכולה לקחת עד ~90 שניות (תקציב PSI) - רלוונטי ל-Vercel בעתיד, לא מקומית
export const maxDuration = 300;

// לוג מחזור חיים לטרמינל (npm run dev) לצד האירועים שממשיכים כרגיל לזרם ה-NDJSON ללקוח
export const POST = makeDiagnoseHandler((target, onEvent) => runDiagnosis(prisma, target, {
  onEvent: (e) => {
    logDiagnoseEvent(e);
    onEvent(e);
  },
}));
