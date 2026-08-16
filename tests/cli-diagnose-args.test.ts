import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli-shared";

describe("parseArgs", () => {
  it("rejects a bare --url with no value, before any API call would happen", () => {
    const result = parseArgs(["--url"]);
    expect(result.error).toBeTruthy();
    expect(result.url).toBeUndefined();
    expect(result.query).toBe(""); // "--url" לא נשאר בתוך ה-query
  });

  it("rejects --url with an empty string value", () => {
    const result = parseArgs(["--url", ""]);
    expect(result.error).toBeTruthy();
  });

  it("rejects a bare --pick with no value", () => {
    const result = parseArgs(["עסק", "--pick"]);
    expect(result.error).toBeTruthy();
  });

  it("rejects a non-numeric --pick value (--pick=abc)", () => {
    const result = parseArgs(["עסק", "--pick=abc"]);
    expect(result.error).toBeTruthy();
  });

  it("rejects --pick 0 and negative values", () => {
    expect(parseArgs(["עסק", "--pick", "0"]).error).toBeTruthy();
    expect(parseArgs(["עסק", "--pick", "-1"]).error).toBeTruthy();
  });

  it("parses a valid query with --pick and no error", () => {
    const result = parseArgs(["אופטיקה", "בק", "--pick", "2"]);
    expect(result.error).toBeUndefined();
    expect(result.query).toBe("אופטיקה בק");
    expect(result.pick).toBe(2);
  });

  it("parses a valid --url with no error", () => {
    const result = parseArgs(["--url", "https://example.co.il"]);
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("https://example.co.il");
  });

  it("cli.ts (scan) משתמש באותו פרסר - --url מתקבל כשדה ומודחה על ידי scan", () => {
    const parsed = parseArgs(["מאפייה", "--url", "https://x.co.il"]);
    expect(parsed.url).toBe("https://x.co.il"); // הפרסר מזהה; ההחלטה לדחות היא של scan
  });
});
