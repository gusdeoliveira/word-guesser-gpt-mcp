export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;

export type GameLocale = "en" | "pt-BR";
export type LetterState = "correct" | "present" | "absent";

export function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, WORD_LENGTH);
}

export function evaluateGuess(guessValue: string, answerValue: string): LetterState[] {
  const guess = normalizeWord(guessValue);
  const answer = normalizeWord(answerValue);

  if (guess.length !== WORD_LENGTH || answer.length !== WORD_LENGTH) {
    throw new Error(`Guess and answer must both contain ${WORD_LENGTH} letters.`);
  }

  const result: LetterState[] = Array.from({ length: WORD_LENGTH }, () => "absent");
  const remaining = new Map<string, number>();

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (guess[index] === answer[index]) {
      result[index] = "correct";
    } else {
      const answerLetter = answer[index]!;
      remaining.set(answerLetter, (remaining.get(answerLetter) ?? 0) + 1);
    }
  }

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (result[index] === "correct") continue;
    const letter = guess[index]!;
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(letter, count - 1);
    }
  }

  return result;
}

export function isWinningEvaluation(evaluation: LetterState[]): boolean {
  return evaluation.every((state) => state === "correct");
}

export function stableWordIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}
