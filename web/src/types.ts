import type { GameLocale, LetterState } from "../../shared/game.js";

export type OpenGamePayload = {
  kind: "word_game";
  locale: GameLocale;
  puzzleKey: string;
  wordLength: 5;
  maxAttempts: 6;
  stateVersion: string;
};

export type GuessPayload = {
  kind: "guess_result";
  accepted: boolean;
  locale: GameLocale;
  puzzleKey: string;
  attempt: number;
  guess: string;
  evaluation?: LetterState[];
  isWin: boolean;
  isComplete: boolean;
  answer?: string;
  message: "accepted" | "five_letters" | "not_in_word_list";
  stateVersion: string;
};

export type GuessRow = {
  guess: string;
  evaluation: LetterState[];
};

export type GameProgress = {
  cacheKey: string;
  locale: GameLocale;
  puzzleKey: string;
  rows: GuessRow[];
  status: "playing" | "won" | "lost";
  answer?: string;
  updatedAt: number;
};

declare global {
  interface Window {
    openai?: {
      theme?: "light" | "dark";
      toolOutput?: unknown;
      widgetState?: unknown;
      setWidgetState?: (state: unknown) => void;
    };
  }
}
