import type { GameLocale } from "../../shared/game.js";
import { evaluateGuess, isWinningEvaluation, normalizeWord, stableWordIndex } from "../../shared/game.js";
import { ENGLISH_ALLOWED, ENGLISH_ANSWERS } from "./words/en.js";
import { PORTUGUESE_ALLOWED, PORTUGUESE_ANSWERS } from "./words/pt-BR.js";

const answers: Record<GameLocale, readonly string[]> = {
  en: ENGLISH_ANSWERS,
  "pt-BR": PORTUGUESE_ANSWERS,
};

const allowedWords: Record<GameLocale, ReadonlySet<string>> = {
  en: new Set(ENGLISH_ALLOWED),
  "pt-BR": new Set(PORTUGUESE_ALLOWED),
};

export function selectLocale(
  requested: "auto" | GameLocale | undefined,
  country: string | undefined,
): GameLocale {
  if (requested && requested !== "auto") return requested;
  return country?.toUpperCase() === "BR" ? "pt-BR" : "en";
}

export function puzzleKeyForTimezone(timezone: string | undefined, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function answerFor(locale: GameLocale, puzzleKey: string): string {
  const list = answers[locale];
  return list[stableWordIndex(`${locale}:${puzzleKey}`, list.length)]!;
}

export function checkGuess(locale: GameLocale, puzzleKey: string, guessValue: string) {
  const guess = normalizeWord(guessValue);
  if (guess.length !== 5) {
    return { accepted: false as const, guess, message: "five_letters" as const };
  }
  if (!allowedWords[locale].has(guess)) {
    return { accepted: false as const, guess, message: "not_in_word_list" as const };
  }

  const answer = answerFor(locale, puzzleKey);
  const evaluation = evaluateGuess(guess, answer);
  return {
    accepted: true as const,
    guess,
    evaluation,
    isWin: isWinningEvaluation(evaluation),
    answer,
  };
}
