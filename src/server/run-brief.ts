import type { PrismaClient } from "@prisma/client";
import type { Confidence, Phase } from "../pipeline/roadmap/opportunity-score";
import type { BusinessModel } from "../pipeline/model/business-model";
import { buildBrief, type BriefBusiness } from "../pipeline/roadmap/brief";
import type { RoadmapItemView } from "./roadmap-repo";
import { toModelView } from "./diagnosis-read";
import { InterviewError } from "../pipeline/interview/contract";

// אורקסטרטור ה-Brief (אבן דרך 4, משימה 7): מקביל ל-run-roadmap.ts אבל בהיקף מצומצם בהרבה -
// אין LLM ואין ניקוד, רק טעינה + תבנית טהורה (brief.ts) + שמירה אטומית + ניסיון שליחה מוגן.
// כשל בשליחה אף פעם לא מפיל את הבקשה - ה-Brief כבר נשמר, אפשר לנסות לשלוח שוב כשיהיה ספק אמיתי.

export interface BriefTransport {
  send(to: string, subject: string, body: string): Promise<void>;
}

// כתובת היעד: BRIEF_EMAIL מה-env, עם נפילה לברירת המחדל הקבועה (אין עדיין ספק מייל - Resend
// הוא פריט רק-להב: פתיחת חשבון + מפתח ב-env, ראו התוכנית). לעולם לא נדפס ל-log ערך .env גולמי
// כאן - זה בדיוק המשתנה שנועד להישלח הלאה, לא סוד
const BRIEF_EMAIL = process.env.BRIEF_EMAIL ?? "lahavk@raion.co.il";

// ברירת מחדל לפיתוח: כתיבה ללוג השרת בלבד. כשיתווסף ספק מייל אמיתי - מחליפים את המימוש הזה
// בהזרקה (route.ts), בלי לגעת ב-sendBrief או בשאר הקובץ
export const consoleBriefTransport: BriefTransport = {
  async send(to, subject, body) {
    console.log(`[AIT Brief] בקשת הטמעה חדשה\nאל: ${to}\nנושא: ${subject}\n\n${body}`);
  },
};

interface LoadedBriefItem {
  itemView: RoadmapItemView;
  model: BusinessModel | null;
  business: BriefBusiness;
}

// שאילתה אחת עם include מקונן (roadmapItem -> catalog -> benchmarks, roadmapItem -> roadmap ->
// diagnosis -> business/businessModel) - כל היחסים האלה קיימים בסכמה כ-FK רגילים, אז זו שאילתה
// תקנית לגמרי, לא משהו מיוחד. select צר בכוונה, אותו עיקרון כמו getRoadmapView (roadmap-repo.ts)
async function loadItemOrThrow(prisma: PrismaClient, itemId: string): Promise<LoadedBriefItem> {
  const item = await prisma.roadmapItem.findUnique({
    where: { id: itemId },
    select: {
      id: true, catalogId: true, score: true, confidence: true, phase: true, status: true, reasoning: true,
      catalog: {
        select: {
          name: true, problem: true, solution: true, costRange: true, savingRange: true,
          complexity: true, installTime: true,
          benchmarks: { select: { id: true, metric: true, range: true, source: true, verifiedAt: true } },
        },
      },
      roadmap: {
        select: {
          diagnosis: {
            select: {
              businessModel: true,
              business: { select: { name: true, city: true, phone: true, website: true } },
            },
          },
        },
      },
    },
  });
  if (!item) throw new InterviewError("הפריט לא נמצא", "not_found");

  const itemView: RoadmapItemView = {
    id: item.id,
    catalogId: item.catalogId,
    score: item.score,
    confidence: item.confidence as Confidence,
    phase: item.phase as Phase,
    status: item.status as RoadmapItemView["status"],
    reasoning: item.reasoning,
    name: item.catalog.name,
    problem: item.catalog.problem,
    solution: item.catalog.solution,
    costRange: item.catalog.costRange,
    savingRange: item.catalog.savingRange,
    complexity: item.catalog.complexity,
    installTime: item.catalog.installTime,
    benchmarks: item.catalog.benchmarks.map((b) => ({
      id: b.id, metric: b.metric, range: b.range, source: b.source, verifiedAt: b.verifiedAt,
    })),
  };

  const businessRow = item.roadmap.diagnosis.business;
  const business: BriefBusiness = {
    name: businessRow.name,
    ...(businessRow.city ? { city: businessRow.city } : {}),
    ...(businessRow.phone ? { phone: businessRow.phone } : {}),
    ...(businessRow.website ? { website: businessRow.website } : {}),
  };

  const modelRow = item.roadmap.diagnosis.businessModel;
  const model = modelRow ? toModelView(modelRow) : null;

  return { itemView, model, business };
}

// יצירת Brief + מעבר סטטוס הפריט ל-"requested" באותה טרנזקציה - "אני רוצה להטמיע את זה"
// (האפיון). status קיים כבר "requested" מותר במפורש (הבעלים לחץ שוב) - Brief חדש נוסף, בלי
// בדיקת "כבר קיים" שהייתה מסבכת בלי תועלת מוצרית (ראו הערת as-built בתוכנית).
// סדר הפעולות (סטטוס קודם, Brief אחר כך) נבחר במכוון: כשל ביצירת ה-Brief חייב לגלגל אחורה גם
// את עדכון הסטטוס שכבר קרה - לא רק "לא להגיע" לעדכון. הפייק (tests/fakes/fake-db.ts) באמת
// משחזר את הסטטוס הקודם בנתיב הזה, לא רק נמנע מלהריץ קוד נוסף
async function createBriefAndRequestItem(prisma: PrismaClient, itemId: string, content: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.roadmapItem.update({ where: { id: itemId }, data: { status: "requested" } });
    const brief = await tx.brief.create({ data: { roadmapItemId: itemId, content, sentAt: null } });
    return brief.id;
  });
}

// { ok: true, sent } - הבקשה תמיד "מצליחה" מבחינת הלקוח כל עוד ה-Brief נשמר (ok=true), sent
// מדווח האם השליחה בפועל הצליחה. כשל שליחה לא הופך את הבקשה לכישלון - היא כבר נרשמה, אפשר
// לנסות לשלוח שוב מאוחר יותר (למשל job רקע, כשיהיה ספק אמיתי)
export async function sendBrief(
  prisma: PrismaClient,
  transport: BriefTransport,
  itemId: string,
): Promise<{ ok: true; sent: boolean }> {
  const { itemView, model, business } = await loadItemOrThrow(prisma, itemId);
  const content = buildBrief(itemView, model, business);

  const briefId = await createBriefAndRequestItem(prisma, itemId, content);

  const subject = `בקשת הטמעה - ${business.name}: ${itemView.name}`;
  let sent = false;
  try {
    await transport.send(BRIEF_EMAIL, subject, content);
    sent = true;
  } catch (err) {
    // כשל שליחה (אין עדיין ספק אמיתי, או תקלת רשת עתידית) נשאר בלוג השרת בלבד - ה-Brief כבר
    // נשמר עם sentAt=null, זה מספיק כדי לדעת שצריך לנסות שוב
    console.error("brief transport failure:", err);
  }

  if (sent) {
    await prisma.brief.update({ where: { id: briefId }, data: { sentAt: new Date() } });
  }

  return { ok: true, sent };
}
