import { describe, it, expect } from "vitest";
import { slugify } from "../src/pipeline/slug";

describe("slugify", () => {
  it("keeps Hebrew, replaces spaces, strips characters illegal in filenames", () => {
    expect(slugify('מוסך הצפון בע"מ')).toBe("מוסך-הצפון-בעמ");
    expect(slugify("  Pizza / Roma  ")).toBe("pizza-roma");
  });

  it("never returns an empty slug", () => {
    expect(slugify("???")).toBe("business");
    expect(slugify("")).toBe("business");
  });

  it("strips bidi marks and control characters", () => {
    expect(slugify("\u200Fמוסך הצפון\u200E")).toBe("מוסך-הצפון");
  });
});
