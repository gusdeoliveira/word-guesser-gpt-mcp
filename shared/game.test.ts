import { describe, expect, it } from "vitest";
import { evaluateGuess, normalizeWord, stableWordIndex } from "./game.js";

describe("normalizeWord", () => {
  it("normalizes Portuguese accents", () => {
    expect(normalizeWord("tênis")).toBe("TENIS");
  });
});

describe("evaluateGuess", () => {
  it("marks exact matches", () => {
    expect(evaluateGuess("crane", "crane")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("does not over-count duplicate letters", () => {
    expect(evaluateGuess("array", "cigar")).toEqual([
      "absent",
      "present",
      "absent",
      "correct",
      "absent",
    ]);
  });
});

describe("stableWordIndex", () => {
  it("is deterministic and stays in bounds", () => {
    const first = stableWordIndex("en:2026-07-21", 12);
    expect(stableWordIndex("en:2026-07-21", 12)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(12);
  });
});
