import "dotenv/config";
import * as readline from "node:readline/promises";
import { prisma } from "./server/db";
import { startInterview, runInterviewTurn, finishInterview } from "./server/run-interview";
import { MAX_GUIDED_QUESTIONS } from "./pipeline/interview/questions";

// כלי פיתוח בלבד: צ'אט ראיון בטרמינל מול המנוע האמיתי. שימוש:
//   npm run interview -- <diagnosisId>
// פקודות בתוך הצ'אט: "דלג" (שאלה הבאה בלי תשובה), "חופשי" (מעבר לכתיבה חופשית), "סיים" (סגירת הראיון)

async function main() {
  const diagnosisId = process.argv[2];
  if (!diagnosisId) {
    console.log("שימוש: npm run interview -- <diagnosisId>");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let snap = await startInterview(prisma, diagnosisId);
  console.log(`\nראיון פעיל. שלמות: ${snap.completenessPct}% | נענו ${snap.askedCount}/${snap.maxQuestions}`);
  if (snap.messages.length > 0) console.log(`(ממשיכים ראיון קיים עם ${snap.messages.length} הודעות)`);
  if (snap.recommendFreeText) console.log("(שלמות נמוכה - אפשר פשוט לספר על העסק בכתיבה חופשית)");

  let current = snap.nextQuestion;
  let freeMode = current == null;
  const skipped: string[] = [];

  while (true) {
    if (!freeMode && current && skipped.includes(current.key)) {
      // שאלה שדולגה - לא מציגים אותה שוב; אם אין אחרת, עוברים לחופשי
      current = null;
      freeMode = true;
    }
    const promptText = freeMode ? "\nספרו לי על העסק במילים שלכם (או: סיים)" : `\nשאלה: ${current!.text}`;
    console.log(promptText);
    const answer = (await rl.question("> ")).trim();
    if (answer === "סיים") break;
    if (answer === "חופשי") { freeMode = true; continue; }
    if (answer === "דלג") {
      if (current) skipped.push(current.key);
      // דילוג אינו נשמר: מבקשים snapshot טרי ומסננים את מה שדולג מקומית
      snap = await startInterview(prisma, diagnosisId);
      current = snap.nextQuestion && !skipped.includes(snap.nextQuestion.key) ? snap.nextQuestion : null;
      if (!current) { console.log("(אין עוד שאלות שלא דולגו, אפשר לכתוב חופשי או 'סיים')"); freeMode = true; }
      else freeMode = false;
      continue;
    }
    if (!answer) continue;
    const r = await runInterviewTurn(prisma, diagnosisId, {
      content: answer,
      questionKey: freeMode ? undefined : current?.key,
      isFreeText: freeMode,
    });
    console.log(`\n${r.reply}${r.usedFallback ? " (נשמר בלי חילוץ - תקלת LLM)" : ""}`);
    console.log(`שלמות: ${r.completenessPct}% | נענו ${r.askedCount}/${MAX_GUIDED_QUESTIONS}`);
    current = r.nextQuestion && !skipped.includes(r.nextQuestion.key) ? r.nextQuestion : null;
    if (!current) { freeMode = true; console.log("(השאלות המונחות מוצו, אפשר להמשיך חופשי או 'סיים')"); }
    else freeMode = false;
  }
  await finishInterview(prisma, diagnosisId);
  console.log("\nהראיון נסגר והדוח עודכן. תודה!");
  rl.close();
}

main()
  .catch((err) => { console.error("שגיאה:", err instanceof Error ? err.message : err); process.exit(1); })
  .finally(() => prisma.$disconnect());
