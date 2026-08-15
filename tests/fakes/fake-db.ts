// פייק Prisma מינימלי לבדיקות אופליין של runDiagnosis/diagnosis-repo - לא ה-client האמיתי, אז השדות
// שעוברים דרכו (where/update/create/data) הם any בכוונה; הטיפוס האמיתי נבדק בקצוות (diagnosis-repo.ts
// עצמו מוקלד מול PrismaClient אמיתי) לא כאן.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeBizRow {
  id: string; name: string; placeId: string | null; websiteKey: string | null;
  website: string | null; city: string | null;
}

export interface FakeDbOptions {
  // מעברי סטטוס ("from→to") שצריכים להיכשל (updateMany מחזיר count:0) כאילו הפסידו במרוץ -
  // משמש לבדיקת "גם ה-revert נכשל" (transitionDiagnosis זורק, לא רק לא-מצליח בשקט)
  failTransitions?: Set<string>;
}

export function makeFakeDb(opts: FakeDbOptions = {}) {
  const businesses: FakeBizRow[] = [];
  const diagnoses: { id: string; businessId: string; status: string; createdAt: Date }[] = [];
  const scans: any[] = [];
  const models: any[] = [];
  const messages: any[] = [];
  // "from→to" לפי סדר - לב האסרטים על מכונת המצבים. נרשמים רק מעברים שהצליחו בפועל (count:1);
  // מעבר שנכשל (race מדומה דרך failTransitions, או סטטוס לא תואם) לא משאיר עקבות כאן
  const transitions: string[] = [];
  let nextId = 1;
  const genId = (p: string) => `${p}-${nextId++}`;
  // סדר יציב להודעות ראיון: Date.now() לבדו עלול לחזור על עצמו בין שתי יצירות רצופות באותה
  // מילישנייה - כשה-caller מעביר createdAt מפורש (כמו appendExchange האמיתי) הוא מכבד אותו;
  // מונה עולה משמש רק כברירת מחדל כשלא הועבר createdAt
  let msgSeq = 0;

  const db = {
    business: {
      upsert: async ({ where, update, create }: any) => {
        const found = businesses.find(
          (b) => (where.placeId != null && b.placeId === where.placeId)
            || (where.websiteKey != null && b.websiteKey === where.websiteKey),
        );
        if (found) { Object.assign(found, update); return { ...found }; }
        const row: FakeBizRow = {
          id: genId("biz"), placeId: null, websiteKey: null, website: null, city: null, ...create,
        };
        businesses.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const b = businesses.find((x) => x.id === where.id);
        if (!b) throw new Error("business not found");
        Object.assign(b, data);
        return { ...b };
      },
      // תמיכה מינימלית ל-diagnosis-lookup.ts: חיפוש עסק לפי placeId או websiteKey (select נבלע -
      // הפייק תמיד מחזיר את השורה המלאה, כמו upsert/update למעלה)
      findUnique: async ({ where }: any) => {
        const found = businesses.find(
          (b) => (where.placeId != null && b.placeId === where.placeId)
            || (where.websiteKey != null && b.websiteKey === where.websiteKey),
        );
        return found ? { ...found } : null;
      },
    },
    diagnosis: {
      create: async ({ data }: any) => {
        const row = { id: genId("diag"), businessId: data.businessId, status: "created", createdAt: new Date() };
        diagnoses.push(row);
        return { ...row };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const d = diagnoses.find((x) => x.id === where.id);
        if (!d) throw new Error("diagnosis not found");
        return { status: d.status };
      },
      // תמיכה מינימלית ל-interview-repo.ts: שליפת אבחון בודד לפי id (select נבלע, מחזיר שורה מלאה)
      findUnique: async ({ where }: any) => {
        const d = diagnoses.find((x) => x.id === where.id);
        return d ? { ...d } : null;
      },
      // תמיכה מינימלית ל-diagnosis-lookup.ts: האבחון האחרון של עסק, ממוין לפי createdAt
      findFirst: async ({ where, orderBy }: any) => {
        let rows = diagnoses.filter((d) => d.businessId === where.businessId);
        if (orderBy?.createdAt === "desc") {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows[0] ? { ...rows[0] } : null;
      },
      updateMany: async ({ where, data }: any) => {
        const key = `${where.status}→${data.status}`;
        if (opts.failTransitions?.has(key)) return { count: 0 };
        const d = diagnoses.find((x) => x.id === where.id && x.status === where.status);
        if (!d) return { count: 0 };
        transitions.push(key);
        d.status = data.status;
        return { count: 1 };
      },
    },
    scan: {
      create: async ({ data }: any) => {
        const row = { id: genId("scan"), ...data };
        scans.push(row);
        return { ...row };
      },
      // תמיכה מינימלית ל-interview-repo.ts: הסריקה האחרונה של אבחון, ממוין לפי createdAt
      findFirst: async ({ where, orderBy }: any) => {
        let rows = scans.filter((s) => where?.diagnosisId == null || s.diagnosisId === where.diagnosisId);
        if (orderBy?.createdAt === "desc") {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows[0] ? { ...rows[0] } : null;
      },
      // תמיכה מינימלית ל-run-interview.ts: רענון scores על שורת סריקה קיימת לפי id (אבן דרך 4, משימה 1)
      update: async ({ where, data }: any) => {
        const s = scans.find((x) => x.id === where.id);
        if (!s) throw new Error("scan not found");
        Object.assign(s, data);
        return { ...s };
      },
    },
    businessModelRow: {
      // upsert אמיתי: create בפעם הראשונה לdiagnosisId נתון, update בפעמים הבאות - כדי ש-findUnique
      // למטה יוכל להחזיר את המצב האפקטיבי האחרון (לא רק את ה-create המקורי)
      upsert: async ({ where, update, create }: any) => {
        const existed = models.some((m) => m.where.diagnosisId === where.diagnosisId);
        const payload = existed ? update : create;
        models.push({ where, create, update, payload });
        return { id: genId("bm"), diagnosisId: where.diagnosisId, ...payload };
      },
      // תמיכה מינימלית ל-interview-repo.ts: המודל השמור האחרון של אבחון, או null אם לא נשמר אף פעם -
      // נגזר מהיסטוריית ה-upsert-ים (models) ולא ממצב פנימי נפרד, כדי שהיסטוריית הבדיקות תישאר גלויה
      findUnique: async ({ where }: any) => {
        const last = [...models].reverse().find((m) => m.where.diagnosisId === where.diagnosisId);
        return last ? { id: genId("bm"), diagnosisId: where.diagnosisId, ...last.payload } : null;
      },
    },
    interviewMessage: {
      create: async ({ data }: any) => {
        const row = {
          id: genId("msg"),
          diagnosisId: data.diagnosisId,
          role: data.role,
          content: data.content,
          questionKey: data.questionKey ?? null,
          isFreeText: data.isFreeText ?? false,
          // createdAt מפורש (כמו appendExchange האמיתי) מכובד; בלעדיו - מונה עולה כברירת מחדל
          createdAt: data.createdAt ?? new Date(Date.now() + msgSeq++),
        };
        messages.push(row);
        return { ...row };
      },
      findMany: async ({ where, orderBy }: any) => {
        let rows = messages.filter((m) => where?.diagnosisId == null || m.diagnosisId === where.diagnosisId);
        // orderBy יכול להיות אובייקט בודד או מערך (מפתח ראשי + שובר-שוויון) - כמו ה-Prisma האמיתי
        const keys: any[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        if (keys.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const key of keys) {
              if (key.createdAt === "asc") {
                const diff = a.createdAt.getTime() - b.createdAt.getTime();
                if (diff !== 0) return diff;
              } else if (key.createdAt === "desc") {
                const diff = b.createdAt.getTime() - a.createdAt.getTime();
                if (diff !== 0) return diff;
              } else if (key.role === "asc") {
                if (a.role !== b.role) return a.role < b.role ? -1 : 1;
              } else if (key.role === "desc") {
                if (a.role !== b.role) return a.role > b.role ? -1 : 1;
              }
            }
            return 0;
          });
        }
        return rows.map((m) => ({ ...m }));
      },
    },
    // אזהרה: הפרומיסים במערך שמועבר כאן נבנים eager (הקריאות ל-.create/.upsert כבר רצות לפני
    // שה-$transaction הזה בכלל נקרא - כך גם ה-Prisma האמיתי בונה אותן), אבל בניגוד ל-PrismaPromise
    // האמיתי (lazy - לא שולח SQL עד שמתחילים לחכות עליו בתוך טרנזקציה) הפייק כאן פשוט מחכה למה
    // שכבר רץ. במילים אחרות: אטומיות (all-or-nothing) אינה נצפית דרך הפייק הזה - אם רוצים לבדוק
    // "כישלון חלקי לא משאיר שורה יתומה" צריך מוק ייעודי, לא makeFakeDb.
    $transaction: async (arr: Promise<unknown>[]) => Promise.all(arr),
  };

  return { db: db as any, businesses, diagnoses, scans, models, messages, transitions };
}
