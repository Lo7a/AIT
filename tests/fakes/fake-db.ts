// פייק Prisma מינימלי לבדיקות אופליין של runDiagnosis/diagnosis-repo — לא ה-client האמיתי, אז השדות
// שעוברים דרכו (where/update/create/data) הם any בכוונה; הטיפוס האמיתי נבדק בקצוות (diagnosis-repo.ts
// עצמו מוקלד מול PrismaClient אמיתי) לא כאן.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeBizRow {
  id: string; name: string; placeId: string | null; websiteKey: string | null;
  website: string | null; city: string | null;
}

export interface FakeDbOptions {
  // מעברי סטטוס ("from→to") שצריכים להיכשל (updateMany מחזיר count:0) כאילו הפסידו במרוץ —
  // משמש לבדיקת "גם ה-revert נכשל" (transitionDiagnosis זורק, לא רק לא-מצליח בשקט)
  failTransitions?: Set<string>;
}

export function makeFakeDb(opts: FakeDbOptions = {}) {
  const businesses: FakeBizRow[] = [];
  const diagnoses: { id: string; businessId: string; status: string }[] = [];
  const scans: any[] = [];
  const models: any[] = [];
  // "from→to" לפי סדר — לב האסרטים על מכונת המצבים. נרשמים רק מעברים שהצליחו בפועל (count:1);
  // מעבר שנכשל (race מדומה דרך failTransitions, או סטטוס לא תואם) לא משאיר עקבות כאן
  const transitions: string[] = [];
  let nextId = 1;
  const genId = (p: string) => `${p}-${nextId++}`;

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
    },
    diagnosis: {
      create: async ({ data }: any) => {
        const row = { id: genId("diag"), businessId: data.businessId, status: "created" };
        diagnoses.push(row);
        return { ...row };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const d = diagnoses.find((x) => x.id === where.id);
        if (!d) throw new Error("diagnosis not found");
        return { status: d.status };
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
    scan: { create: async ({ data }: any) => { scans.push(data); return { id: genId("scan"), ...data }; } },
    businessModelRow: {
      upsert: async ({ where, create }: any) => { models.push({ where, create }); return { id: genId("bm") }; },
    },
    // אזהרה: הפרומיסים במערך שמועבר כאן נבנים eager (הקריאות ל-.create/.upsert כבר רצות לפני
    // שה-$transaction הזה בכלל נקרא — כך גם ה-Prisma האמיתי בונה אותן), אבל בניגוד ל-PrismaPromise
    // האמיתי (lazy — לא שולח SQL עד שמתחילים לחכות עליו בתוך טרנזקציה) הפייק כאן פשוט מחכה למה
    // שכבר רץ. במילים אחרות: אטומיות (all-or-nothing) אינה נצפית דרך הפייק הזה — אם רוצים לבדוק
    // "כישלון חלקי לא משאיר שורה יתומה" צריך מוק ייעודי, לא makeFakeDb.
    $transaction: async (arr: Promise<unknown>[]) => Promise.all(arr),
  };

  return { db: db as any, businesses, diagnoses, scans, models, transitions };
}
