/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeBizRow {
  id: string; name: string; placeId: string | null; websiteKey: string | null;
  website: string | null; city: string | null;
}

export function makeFakeDb() {
  const businesses: FakeBizRow[] = [];
  const diagnoses: { id: string; businessId: string; status: string }[] = [];
  const scans: any[] = [];
  const models: any[] = [];
  const transitions: string[] = []; // "from→to" לפי סדר — לב האסרטים על מכונת המצבים
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
        const d = diagnoses.find((x) => x.id === where.id && x.status === where.status);
        if (!d) return { count: 0 };
        transitions.push(`${where.status}→${data.status}`);
        d.status = data.status;
        return { count: 1 };
      },
    },
    scan: { create: async ({ data }: any) => { scans.push(data); return { id: genId("scan"), ...data }; } },
    businessModelRow: {
      upsert: async ({ where, create }: any) => { models.push({ where, create }); return { id: genId("bm") }; },
    },
    $transaction: async (arr: Promise<unknown>[]) => Promise.all(arr),
  };

  return { db: db as any, businesses, diagnoses, scans, models, transitions };
}
