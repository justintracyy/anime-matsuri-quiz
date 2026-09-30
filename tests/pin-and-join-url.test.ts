import { describe, expect, it } from "vitest";
import { cleanNickname, nicknameSchema, suggestNickname } from "@/lib/nickname";
import { buildJoinUrl, formatPin, generatePin, isValidPin, normalizePin } from "@/lib/pin";

describe("game PIN", () => {
  it("always generates six digits that don't start with zero", () => {
    expect(generatePin(() => 0)).toBe("100000");
    expect(generatePin(() => 0.999999999)).toBe("999999");
    for (let i = 0; i < 500; i++) expect(isValidPin(generatePin())).toBe(true);
  });

  it("validates and normalizes user input", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("012345")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin(123456)).toBe(false);
    expect(normalizePin(" 123-456 7")).toBe("123456");
    expect(formatPin("123456")).toBe("123 456");
  });
});

describe("QR join URL", () => {
  it("links to /join/[pin] on the deployment origin", () => {
    expect(buildJoinUrl("https://matsuri.vercel.app", "482913")).toBe("https://matsuri.vercel.app/join/482913");
    expect(buildJoinUrl("https://matsuri.vercel.app///", "482913")).toBe("https://matsuri.vercel.app/join/482913");
  });
});

describe("nicknames", () => {
  it("cleans whitespace and control characters", () => {
    expect(cleanNickname("  Sakura\u0000   Chan \u200B ")).toBe("Sakura Chan");
    expect(nicknameSchema.safeParse("   ").success).toBe(false);
    expect(nicknameSchema.safeParse("x".repeat(21)).success).toBe(false);
    expect(nicknameSchema.parse(" Kitsune ")).toBe("Kitsune");
  });

  it("suggests the next free variant, case-insensitively", () => {
    expect(suggestNickname("Kitsune", ["kitsune", "KITSUNE 2"])).toBe("Kitsune 3");
    expect(suggestNickname("A".repeat(20), ["A".repeat(20)])).toHaveLength(20);
  });
});
