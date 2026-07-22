import { describe, expect, it } from "vitest";
import { answerFor, checkGuess, puzzleKeyForTimezone, selectLocale } from "./game.js";

describe("locale selection", () => {
  it("defaults to Portuguese only for Brazil", () => {
    expect(selectLocale("auto", "BR")).toBe("pt-BR");
    expect(selectLocale(undefined, "US")).toBe("en");
    expect(selectLocale(undefined, undefined)).toBe("en");
  });

  it("respects an explicit language", () => {
    expect(selectLocale("en", "BR")).toBe("en");
    expect(selectLocale("pt-BR", "US")).toBe("pt-BR");
  });
});

describe("daily puzzle", () => {
  it("selects a stable five-letter answer", () => {
    expect(answerFor("en", "2026-07-21")).toHaveLength(5);
    expect(answerFor("en", "2026-07-21")).toBe(answerFor("en", "2026-07-21"));
  });

  it("rejects unknown placeholder words without consuming an attempt", () => {
    expect(checkGuess("en", "2026-07-21", "ZZZZZ")).toMatchObject({
      accepted: false,
      message: "not_in_word_list",
    });
  });

  it("uses the requested timezone for the date key", () => {
    const date = new Date("2026-01-01T01:00:00Z");
    expect(puzzleKeyForTimezone("America/Sao_Paulo", date)).toBe("2025-12-31");
  });
});
