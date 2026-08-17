// פייק Prisma מינימלי לבדיקות אופליין של runDiagnosis/diagnosis-repo - לא ה-client האמיתי, אז השדות
// שעוברים דרכו (where/update/create/data) הם any בכוונה; הטיפוס האמיתי נבדק בקצוות (diagnosis-repo.ts
// עצמו מוקלד מול PrismaClient אמיתי) לא כאן.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeBizRow {
  id: string; name: string; placeId: string | null; websiteKey: string | null;
  website: string | null; phone: string | null; address: string | null; city: string | null;
  // תיחום בעלות (אבן דרך "לצאת החוצה") - null = שורה ללא בעלים (נתוני טסט ותיקים)
  ownerUserId: string | null;
}

export interface FakeDbOptions {
  // מעברי סטטוס ("from→to") שצריכים להיכשל (updateMany מחזיר count:0) כאילו הפסידו במרוץ -
  // משמש לבדיקת "גם ה-revert נכשל" (transitionDiagnosis זורק, לא רק לא-מצליח בשקט)
  failTransitions?: Set<string>;
  // מדמה כשל DB בזמן יצירת Brief (אבן דרך 4, משימה 7) - כדי לבדוק שהטרנזקציה של
  // createBriefAndRequestItem (run-brief.ts) מתגלגלת אחורה במלואה: אם ה-brief לא נוצר, גם
  // עדכון סטטוס הפריט ל-"requested" לא אמור להישאר
  failBriefCreate?: boolean;
}

export function makeFakeDb(opts: FakeDbOptions = {}) {
  const businesses: FakeBizRow[] = [];
  const diagnoses: { id: string; businessId: string; status: string; createdAt: Date }[] = [];
  const scans: any[] = [];
  const models: any[] = [];
  const messages: any[] = [];
  // קטלוג ההזדמנויות + בנצ'מרקים: קבועים בזרע (prisma/seed.ts), לא נכתבים ע"י קוד השרת - הבדיקות
  // זורעות אותם ישירות (push), בלי צורך ב-db.opportunityCatalog.create מקביל
  const catalogs: any[] = [];
  const benchmarks: any[] = [];
  const roadmaps: any[] = [];
  const roadmapItems: any[] = [];
  const briefs: any[] = [];
  const users: any[] = [];
  const usageEvents: any[] = [];
  const externalCalls: any[] = [];
  // "from→to" לפי סדר - לב האסרטים על מכונת המצבים. נרשמים רק מעברים שהצליחו בפועל (count:1);
  // מעבר שנכשל (race מדומה דרך failTransitions, או סטטוס לא תואם) לא משאיר עקבות כאן
  const transitions: string[] = [];
  let nextId = 1;
  const genId = (p: string) => `${p}-${nextId++}`;
  // סדר יציב להודעות ראיון: Date.now() לבדו עלול לחזור על עצמו בין שתי יצירות רצופות באותה
  // מילישנייה - כשה-caller מעביר createdAt מפורש (כמו appendExchange האמיתי) הוא מכבד אותו;
  // מונה עולה משמש רק כברירת מחדל כשלא הועבר createdAt
  let msgSeq = 0;
  // אותו טיפול בדיוק בשביל roadmaps: שני createRoadmap רצופים באותה בדיקה (roadmap מחושב מחדש)
  // לא אמורים להתנגש על מילישנייה - שעון מונוטוני קל כמו lastExchangeEnd ב-interview-repo.ts
  let lastRoadmapEnd = 0;

  // any מפורש: הפייק מפנה לעצמו מתוך $transaction (הצורה האינטראקטיבית מקבלת את אותו client),
  // ובלי ההערה TypeScript היה נופל על הסקה מעגלית
  const db: any = {
    business: {
      upsert: async ({ where, update, create }: any) => {
        const found = businesses.find(
          (b) => (where.placeId != null && b.placeId === where.placeId)
            || (where.websiteKey != null && b.websiteKey === where.websiteKey),
        );
        if (found) { Object.assign(found, update); return { ...found }; }
        const row: FakeBizRow = {
          id: genId("biz"), placeId: null, websiteKey: null, website: null, phone: null, address: null,
          city: null, ownerUserId: null, ...create,
        };
        // Prisma האמיתי מתעלם משדה עם undefined ב-create (ברירת המחדל של העמודה נשארת);
        // ה-spread כאן היה דורס את ה-null עם undefined - מנרמלים חזרה לאותה סמנטיקה
        if (row.ownerUserId === undefined) row.ownerUserId = null;
        businesses.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const b = businesses.find((x) => x.id === where.id);
        if (!b) throw new Error("business not found");
        Object.assign(b, data);
        return { ...b };
      },
      // תמיכה מינימלית ל-diagnosis-lookup.ts ול-auth/guard.ts: חיפוש עסק לפי placeId, websiteKey
      // או id (select נבלע - הפייק תמיד מחזיר את השורה המלאה, כמו upsert/update למעלה)
      findUnique: async ({ where }: any) => {
        const found = businesses.find(
          (b) => (where.placeId != null && b.placeId === where.placeId)
            || (where.websiteKey != null && b.websiteKey === where.websiteKey)
            || (where.id != null && b.id === where.id),
        );
        return found ? { ...found } : null;
      },
      // תמיכה מינימלית ל-resolveBusinessOwnership (diagnosis-repo.ts): תביעת עסק חסר-בעלים
      // ב-CAS - העדכון מותנה ב-ownerUserId הנוכחי (null), בדיוק כמו updateMany של האבחונים
      updateMany: async ({ where, data }: any) => {
        const b = businesses.find(
          (x) => x.id === where.id
            && (!("ownerUserId" in where) || x.ownerUserId === where.ownerUserId),
        );
        if (!b) return { count: 0 };
        Object.assign(b, data);
        return { count: 1 };
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
      // תמיכה מינימלית ל-listRecentDiagnoses (diagnosis-read.ts): כל האבחונים, חדש-לישן, עם
      // תיחום בעלות דרך העסק (where.business.ownerUserId) - include נבלע, כל שורה מוחזרת עם
      // business (שם) ו-scans (האחרונה, scores בלבד בפועל אצל האמיתי; כאן השורה המלאה)
      findMany: async ({ where, orderBy, take }: any) => {
        let rows = diagnoses.filter((d) => {
          const wantedOwner = where?.business?.ownerUserId;
          if (wantedOwner == null) return true;
          const biz = businesses.find((b) => b.id === d.businessId);
          return biz?.ownerUserId === wantedOwner;
        });
        if (orderBy?.createdAt === "desc") {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (take != null) rows = rows.slice(0, take);
        return rows.map((d) => {
          const biz = businesses.find((b) => b.id === d.businessId);
          const dScans = scans
            .filter((s) => s.diagnosisId === d.id)
            .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
            .slice(0, 1);
          return { ...d, business: biz ? { name: biz.name } : { name: "" }, scans: dScans.map((s) => ({ ...s })) };
        });
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
    // תמיכה מינימלית ל-run-roadmap.ts: קריאת כל שורות הקטלוג (select נבלע כמו בכל מקום אחר
    // בפייק הזה - הבדיקות זורעות ישירות ל-catalogs, ראו הערה למעלה על מנגנון הזריעה)
    opportunityCatalog: {
      findMany: async () => catalogs.map((c) => ({ ...c })),
    },
    roadmap: {
      create: async ({ data }: any) => {
        const t = Math.max(Date.now(), lastRoadmapEnd + 1);
        lastRoadmapEnd = t;
        const row = { id: genId("rm"), diagnosisId: data.diagnosisId, createdAt: new Date(t), updatedAt: new Date(t) };
        roadmaps.push(row);
        return { ...row };
      },
      // תמיכה מינימלית ל-roadmap-repo.ts: ה-roadmap האחרון של אבחון, ממוין לפי createdAt
      findFirst: async ({ where, orderBy }: any) => {
        let rows = roadmaps.filter((r) => where?.diagnosisId == null || r.diagnosisId === where.diagnosisId);
        if (orderBy?.createdAt === "desc") {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows[0] ? { ...rows[0] } : null;
      },
    },
    roadmapItem: {
      create: async ({ data }: any) => {
        // מדמה FK constraint אמיתי של Postgres (roadmap_items.catalog_id -> opportunity_catalog.id):
        // catalogId שלא קיים בקטלוג נכשל ב-INSERT. זה גם מנגנון ההזרקה הטבעי לבדיקת אטומיות
        // createRoadmap - כשל באמצע הלולאה חייב לגלגל אחורה גם את שורת ה-roadmap עצמה
        if (!catalogs.some((c) => c.id === data.catalogId)) {
          throw new Error(`roadmapItem.create: catalogId לא קיים בקטלוג: ${data.catalogId}`);
        }
        const row = {
          id: genId("rmi"), roadmapId: data.roadmapId, catalogId: data.catalogId,
          score: data.score, confidence: data.confidence, phase: data.phase,
          reasoning: data.reasoning ?? null,
          status: data.status ?? "proposed", updatedAt: new Date(),
        };
        roadmapItems.push(row);
        return { ...row };
      },
      // תמיכה מינימלית ל-roadmap-repo.ts: פריטי roadmap ממוינים, כל שורה מצורפת ל-catalog שלה
      // (עם benchmarks מקוננים) - select/include נבלעים, כמו בכל מודל אחר בפייק הזה - התצוגה
      // נבנית תמיד עם הצירוף המלא ו-getRoadmapView בוחר ממנה רק את מה שהוא צריך
      findMany: async ({ where, orderBy }: any) => {
        let rows = roadmapItems.filter((it) => where?.roadmapId == null || it.roadmapId === where.roadmapId);
        const keys: any[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        if (keys.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const key of keys) {
              if (key.score === "desc") { const diff = b.score - a.score; if (diff !== 0) return diff; }
              else if (key.score === "asc") { const diff = a.score - b.score; if (diff !== 0) return diff; }
              else if (key.id === "asc") { if (a.id !== b.id) return a.id < b.id ? -1 : 1; }
              else if (key.id === "desc") { if (a.id !== b.id) return a.id > b.id ? -1 : 1; }
            }
            return 0;
          });
        }
        return rows.map((it) => {
          const catalog = catalogs.find((c) => c.id === it.catalogId);
          const itemBenchmarks = benchmarks.filter((b) => b.catalogId === it.catalogId);
          return { ...it, catalog: catalog ? { ...catalog, benchmarks: itemBenchmarks.map((b) => ({ ...b })) } : null };
        });
      },
      // תמיכה מינימלית ל-run-brief.ts: פריט Roadmap בודד לפי id, מצורף לכל השרשרת שהתבנית
      // (brief.ts) צריכה - catalog+benchmarks, ולמעלה roadmap->diagnosis->business/businessModel.
      // כל היחסים האלה FK רגילים בסכמה (schema.prisma), אז זו שאילתת include מקוננת תקנית
      // לגמרי אצל Prisma האמיתי - select/include נבלע כאן כמו בכל מקום אחר בפייק הזה
      findUnique: async ({ where }: any) => {
        const it = roadmapItems.find((x) => x.id === where.id);
        if (!it) return null;
        const catalog = catalogs.find((c) => c.id === it.catalogId);
        const itemBenchmarks = benchmarks.filter((b) => b.catalogId === it.catalogId);
        const roadmap = roadmaps.find((r) => r.id === it.roadmapId);
        const diagnosis = roadmap ? diagnoses.find((d) => d.id === roadmap.diagnosisId) : undefined;
        const business = diagnosis ? businesses.find((b) => b.id === diagnosis.businessId) : undefined;
        const modelEntry = diagnosis ? [...models].reverse().find((m) => m.where.diagnosisId === diagnosis.id) : undefined;
        return {
          ...it,
          catalog: catalog ? { ...catalog, benchmarks: itemBenchmarks.map((b) => ({ ...b })) } : null,
          roadmap: roadmap ? {
            ...roadmap,
            diagnosis: diagnosis ? {
              ...diagnosis,
              business: business ? { ...business } : null,
              businessModel: modelEntry ? { id: genId("bm"), diagnosisId: diagnosis.id, ...modelEntry.payload } : null,
            } : null,
          } : null,
        };
      },
      // תמיכה מינימלית ל-run-brief.ts: עדכון status (proposed -> requested כשנוצר Brief)
      update: async ({ where, data }: any) => {
        const it = roadmapItems.find((x) => x.id === where.id);
        if (!it) throw new Error("roadmapItem not found");
        Object.assign(it, data);
        return { ...it };
      },
    },
    brief: {
      create: async ({ data }: any) => {
        // מדמה כשל DB מדומה בזמן יצירת Brief (FakeDbOptions.failBriefCreate) - מנגנון ההזרקה
        // לבדיקת אטומיות createBriefAndRequestItem: כשל כאן חייב לגלגל אחורה גם עדכון status
        // שקרה (או עומד לקרות) באותה טרנזקציה, בדיוק כמו כשל catalogId ב-roadmapItem.create
        if (opts.failBriefCreate) throw new Error("brief.create: כשל DB מדומה");
        const row = {
          id: genId("brief"), roadmapItemId: data.roadmapItemId, content: data.content,
          sentAt: data.sentAt ?? null, createdAt: new Date(), updatedAt: new Date(),
        };
        briefs.push(row);
        return { ...row };
      },
      // תמיכה מינימלית ל-run-brief.ts: עדכון sentAt אחרי שליחה מוצלחת (transport.send)
      update: async ({ where, data }: any) => {
        const b = briefs.find((x) => x.id === where.id);
        if (!b) throw new Error("brief not found");
        Object.assign(b, data);
        return { ...b };
      },
    },
    // תמיכה מינימלית ל-usage-events.ts (יומן הפעולות) ול-rate-limit.ts (ספירה בחלון זמן):
    // create + count - הצד הקורא המלא (מסכי אדמין) יגיע בשלב האדמין ויוסיף findMany לפי הצורך
    usageEvent: {
      create: async ({ data }: any) => {
        const row = {
          id: genId("evt"), type: data.type, userId: data.userId ?? null,
          actorUserId: data.actorUserId ?? null, entityType: data.entityType ?? null,
          entityId: data.entityId ?? null, metadata: data.metadata ?? null,
          createdAt: data.createdAt ?? new Date(),
        };
        usageEvents.push(row);
        return { ...row };
      },
      count: async ({ where }: any) => usageEvents.filter(
        (e) => (where?.userId == null || e.userId === where.userId)
          && (where?.type == null || e.type === where.type)
          && (where?.createdAt?.gte == null || e.createdAt >= where.createdAt.gte),
      ).length,
    },
    // ארכיון הקריאות החיצוניות (הכרעת מייסד 17.8): create ל-sink של external-log,
    // findMany עם סינון createdAt.gte לצד הקריאה של האדמין
    externalCall: {
      create: async ({ data }: any) => {
        const row = {
          id: genId("xc"), service: data.service, context: data.context,
          diagnosisId: data.diagnosisId ?? null, userId: data.userId ?? null,
          ok: data.ok, durationMs: data.durationMs,
          inputTokens: data.inputTokens ?? null, outputTokens: data.outputTokens ?? null,
          payload: data.payload ?? null, createdAt: data.createdAt ?? new Date(),
        };
        externalCalls.push(row);
        return { ...row };
      },
      findMany: async ({ where }: any = {}) => externalCalls
        .filter((c) => where?.createdAt?.gte == null || c.createdAt >= where.createdAt.gte)
        .map((c) => ({ ...c })),
    },
    // תמיכה מינימלית ל-auth/session.ts (טבלת המראה users): שליפה לפי כל אחד מהמפתחות
    // הייחודיים, יצירה עם אכיפת ייחודיות (authId/email - מדמה P2002 של Prisma האמיתי,
    // מנגנון ההזרקה לבדיקת מרוץ היצירה הכפולה), ועדכון לפי id
    user: {
      findUnique: async ({ where }: any) => {
        const found = users.find(
          (u) => (where.id != null && u.id === where.id)
            || (where.authId != null && u.authId === where.authId)
            || (where.email != null && u.email === where.email),
        );
        return found ? { ...found } : null;
      },
      create: async ({ data }: any) => {
        if (data.authId != null && users.some((u) => u.authId === data.authId)) {
          throw new Error("user.create: authId כבר קיים (ייחודיות)");
        }
        if (data.email != null && users.some((u) => u.email === data.email)) {
          throw new Error("user.create: email כבר קיים (ייחודיות)");
        }
        const row = {
          id: genId("user"), authId: data.authId ?? null, email: data.email ?? null,
          role: data.role ?? "owner", createdAt: new Date(), updatedAt: new Date(),
        };
        users.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error("user not found");
        if (data.email != null && users.some((x) => x.id !== u.id && x.email === data.email)) {
          throw new Error("user.update: email כבר קיים (ייחודיות)");
        }
        Object.assign(u, data, { updatedAt: new Date() });
        return { ...u };
      },
    },
    // שתי הצורות של $transaction נתמכות:
    // 1. מערך פרומיסים - הפרומיסים נבנים eager (הקריאות ל-.create/.upsert כבר רצות לפני
    //    שה-$transaction בכלל נקרא), ובניגוד ל-PrismaPromise האמיתי (lazy) הפייק רק מחכה למה
    //    שכבר רץ. אטומיות אינה נצפית בצורה הזו.
    // 2. callback אינטראקטיבי - כאן הפייק כן מדמה rollback אמיתי: זריקה מתוך ה-callback מחזירה
    //    את scans/models, את סטטוסי האבחון ואת יומן המעברים למצב שלפני. זה מה שמאפשר לבדוק
    //    ש"כישלון מעבר הסטטוס לא משאיר שורת סריקה יתומה" (saveScanResult, diagnosis-repo.ts)
    $transaction: async (arg: any) => {
      if (typeof arg !== "function") return Promise.all(arg);
      // שכפול per-row (לא רק [...array]) לכל מודל שיש לו update במקום (Object.assign) - scan.update
      // (רענון scores, אבן דרך 4 משימה 1) ו-roadmapItem.update (מעבר status, משימה 7): מערך
      // מועתק ברמת המערך בלבד עדיין מצביע על אותם אובייקטים חיים, אז Object.assign בתוך
      // הטרנזקציה משנה גם את "before" עצמו - ה-splice בהמשך "משחזר" את הגרסה כבר-משונה ולא
      // עושה כלום בפועל. roadmaps/models/briefs נשכפלים כאן גם הם לעקביות/הגנה, גם שהיום הם
      // create-only בתוך טרנזקציה (לא Object.assign) - נתפס בסקירה על בדיקת האטומיות של הפייק
      const before = {
        scans: scans.map((s) => ({ ...s })), models: [...models], transitions: [...transitions],
        statuses: new Map(diagnoses.map((d) => [d.id, d.status])),
        roadmaps: roadmaps.map((r) => ({ ...r })), roadmapItems: roadmapItems.map((it) => ({ ...it })),
        briefs: briefs.map((b) => ({ ...b })),
      };
      try {
        return await arg(db);
      } catch (err) {
        scans.splice(0, scans.length, ...before.scans);
        models.splice(0, models.length, ...before.models);
        transitions.splice(0, transitions.length, ...before.transitions);
        for (const d of diagnoses) {
          const prev = before.statuses.get(d.id);
          if (prev != null) d.status = prev;
        }
        roadmaps.splice(0, roadmaps.length, ...before.roadmaps);
        roadmapItems.splice(0, roadmapItems.length, ...before.roadmapItems);
        briefs.splice(0, briefs.length, ...before.briefs);
        throw err;
      }
    },
  };

  return {
    db: db as any, businesses, diagnoses, scans, models, messages, transitions, externalCalls,
    catalogs, benchmarks, roadmaps, roadmapItems, briefs, users, usageEvents,
  };
}
