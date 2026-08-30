import type { PrismaClient } from "@prisma/client";
import type { Confidence, Phase } from "../pipeline/roadmap/opportunity-score";
import type { BusinessModel } from "../pipeline/model/business-model";
import { buildBrief, type BriefBusiness } from "../pipeline/roadmap/brief";
import type { RoadmapItemView } from "./roadmap-repo";
import { toModelView } from "./diagnosis-read";
import { InterviewError } from "../pipeline/interview/contract";
import { defaultFetch, type FetchLike } from "../pipeline/http";
import { consoleMailTransport, makeResendTransport } from "./mail";

// אורקסטרטור ה-Brief (אבן דרך 4, משימה 7): מקביל ל-run-roadmap.ts אבל בהיקף מצומצם בהרבה -
// אין LLM ואין ניקוד, רק טעינה + תבנית טהורה (brief.ts) + שמירה אטומית + ניסיון שליחה מוגן.
// כשל בשליחה אף פעם לא מפיל את הבקשה - ה-Brief כבר נשמר, אפשר לנסות לשלוח שוב כשיהיה ספק אמיתי.

export interface BriefTransport {
  send(to: string, subject: string, body: string): Promise<void>;
}

// כתובת היעד: BRIEF_EMAIL מה-env, עם נפילה לברירת המחדל הקבועה. תומך ברשימת נמענים מופרדת
// בפסיקים - הפיצול קורה בתובלת ה-Resend (console מדפיס את המחרוזת כמו שהיא). לעולם לא נדפס
// ל-log ערך .env גולמי כאן - זה בדיוק המשתנה שנועד להישלח הלאה, לא סוד
const BRIEF_EMAIL = process.env.BRIEF_EMAIL ?? "lahavk@raion.co.il";

// כתובת השולח: ברירת המחדל היא כתובת ה-sandbox הציבורית של Resend (לא סוד) - עובדת בלי
// אימות דומיין. שליחה מדומיין אמיתי (BRIEF_FROM_EMAIL) דורשת אימות דומיין בדשבורד של Resend
const BRIEF_FROM_DEFAULT = "onboarding@resend.dev";

// ברירת מחדל לפיתוח (בלי RESEND_API_KEY): כתיבה ללוג השרת בלבד - ה-Brief עצמו כבר נשמר
// ב-DB, אז שום ליד לא הולך לאיבוד גם בלי מפתח
export const consoleBriefTransport: BriefTransport = {
  async send(to, subject, body) {
    await consoleMailTransport.send({ to, subject: `בקשת הטמעה חדשה: ${subject}`, body });
  },
};

// תובלת Resend אמיתית דרך REST ישיר (בלי SDK - קריאת fetch יחידה, אפס תלויות חדשות).
// fetchImpl מוזרק כדי שהבדיקות יישארו אופליין, אותה תבנית כמו pagespeed.ts/places.ts.
// כשל HTTP נזרק כשגיאה - sendBrief כבר עוטף את השליחה ב-try/catch ולא מפיל את הבקשה
// המימוש עצמו עבר ל-mail.ts (30.8) כשהלקוח הסמוי נזקק לאותה שליחה - כאן נשארת העטיפה
// בחתימה הישנה, כדי שה-Brief וכל הבדיקות שלו לא יזוזו
export function makeResendBriefTransport(apiKey: string, from: string, fetchImpl: FetchLike = defaultFetch): BriefTransport {
  const transport = makeResendTransport(apiKey, from, fetchImpl);
  return {
    async send(to, subject, body) {
      await transport.send({ to, subject, body });
    },
  };
}

// בחירת התובלה לפי הסביבה: RESEND_API_KEY מוגדר => שליחה אמיתית דרך Resend, אחרת נפילה
// ל-console (פיתוח מקומי בלי מפתח). env ו-fetch מוזרקים לבדיקות - route.ts קורא בלי ארגומנטים.
// הטיפוס רחב מ-ProcessEnv בכוונה: הבדיקות מזריקות אובייקט חלקי בלי NODE_ENV
export function chooseBriefTransport(env: Record<string, string | undefined> = process.env, fetchImpl: FetchLike = defaultFetch): BriefTransport {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return consoleBriefTransport;
  const from = env.BRIEF_FROM_EMAIL?.trim() || BRIEF_FROM_DEFAULT;
  return makeResendBriefTransport(apiKey, from, fetchImpl);
}

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
              // owner = בעל האבחון (Business.owner בסכמה) - המייל שלו נכנס לגוף ה-Brief כדי
              // שאיש המקצוע יידע למי לחזור. בכוונה לא המשתמש הפועל: בהתחזות אדמין הפועל הוא
              // האדמין, והליד שייך לבעלים
              business: {
                select: {
                  name: true, city: true, phone: true, website: true,
                  owner: { select: { email: true } },
                },
              },
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
    ...(businessRow.owner?.email ? { ownerEmail: businessRow.owner.email } : {}),
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
