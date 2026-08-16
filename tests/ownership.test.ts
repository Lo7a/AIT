import { describe, expect, it } from "vitest";
import { canAccessDiagnosis, isAdmin, userCanAccessDiagnosis, assertDiagnosisAccess } from "../src/server/auth/guard";
import type { SessionUser } from "../src/server/auth/session";
import { createDiagnosisForBusiness, BusinessOwnedByOtherError } from "../src/server/diagnosis-repo";
import { listRecentDiagnoses } from "../src/server/diagnosis-read";
import { InterviewError } from "../src/pipeline/interview/contract";
import { makeFakeDb } from "./fakes/fake-db";

// תיחום הבעלות (אבן דרך "לצאת החוצה"): ההכרעה הטהורה, הבדיקה מול ה-DB, הטבעת הבעלים
// ביצירת אבחון (עסק אחד = חשבון אחד), ותיחום רשימת מסך הבית - הכול אופליין עם fake-db

const OWNER: SessionUser = { id: "user-1", authId: "auth-1", email: "a@example.com", role: "owner" };
const OTHER: SessionUser = { id: "user-2", authId: "auth-2", email: "b@example.com", role: "owner" };
const ADMIN: SessionUser = { id: "user-9", authId: "auth-9", email: "admin@example.com", role: "admin" };

function seedBusinessWithDiagnosis(fake: ReturnType<typeof makeFakeDb>, ownerUserId: string | null) {
  fake.businesses.push({
    id: `biz-owned-${ownerUserId ?? "none"}`, name: "עסק", placeId: `p-${ownerUserId ?? "none"}`,
    websiteKey: null, website: null, phone: null, address: null, city: null, ownerUserId,
  });
  const diag = { id: `diag-${ownerUserId ?? "none"}`, businessId: `biz-owned-${ownerUserId ?? "none"}`, status: "report_ready", createdAt: new Date() };
  fake.diagnoses.push(diag);
  return diag.id;
}

describe("canAccessDiagnosis + isAdmin", () => {
  it("אדמין ניגש להכול, בעלים רק לשלו, שורה בלי בעלים לא נגישה לאף משתמש רגיל", () => {
    expect(isAdmin(ADMIN)).toBe(true);
    expect(isAdmin(OWNER)).toBe(false);
    expect(canAccessDiagnosis(ADMIN, null)).toBe(true);
    expect(canAccessDiagnosis(ADMIN, OWNER.id)).toBe(true);
    expect(canAccessDiagnosis(OWNER, OWNER.id)).toBe(true);
    expect(canAccessDiagnosis(OWNER, OTHER.id)).toBe(false);
    expect(canAccessDiagnosis(OWNER, null)).toBe(false);
  });
});

describe("userCanAccessDiagnosis / assertDiagnosisAccess", () => {
  it("שלי = true, של אחר = false, לא קיים = null; האסרט זורק not_found זהה לשני המקרים האסורים", async () => {
    const fake = makeFakeDb();
    const mine = seedBusinessWithDiagnosis(fake, OWNER.id);
    const foreign = seedBusinessWithDiagnosis(fake, OTHER.id);

    expect(await userCanAccessDiagnosis(fake.db, OWNER, mine)).toBe(true);
    expect(await userCanAccessDiagnosis(fake.db, OWNER, foreign)).toBe(false);
    expect(await userCanAccessDiagnosis(fake.db, OWNER, "diag-missing")).toBeNull();
    expect(await userCanAccessDiagnosis(fake.db, ADMIN, foreign)).toBe(true);

    await expect(assertDiagnosisAccess(fake.db, OWNER, mine)).resolves.toBeUndefined();
    for (const blocked of [foreign, "diag-missing"]) {
      const err = await assertDiagnosisAccess(fake.db, OWNER, blocked).catch((e) => e);
      expect(err).toBeInstanceOf(InterviewError);
      expect((err as InterviewError).kind).toBe("not_found");
      expect((err as InterviewError).message).toBe("האבחון לא נמצא");
    }
  });

  it("שורת עסק בלי בעלים (נתוני טסט ותיקים) - אדמין כן, משתמש רגיל לא", async () => {
    const fake = makeFakeDb();
    const legacy = seedBusinessWithDiagnosis(fake, null);
    expect(await userCanAccessDiagnosis(fake.db, OWNER, legacy)).toBe(false);
    expect(await userCanAccessDiagnosis(fake.db, ADMIN, legacy)).toBe(true);
  });
});

describe("createDiagnosisForBusiness - הטבעת בעלות (עסק אחד = חשבון אחד)", () => {
  it("עסק חדש נוצר עם הבעלים המחובר", async () => {
    const fake = makeFakeDb();
    await createDiagnosisForBusiness(fake.db, { name: "חדש", placeId: "p1", ownerUserId: OWNER.id });
    expect(fake.businesses[0].ownerUserId).toBe(OWNER.id);
  });

  it("עסק קיים בלי בעלים נתבע בסריקה הראשונה של משתמש מחובר", async () => {
    const fake = makeFakeDb();
    await createDiagnosisForBusiness(fake.db, { name: "ותיק", placeId: "p1" });
    expect(fake.businesses[0].ownerUserId).toBeNull();
    await createDiagnosisForBusiness(fake.db, { name: "ותיק", placeId: "p1", ownerUserId: OWNER.id });
    expect(fake.businesses[0].ownerUserId).toBe(OWNER.id);
  });

  it("עסק של משתמש אחר נדחה - ובלי שורת אבחון יתומה", async () => {
    const fake = makeFakeDb();
    await createDiagnosisForBusiness(fake.db, { name: "שלי", placeId: "p1", ownerUserId: OWNER.id });
    const diagnosesBefore = fake.diagnoses.length;
    await expect(
      createDiagnosisForBusiness(fake.db, { name: "שלי", placeId: "p1", ownerUserId: OTHER.id }),
    ).rejects.toBeInstanceOf(BusinessOwnedByOtherError);
    expect(fake.diagnoses.length).toBe(diagnosesBefore);
    expect(fake.businesses[0].ownerUserId).toBe(OWNER.id);
  });

  it("סריקה חוזרת של הבעלים עצמו עוברת; מסלול CLI בלי משתמש לא נוגע בבעלות קיימת", async () => {
    const fake = makeFakeDb();
    await createDiagnosisForBusiness(fake.db, { name: "שלי", placeId: "p1", ownerUserId: OWNER.id });
    await expect(
      createDiagnosisForBusiness(fake.db, { name: "שלי", placeId: "p1", ownerUserId: OWNER.id }),
    ).resolves.toBeTruthy();
    await expect(
      createDiagnosisForBusiness(fake.db, { name: "שלי", placeId: "p1" }),
    ).resolves.toBeTruthy();
    expect(fake.businesses[0].ownerUserId).toBe(OWNER.id);
  });
});

describe("listRecentDiagnoses - תיחום הרשימה", () => {
  it("עם ownerUserId מוחזרות רק שורות של אותו בעלים; בלי תיחום - הכול (אדמין)", async () => {
    const fake = makeFakeDb();
    seedBusinessWithDiagnosis(fake, OWNER.id);
    seedBusinessWithDiagnosis(fake, OTHER.id);
    seedBusinessWithDiagnosis(fake, null);

    const mine = await listRecentDiagnoses(fake.db, { ownerUserId: OWNER.id });
    expect(mine.map((d) => d.id)).toEqual([`diag-${OWNER.id}`]);

    const all = await listRecentDiagnoses(fake.db);
    expect(all).toHaveLength(3);
  });
});
