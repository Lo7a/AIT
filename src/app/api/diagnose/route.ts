import { prisma } from "../../../server/db";
import { runDiagnosis } from "../../../server/run-diagnosis";
import { makeDiagnoseHandler } from "../../../server/api/diagnose-stream";

// סריקה מלאה יכולה לקחת עד ~90 שניות (תקציב PSI) — רלוונטי ל-Vercel בעתיד, לא מקומית
export const maxDuration = 300;

export const POST = makeDiagnoseHandler((target, onEvent) => runDiagnosis(prisma, target, { onEvent }));
