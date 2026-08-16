import { describe, it, expect, vi } from "vitest";
import { assertResolvesPublic, type LookupLike } from "../src/pipeline/resolve-guard";
import { isForbiddenIp } from "../src/pipeline/forbidden-host";

// כל ה-resolvers כאן מזויפים - הבדיקות אופליין בלבד, לעולם לא DNS אמיתי
const lookupOf = (addresses: Array<{ address: string; family: number }>) =>
  vi.fn<LookupLike>(async () => addresses);

describe("isForbiddenIp", () => {
  it("חוסם טווחי v4 פרטיים/מקומיים ומאשר כתובות ציבוריות", () => {
    for (const bad of ["127.0.0.1", "10.0.0.5", "0.0.0.0", "169.254.169.254", "192.168.1.1", "172.16.0.1", "172.31.255.255"]) {
      expect(isForbiddenIp(bad), bad).toBe(true);
    }
    for (const good of ["8.8.8.8", "203.0.113.10", "172.32.0.1", "11.0.0.1"]) {
      expect(isForbiddenIp(good), good).toBe(false);
    }
  });

  it("חוסם v6 פנימי כולל צורות v4-ממופה - נקודתית (dns.lookup) ו-hex (סריאל של new URL)", () => {
    for (const bad of [
      "::1", "::", "fe80::1", "fc00::1", "fd00::1",
      "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:192.168.1.1",
      "::ffff:a00:1", "::ffff:7f00:1", "::FFFF:10.0.0.1",
    ]) {
      expect(isForbiddenIp(bad), bad).toBe(true);
    }
  });

  it("מאשר v6 ציבורי, כולל צורה ממופה של כתובת ציבורית", () => {
    for (const good of ["2606:4700::6810:84e5", "2a00:1450:4001:82f::2004", "::ffff:8.8.8.8", "::ffff:808:808"]) {
      expect(isForbiddenIp(good), good).toBe(false);
    }
  });
});

describe("assertResolvesPublic", () => {
  it("שם ציבורי שנפתר לכתובת v4 פרטית נדחה, וההודעה חושפת רק את שם המארח", async () => {
    const err = await assertResolvesPublic(
      new URL("https://rebind.example/admin/secret?key=1"),
      lookupOf([{ address: "10.0.0.5", family: 4 }]),
    ).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("rebind.example");
    expect(err!.message).not.toContain("secret");
    expect(err!.message).not.toContain("10.0.0.5"); // גם הכתובת שנפתרה לא נחשפת
  });

  it("שם שנפתר ל-v6 פנימי (fd00::1) נדחה", async () => {
    await expect(
      assertResolvesPublic(new URL("https://v6.example/"), lookupOf([{ address: "fd00::1", family: 6 }])),
    ).rejects.toThrow(/v6\.example/);
  });

  it("שם שנפתר לצורה ממופה ::ffff:10.0.0.1 נדחה", async () => {
    await expect(
      assertResolvesPublic(new URL("https://mapped.example/"), lookupOf([{ address: "::ffff:10.0.0.1", family: 6 }])),
    ).rejects.toThrow(/mapped\.example/);
  });

  it("שם שנפתר לכתובות ציבוריות בלבד עובר בשקט", async () => {
    const lookupImpl = lookupOf([
      { address: "203.0.113.10", family: 4 },
      { address: "2606:4700::6810:84e5", family: 6 },
    ]);
    await expect(assertResolvesPublic(new URL("https://example.co.il/"), lookupImpl)).resolves.toBeUndefined();
    expect(lookupImpl).toHaveBeenCalledWith("example.co.il", { all: true });
  });

  it("כמה כתובות שרק אחת מהן פרטית - נדחה (ולו כתובת אסורה אחת מספיקה)", async () => {
    await expect(
      assertResolvesPublic(new URL("https://mixed.example/"), lookupOf([
        { address: "203.0.113.10", family: 4 },
        { address: "192.168.1.1", family: 4 },
        { address: "2606:4700::6810:84e5", family: 6 },
      ])),
    ).rejects.toThrow(/mixed\.example/);
  });

  it("ליטרל IP מדלג על ה-resolver לגמרי - הוא כבר נבדק תחבירית", async () => {
    const lookupImpl = lookupOf([{ address: "10.0.0.5", family: 4 }]);
    await assertResolvesPublic(new URL("http://8.8.8.8/"), lookupImpl);
    await assertResolvesPublic(new URL("http://[2606:4700::6810:84e5]/"), lookupImpl);
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it("כשל DNS (למשל NXDOMAIN) מחלחל כמו שהוא - לא מסלול שגיאה חדש", async () => {
    const lookupImpl = vi.fn<LookupLike>(async () => {
      throw new Error("getaddrinfo ENOTFOUND missing.example");
    });
    await expect(assertResolvesPublic(new URL("https://missing.example/"), lookupImpl))
      .rejects.toThrow(/ENOTFOUND/);
  });
});
