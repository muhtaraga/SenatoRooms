import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "./crypto";

describe("message encryption", () => {
  it("round-trips unicode message content", () => {
    const plainText = "Merhaba, SenatoRoom! 🔒";

    expect(decryptText(encryptText(plainText))).toBe(plainText);
  });

  it("returns an empty string for a malformed or tampered payload", () => {
    expect(decryptText("invalid.payload")).toBe("");
    expect(decryptText(`${encryptText("secret")}.tampered`)).toBe("");
  });
});
