import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_STATUSES, canTransition, assertTransition, type DiagnosisStatus,
} from "../src/server/status";

describe("diagnosis state machine", () => {
  it.each([
    ["created", "scanning"],
    ["scanning", "scanned"],
    ["scanning", "created"],        // סריקה נכשלה — מותר לנסות שוב
    ["scanned", "report_ready"],
    ["report_ready", "interviewing"],
    ["report_ready", "roadmap_ready"], // דילוג על הראיון — עיקרון "כלום לא חובה"
    ["interviewing", "roadmap_ready"],
    ["interviewing", "report_ready"],
    ["roadmap_ready", "interviewing"], // חוזרים לראיון, ה-Roadmap יחושב מחדש
  ] as [DiagnosisStatus, DiagnosisStatus][])("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["created", "report_ready"],
    ["created", "created"],
    ["scanned", "scanning"],
    ["roadmap_ready", "created"],
  ] as [DiagnosisStatus, DiagnosisStatus][])("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("assertTransition throws a clear Hebrew error naming both statuses", () => {
    expect(() => assertTransition("created", "roadmap_ready"))
      .toThrow(/created.*roadmap_ready/);
  });

  it("every status is reachable from created (no dead states)", () => {
    const reached = new Set<DiagnosisStatus>(["created"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...reached]) for (const to of DIAGNOSIS_STATUSES) {
        if (!reached.has(to) && canTransition(from, to)) { reached.add(to); grew = true; }
      }
    }
    expect([...reached].sort()).toEqual([...DIAGNOSIS_STATUSES].sort());
  });
});
