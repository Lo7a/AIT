import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { searchBusiness } from "./pipeline/google/places";
import { runScan } from "./pipeline/scan";
import { slugify } from "./pipeline/slug";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let pick: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pick") pick = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  return { query: positional.join(" ").trim(), pick };
}

async function main() {
  const { query, pick } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.log('שימוש: npm run scan -- "שם העסק והעיר" [--pick N]');
    process.exit(1);
  }

  console.log(`🔎 מחפש: "${query}"...`);
  const candidates = await searchBusiness(query);
  if (candidates.length === 0) {
    console.log("לא נמצא עסק מתאים. נסו לנסח אחרת או להוסיף עיר.");
    process.exit(1);
  }
  if (candidates.length > 1 && pick === undefined) {
    console.log("נמצאו כמה מועמדים — הריצו שוב עם ‎--pick <מספר>:");
    candidates.slice(0, 5).forEach((c, i) => {
      const stats = c.rating != null ? ` (⭐ ${c.rating}, ${c.reviewCount ?? 0} ביקורות)` : "";
      console.log(`  ${i + 1}. ${c.name} — ${c.address}${stats}`);
    });
    process.exit(0);
  }

  const chosen = candidates[(pick ?? 1) - 1];
  if (!chosen) {
    console.log(`--pick ${pick} מחוץ לטווח (נמצאו ${candidates.length} מועמדים).`);
    process.exit(1);
  }

  console.log(`🏢 סורק את: ${chosen.name} — ${chosen.address}`);
  // priorPlacesCalls: 1 — קריאת החיפוש שכבר בוצעה נספרת בעלות
  const findings = await runScan(chosen.placeId, undefined, { priorPlacesCalls: 1 });

  mkdirSync("output", { recursive: true });
  const file = join("output", `${slugify(chosen.name)}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(findings, null, 2), "utf8");

  console.log("\n✅ הסריקה הושלמה");
  console.log(`   קובץ: ${file}`);
  console.log(`   משך: ${(findings.meta.durationMs / 1000).toFixed(1)} שניות`);
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
