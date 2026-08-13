import { describe, expect, it } from "vitest";
import { looksLikeUrl } from "../src/app/url-detect";

describe("looksLikeUrl", () => {
  it.each(["lavangroup.co.il", "https://x.co.il", "www.x.com", "x.co.il/about"])(
    "מזהה כתובת: %s", (s) => expect(looksLikeUrl(s)).toBe(true),
  );
  it.each(["מאפיית לחמים", "אופטיקה בק עפולה", "פיצה. משהו", "st. george"])(
    "לא מזהה שם עסק: %s", (s) => expect(looksLikeUrl(s)).toBe(false),
  );
});
