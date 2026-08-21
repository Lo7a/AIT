import { PrismaClient } from "@prisma/client";
import {
  CHAT_TIME_FMT as FMT, authorLabel as label, requireAgentName,
  listBoard, readInbox, sendMessage, setStatus,
} from "../src/server/agent-chat";

// ערוץ הסוכנים משורת הפקודה - הכלי שכל קלוד מריץ לפי הפרוטוקול ב-CLAUDE.md:
//   npm run chat:read              מה חדש בשבילי + הלוח (מסמן כנקרא)
//   npm run chat:send -- "הודעה" [thread]
//   npm run chat:update -- "על מה אני עובד" "קבצים/אזורים" [--commit c] [--blocked b]
//   npm run chat:board             הלוח בלבד, בלי לסמן כלום (גם למייסד שמציץ)
//
// הזהות מגיעה מ-AIT_AGENT_NAME ב-.env המקומי ולא מהקוד - הריפו ציבורי.

function printBoard(statuses: { agent: string; task: string; areas: string; commit: string | null; blockedOn: string | null; updatedAt: Date }[]) {
  console.log("--- לוח המצב ---");
  if (statuses.length === 0) console.log("(עוד אף סוכן לא עדכן מצב)");
  for (const s of statuses) {
    console.log(`${label(s.agent)} (${FMT.format(s.updatedAt)}):`);
    console.log(`  עובד על: ${s.task}`);
    console.log(`  נוגע ב: ${s.areas}`);
    if (s.commit) console.log(`  קומיט אחרון: ${s.commit}`);
    if (s.blockedOn) console.log(`  חסום על: ${s.blockedOn}`);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    switch (cmd) {
      case "read": {
        const agent = requireAgentName();
        const unread = await readInbox(prisma, agent);
        const { statuses } = await listBoard(prisma);
        printBoard(statuses);
        console.log(`--- חדש בשבילי (${unread.length}) ---`);
        for (const m of unread) console.log(`[${FMT.format(m.createdAt)}] ${label(m.author)} (${m.thread}): ${m.body}`);
        if (unread.length === 0) console.log("(אין הודעות חדשות)");
        break;
      }
      case "send": {
        const agent = requireAgentName();
        const [body, thread] = args;
        if (!body) { console.error('שימוש: npm run chat:send -- "הודעה" [thread]'); process.exit(1); }
        await sendMessage(prisma, agent, body, thread);
        console.log("נשלח.");
        break;
      }
      case "update": {
        const agent = requireAgentName();
        const positional = args.filter((a) => !a.startsWith("--"));
        const flag = (name: string) => {
          const i = args.indexOf(`--${name}`);
          return i >= 0 ? args[i + 1] : undefined;
        };
        const [task, areas] = positional;
        if (!task || !areas) {
          console.error('שימוש: npm run chat:update -- "על מה אני עובד" "קבצים/אזורים" [--commit c] [--blocked b]');
          process.exit(1);
        }
        await setStatus(prisma, agent, { task, areas, commit: flag("commit"), blockedOn: flag("blocked") });
        console.log("הלוח עודכן.");
        break;
      }
      case "board": {
        const { statuses, messages } = await listBoard(prisma);
        printBoard(statuses);
        console.log(`--- ההודעות האחרונות (${messages.length}) ---`);
        for (const m of [...messages].reverse()) {
          console.log(`[${FMT.format(m.createdAt)}] ${label(m.author)} (${m.thread}): ${m.body}`);
        }
        break;
      }
      default:
        console.error("פקודות: read | send | update | board");
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
