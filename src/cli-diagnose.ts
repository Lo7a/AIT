import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./pipeline/scan";
import { scanWebsiteOnly, normalizeSiteUrl } from "./pipeline/scan-website";
import { scoreFindings } from "./pipeline/score/engine";
import { DIMENSIONS } from "./pipeline/score/dimensions";
import {
  deriveBusinessModel, recommendNextStep, type BusinessModel, type NextStepRecommendation,
} from "./pipeline/model/business-model";
import { generateNarrative } from "./pipeline/report/narrative";
import type { ScoreReport } from "./pipeline/score/types";
import type { BusinessCandidate, ScanFindings } from "./pipeline/types";
import { slugify } from "./pipeline/slug";
import { pickCandidate } from "./cli-shared";
import { prisma } from "./server/db";
import {
  createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow,
} from "./server/diagnosis-repo";

const DATA_TAG: Record<string, string> = { partial: " (מידע חלקי)", none: " (אין מידע)" };

export function formatDiagnosisSummary(
  score: ScoreReport,
  model: BusinessModel,
  nextStep: NextStepRecommendation,
): string {
  const lines: string[] = [];
  lines.push(score.overall == null ? "ציון כולל: אין מספיק מידע" : `ציון כולל: ${score.overall}/100`);
  for (const d of score.dimensions) {
    const tag = DATA_TAG[d.dataStatus] ?? "";
    lines.push(`  ${d.label}: ${d.score ?? "—"}${tag}`);
  }
  if (score.topGaps.length > 0) {
    lines.push("פערים מובילים:");
    for (const g of score.topGaps) lines.push(`  ✗ ${g.text}`);
  } else {
    // עסק בריא בלי פערים מובילים — שורה חיובית במקום סקציה ריקה (סקירת משימה 6: topGaps יכול להיות [])
    lines.push("לא נמצאו פערים מהותיים בסריקה — בסיס דיגיטלי חזק.");
  }
  if (score.topStrengths.length > 0) {
    lines.push("מה עובד טוב:");
    for (const s of score.topStrengths) lines.push(`  ✓ ${s.text}`);
  }
  lines.push(`שלמות האבחון: ${model.completenessPct}% · הצעד הבא: ${nextStep.reason}`);
  return lines.join("\n");
}

function parseArgs(argv: string[]): { query: string; pick?: number; url?: string } {
  const args = [...argv];
  let pick: number | undefined;
  let url: string | undefined;
  for (let i = args.length - 1; i >= 0; i--) {
    const eq = args[i].match(/^--pick=(\d+)$/);
    if (eq) { pick = Number(eq[1]); args.splice(i, 1); continue; }
    if (args[i] === "--pick" && args[i + 1]) { pick = Number(args[i + 1]); args.splice(i, 2); continue; }
    const urlEq = args[i].match(/^--url=(.+)$/);
    if (urlEq) { url = urlEq[1]; args.splice(i, 1); continue; }
    if (args[i] === "--url" && args[i + 1]) { url = args[i + 1]; args.splice(i, 2); continue; }
  }
  return { query: args.join(" ").trim(), pick, url };
}

async function main() {
  const { query, pick, url } = parseArgs(process.argv.slice(2));
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
  }

  let candidate: BusinessCandidate | undefined;
  if (!url) {
    const picked = await pickCandidate(query, pick);
    if (!picked.chosen) { console.log(picked.printed); process.exit(1); }
    console.log(`🏢 מאבחן את: ${picked.chosen.name} — ${picked.chosen.address}`);
    candidate = picked.chosen;
  }

  // שלב 2: יצירת עסק+אבחון ב-DB (סטטוס created)
  // normalizeSiteUrl (לא בנייה ידנית) — מנרמל סכמה, רישיות וסלאש כך שאותו אתר בכתיבים שונים יתמפה לאותה שורת Business.
  // הערה: וריאנט עם/בלי www נשאר שתי כתובות שונות (מקובל ל-MVP פנימי); אם יפריע — להסיר www במפתח החיפוש במשימה 11.
  const created = await createDiagnosisForBusiness(prisma, siteUrl
    ? { name: siteUrl.hostname.replace(/^www\./, ""), placeId: "", website: siteUrl.href }
    : { name: candidate!.name, placeId: candidate!.placeId, city: undefined });
  console.log(`📋 אבחון ${created.diagnosisId} נוצר`);

  // שלב 3: סריקה תחת סטטוס scanning; כישלון מחזיר ל-created
  await transitionDiagnosis(prisma, created.diagnosisId, "scanning");
  let scan: ScanFindings;
  try {
    scan = siteUrl
      ? await scanWebsiteOnly(siteUrl.href)
      : await runScan(candidate!.placeId, undefined, { priorPlacesCalls: 1 });
  } catch (err) {
    await transitionDiagnosis(prisma, created.diagnosisId, "created");
    throw err;
  }

  // מסלול --url: כישלון כפול (גם crawl וגם PageSpeed) = אין שום ממצא לאבחן עליו —
  // חזרה ל-created בלי לשמור שורת scan ובלי להתקדם ל-report_ready
  if (siteUrl && scan.partial.includes("crawl_failed") && scan.partial.includes("pagespeed_failed")) {
    await transitionDiagnosis(prisma, created.diagnosisId, "created");
    console.log("❌ שני המקורות נכשלו — אין ממצאים לאבחון");
    process.exit(1);
  }

  await transitionDiagnosis(prisma, created.diagnosisId, "scanned");

  // שלב 4: ציונים, מודל עסק, נרטיב (נרטיב שנכשל לא מפיל אבחון — יש fallback בפנים)
  const score = scoreFindings(DIMENSIONS, scan);
  const model = deriveBusinessModel(scan);
  const nextStep = recommendNextStep(model);
  const narrative = await generateNarrative(scan, score);

  // שלב 5: שמירה ומעבר ל-report_ready
  await saveScanResult(prisma, created.diagnosisId, toScanRow(scan, score, narrative.narrative), model);
  await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");

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

// מריצים רק כשהקובץ הוא נקודת הכניסה — לא כשמייבאים את formatDiagnosisSummary במבחנים
if (process.argv[1]?.endsWith("cli-diagnose.ts")) {
  main()
    .catch((err) => { console.error("❌ האבחון נכשל:", err instanceof Error ? err.message : err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
