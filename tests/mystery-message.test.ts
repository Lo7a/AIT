import { describe, expect, it } from "vitest";
import { composeInquiry, disclosureText, pickPersona, PERSONAS } from "../src/pipeline/mystery/message";

const FORBIDDEN = /[–—…‎‏]|\p{Extended_Pictographic}/u;

describe("composeInquiry", () => {
  it("מייל: פנייה של לקוח, בקשה לתשובה במייל, בלי ספרות ובלי תווים אסורים", () => {
    const q = composeInquiry("email", "beauty_grooming", { name: "נועה", feminine: true });
    expect(q.senderName).toBe("נועה");
    expect(q.body).toContain("ראיתי אתכם בגוגל");
    expect(q.body).toContain("לקבוע תור");
    expect(q.body).toContain("אפשר לחזור אליי במייל");
    expect(q.body).toContain("זמינה");
    expect(q.body).toMatch(/\nנועה$/);
    expect(q.body).not.toMatch(/\p{N}/u);
    expect(q.subject + q.body).not.toMatch(FORBIDDEN);
  });

  it("זכר/נקבה לפי הפרסונה; ענף לא מוכר מקבל בקשה כללית", () => {
    const q = composeInquiry("form", "unknown", { name: "דניאל", feminine: false });
    expect(q.body).toContain("זמין בטלפון");
    expect(q.body).toContain("לשמוע על השירות שלכם");
  });

  it("וואטסאפ וטלפון: הודעה קצרה בשורה אחת, לשליחה ידנית", () => {
    const q = composeInquiry("whatsapp", "auto_service", { name: "עומר", feminine: false });
    expect(q.body).not.toContain("\n");
    expect(q.body).toContain("טיפול לרכב");
    expect(q.body.endsWith("עומר")).toBe(true);
    expect(composeInquiry("phone", "auto_service", { name: "עומר", feminine: false }).body).toBe(q.body);
  });

  it("אף פעם לא מזמינים ולא קונים - רק שואלים", () => {
    for (const industry of ["beauty_grooming", "food_dine_in", "retail_store", "unknown"]) {
      const body = composeInquiry("email", industry, PERSONAS[0]).body;
      expect(body).not.toMatch(/אני מזמין|תזמינו לי|לשלם עכשיו|אשלם/);
    }
  });
});

describe("pickPersona", () => {
  it("מכסה את כל הרשימה ולא חורג ממנה", () => {
    expect(pickPersona(() => 0)).toEqual(PERSONAS[0]);
    expect(pickPersona(() => 0.999)).toEqual(PERSONAS[PERSONAS.length - 1]);
    expect(pickPersona(() => 1)).toEqual(PERSONAS[PERSONAS.length - 1]);
  });
});

describe("disclosureText", () => {
  it("מזדהה בשם בדק עסק ומשחרר את העסק מהמשך טיפול", () => {
    const t = disclosureText("מוסך הדוגמה");
    expect(t).toContain("בדיקת לקוח סמוי מטעם בדק עסק");
    expect(t).toContain("מוסך הדוגמה");
    expect(t).toContain("אין צורך להמשיך לטפל");
    expect(t).not.toMatch(FORBIDDEN);
  });
});
