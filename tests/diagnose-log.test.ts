import { afterEach, describe, expect, it, vi } from "vitest";
import { logDiagnoseEvent } from "../src/server/api/diagnose-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logDiagnoseEvent", () => {
  it("created - שורת log יחידה עם קידומת 8 התווים הראשונים של המזהה ושם העסק", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "created", diagnosisId: "abcdef1234567890", businessName: "עסק בדיקה" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("abcdef12");
    expect(line).not.toContain("34567890"); // רק 8 התווים הראשונים, לא המזהה המלא
    expect(line).toContain("עסק בדיקה");
  });

  it("done - שורת log יחידה עם קידומת המזהה ו-report_ready", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "done", diagnosisId: "abcdef1234567890" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("abcdef12");
    expect(line).toContain("report_ready");
  });

  it("step_done מוצלח - כולל ok והפרטים", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "step_done", key: "crawl", ok: true, detail: "נסרקו 3 עמודים" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("crawl");
    expect(line).toContain("ok");
    expect(line).toContain("נסרקו 3 עמודים");
  });

  it("step_done כושל בלי detail - כולל failed, לא זורק", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "step_done", key: "pagespeed", ok: false });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("pagespeed");
    expect(line).toContain("failed");
  });

  it("error - console.error עם ההודעה, לא console.log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logDiagnoseEvent({ type: "error", message: "האבחון נכשל" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0] as string).toContain("האבחון נכשל");
  });

  it("step (התחלת שלב) - לא רושם שום שורה, רק step_done נרשם", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "step", key: "details", label: "מאתרים" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("כל שורה כוללת חותמת זמן HH:MM:SS", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logDiagnoseEvent({ type: "done", diagnosisId: "abcdef1234567890" });
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
