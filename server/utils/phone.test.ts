import { describe, expect, it } from "vitest";
import { normalizeTurkishMobilePhone } from "./phone";

describe("normalizeTurkishMobilePhone", () => {
  it.each([
    ["5533772732", "5533772732"],
    ["05533772732", "5533772732"],
    ["+90 553 377 27 32", "5533772732"],
    ["90 (553) 377-27-32", "5533772732"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTurkishMobilePhone(input)).toBe(expected);
  });

  it.each(["", "553377273", "4533772732", "9055337727320"])("rejects %s", (input) => {
    expect(normalizeTurkishMobilePhone(input)).toBeNull();
  });
});
