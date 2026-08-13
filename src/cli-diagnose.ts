import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./pipeline/scan";
import { scanWebsiteOnly, normalizeSiteUrl } from "./pipeline/scan-website";
import { scoreFindings } from "./pipeline/score/engine";
import { DIMENSIONS } from "./pipeline/score/dimensions";
import { deriveBusinessModel, recommendNextStep } from "./pipeline/model/business-model";
import { generateNarrative } from "./pipeline/report/narrative";
import { formatDiagnosisSummary } from "./pipeline/report/presenter";
import type { BusinessCandidate, ScanFindings } from "./pipeline/types";
import { slugify } from "./pipeline/slug";
import { pickCandidate, parseArgs } from "./cli-shared";
import { prisma } from "./server/db";
import {
  createDiagnosisForBusiness, transitionDiagnosis, saveScanResult, toScanRow,
} from "./server/diagnosis-repo";
import { websiteKeyOf } from "./server/website-key";

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

  // שלב 2: יצירת עסק+אבחון ב-DB (סטטוס created)
  // websiteKey (משימה 2ב-3) מאחד כתיבים שונים של אותו אתר לאותה שורת Business דרך upsert אטומי.
  // website נשמר כ-origin (host בלבד) — לא href — כדי שהעמודה לא תשתנה בין path/query שונים באותו דומיין;
  // הסריקה עצמה (למטה) עדיין משתמשת ב-siteUrl.href המלא.
  const created = await createDiagnosisForBusiness(prisma, siteUrl
    ? { name: websiteKeyOf(siteUrl.href), placeId: "", website: siteUrl.origin }
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
    try {
      await transitionDiagnosis(prisma, created.diagnosisId, "created");
    } catch (revertErr) {
      // אם גם ההחזרה ל-created נכשלה (למשל race על הסטטוס) — לא בולעים את זה בשקט, אבל השגיאה
      // שממשיכה להיזרק היא שגיאת הסריקה המקורית (err), לא שגיאת ה-revert — היא הסיבה שהמשתמש צריך לראות
      console.error("⚠️ נכשל גם ניסיון החזרת הסטטוס ל-created:", revertErr instanceof Error ? revertErr.message : revertErr);
    }
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
  await saveScanResult(prisma, created.diagnosisId, toScanRow(scan, score, narrative), model);
  await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");

  // שלב 5.5: השלמת שורת ה-Business עם האתר שהתגלה — כתיבה קוסמטית אחרי שהאבחון כבר נשמר;
  // כשל כאן לא מפיל אבחון ששולם. רק במסלול Places (ב---url האתר נשמר כבר ביצירה).
  // city לא מתעדכן — ל-ScanFindings אין כתובת היום (ראו הערת as-built בתוכנית).
  if (!siteUrl && scan.business.website) {
    try {
      await prisma.business.update({
        where: { id: created.businessId },
        data: { website: scan.business.website },
      });
    } catch (err) {
      console.error("⚠️ עדכון האתר בשורת העסק נכשל (לא קריטי):", err instanceof Error ? err.message : err);
    }
  }

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
