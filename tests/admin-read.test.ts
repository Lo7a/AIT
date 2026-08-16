import { describe, expect, it } from "vitest";
import { countByKey } from "../src/server/admin-read";

// העזר הטהור של שכבת האדמין - השאילתות עצמן דקות ולא נבדקות (כמו כל שכבות ה-RSC)

describe("countByKey", () => {
  it("סופר לפי מפתח; מערך ריק מחזיר אובייקט ריק", () => {
    const rows = [{ s: "a" }, { s: "b" }, { s: "a" }, { s: "a" }];
    expect(countByKey(rows, (r) => r.s)).toEqual({ a: 3, b: 1 });
    expect(countByKey([], () => "x")).toEqual({});
  });
});
