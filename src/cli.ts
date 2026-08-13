import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./pipeline/scan";
import { slugify } from "./pipeline/slug";
import { pickCandidate } from "./cli-shared";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let pick: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pick") pick = Number(argv[++i]);
    else if (a.startsWith("--pick=")) pick = Number(a.slice(7));
    else positional.push(a);
  }
  return { query: positional.join(" ").trim(), pick };
}

async function main() {
  const cliStart = Date.now();
  const { query, pick } = parseArgs(process.argv.slice(2));
  if (pick !== undefined && !Number.isInteger(pick)) {
    console.log("הערך של --pick חייב להיות מספר שלם");
    process.exit(1);
  }
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
