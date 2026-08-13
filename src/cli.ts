import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./pipeline/scan";
import { slugify } from "./pipeline/slug";
import { pickCandidate, parseArgs } from "./cli-shared";

async function main() {
  const cliStart = Date.now();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.log(`❌ ${parsed.error}`);
    process.exit(1);
  }
  if (parsed.url) {
    console.log("--url נתמך רק ב-diagnose: npm run diagnose -- --url https://…");
    process.exit(1);
  }
  const { query, pick } = parsed;
  if (!query) {
    console.log('שימוש: npm run scan -- "שם העסק והעיר" [--pick N]');
    process.exit(1);
  }

  console.log(`🔎 מחפש: "${query}"...`);
  const picked = await pickCandidate(query, pick);
  if (!picked.chosen) {
    console.log(picked.printed);
    if (picked.ambiguous) { process.exitCode = 0; return; }
    process.exit(1);
  }
  const chosen = picked.chosen;

  console.log(`🏢 סורק את: ${chosen.name} — ${chosen.address}`);
  // priorPlacesCalls: 1 — קריאת החיפוש שכבר בוצעה נספרת בעלות
  const findings = await runScan(chosen.placeId, undefined, { priorPlacesCalls: 1 });

  mkdirSync("output", { recursive: true });
  const file = join("output", `${slugify(chosen.name)}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(findings, null, 2), "utf8");

  console.log("\n✅ הסריקה הושלמה");
  console.log(`   קובץ: ${file}`);
  console.log(`   משך: ${((Date.now() - cliStart) / 1000).toFixed(1)} שניות (מתוכן סריקה: ${(findings.meta.durationMs / 1000).toFixed(1)})`);
  console.log(`   חלקים חסרים: ${findings.partial.length > 0 ? findings.partial.join(", ") : "אין — סריקה מלאה"}`);
  if (findings.partialDetails) {
    for (const [flag, reason] of Object.entries(findings.partialDetails)) {
      console.log(`     · ${flag}: ${reason}`);
    }
  }
  if (findings.reviewInsights) {
    console.log(
      `   תובנות מ-${findings.reviewInsights.totalAnalyzed} ביקורות שנותחו: ` +
      `${findings.reviewInsights.problemThemes.length} בעיות, ` +
      `${findings.reviewInsights.positiveThemes.length} חוזקות`,
    );
  }
  console.log(
    `   טוקנים: ${findings.meta.llmInputTokens} in / ${findings.meta.llmOutputTokens} out` +
    ` · עלות Places משוערת: $${findings.meta.estCostUsd.toFixed(3)} (${findings.meta.placesCalls} קריאות)`,
  );
}

main().catch((err) => {
  console.error("❌ שגיאה:", err instanceof Error ? err.message : err);
  process.exit(1);
});
