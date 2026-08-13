import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeSiteUrl } from "./pipeline/scan-website";
import { formatDiagnosisSummary } from "./pipeline/report/presenter";
import type { BusinessCandidate } from "./pipeline/types";
import { slugify } from "./pipeline/slug";
import { pickCandidate, parseArgs } from "./cli-shared";
import { prisma } from "./server/db";
import { runDiagnosis, DiagnoseFailed, type DiagnoseTarget } from "./server/run-diagnosis";
import type { DiagnoseEvent } from "./server/diagnose-events";

function printEvent(e: DiagnoseEvent): void {
  switch (e.type) {
    case "created": console.log(`📋 אבחון ${e.diagnosisId} נוצר`); break;
    case "step": console.log(`⏳ ${e.label}…`); break;
    case "step_done": console.log(`   ${e.ok ? "✓" : "✗"} ${e.detail ?? ""}`); break;
    // done/error מטופלים בזרימה הראשית
    case "done": case "error": break;
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.log(`❌ ${parsed.error}`);
    process.exit(1);
  }
  const { query, pick, url } = parsed;
  if (!query && !url) {
    console.log('שימוש: npm run diagnose -- "שם עסק עיר" [--pick N] | npm run diagnose -- --url https://…');
    process.exit(1);
  }

  // שלב 1: נירמול/איתור — normalizeSiteUrl נקרא כאן, לפני כל כתיבה ל-DB, כדי שסכמה לא נתמכת או URL שגוי
  // ייכשלו מוקדם עם הודעה עברית ברורה ולא עם stack trace גולמי מהמנוע
  let siteUrl: URL | undefined;
  if (url) {
    try {
      siteUrl = normalizeSiteUrl(url);
    } catch (err) {
      console.log(`❌ כתובת האתר לא תקינה: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    console.log(`🌐 אבחון אתר-בלבד: ${siteUrl.href}`);
    // תזכורת חד-שורתית — מסלול זה מיועד לעסקים שאומתו כלא-קיימים בגוגל מפות, לא תחליף לחיפוש כשיש ספק
    console.log("   (מסלול זה מיועד לעסקים שאומתו כלא-קיימים בגוגל מפות — no_gbp)");
    // --url תמיד גובר על שם עסק/--pick שהתקבלו יחד איתו (אותה התנהגות כמו קודם) — עכשיו גם גלוי למשתמש
    if (query || pick != null) {
      console.log("   ⚠️  התקבלו גם שם עסק ו/או --pick לצד --url — הם מתעלמים; מסלול --url תמיד גובר");
    }
  }

  let candidate: BusinessCandidate | undefined;
  if (!url) {
    const picked = await pickCandidate(query, pick);
    if (!picked.chosen) {
      console.log(picked.printed);
      // מיושר עם src/cli.ts: "כמה מועמדים, אין --pick" הוא לא שגיאה (יציאה 0), רק דורש קלט נוסף
      process.exit(picked.ambiguous ? 0 : 1);
    }
    console.log(`🏢 מאבחן את: ${picked.chosen.name} — ${picked.chosen.address}`);
    candidate = picked.chosen;
  }

  // שלבים 2-5: האורקסטרציה המלאה (יצירה→סריקה→ציונים/מודל/נרטיב→שמירה→backfill) חיה ב-runDiagnosis,
  // כדי שה-CLI ומסך הסריקה החיה (2ב הבאות) יריצו בדיוק אותו קוד. printEvent הוא רק שכבת התצוגה.
  const targetInput: DiagnoseTarget = siteUrl
    ? { kind: "url", url: siteUrl.href }
    : { kind: "places", placeId: candidate!.placeId, name: candidate!.name };

  let outcome;
  try {
    outcome = await runDiagnosis(prisma, targetInput, { onEvent: printEvent });
  } catch (err) {
    if (err instanceof DiagnoseFailed) {
      console.log(`❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const { findings: scan, score, model, nextStep, narrative } = outcome;

  // שלב 6: פלט
  mkdirSync("output", { recursive: true });
  const file = join("output", `${slugify(scan.business.name)}-diagnosis-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ findings: scan, score, model, nextStep, narrative }, null, 2), "utf8");

  console.log("\n✅ האבחון הושלם ונשמר (status: report_ready)\n");
  console.log(`📣 ${narrative.narrative.headline}${narrative.usedFallback ? " (נרטיב תבנית — LLM לא אושר)" : ""}`);
  console.log(narrative.narrative.summary + "\n");
  console.log(formatDiagnosisSummary(score, model, nextStep));
  console.log(`\n   קובץ: ${file}`);
  console.log(`   משך סריקה: ${(scan.meta.durationMs / 1000).toFixed(1)} שנ' · עלות Places: $${scan.meta.estCostUsd.toFixed(3)} · טוקנים: ${scan.meta.llmInputTokens + narrative.usage.inputTokens} in / ${scan.meta.llmOutputTokens + narrative.usage.outputTokens} out`);
  if (scan.partial.length > 0) console.log(`   דגלים: ${scan.partial.join(", ")}`);
}

// מריצים רק כשהקובץ הוא נקודת הכניסה (הרצה ישירה) — לא כשמייבאים אותו
if (process.argv[1]?.endsWith("cli-diagnose.ts")) {
  main()
    .catch((err) => { console.error("❌ האבחון נכשל:", err instanceof Error ? err.message : err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
