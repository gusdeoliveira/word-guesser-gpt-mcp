import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { CheckCircleFilled, Globe, Question, Reload, TrophyTop, X } from "@openai/apps-sdk-ui/components/Icon";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import {
  MAX_ATTEMPTS,
  WORD_LENGTH,
  evaluateGuess,
  isWinningEvaluation,
  normalizeWord,
  stableWordIndex,
  type GameLocale,
  type LetterState,
} from "../../shared/game.js";
import { parseFiveLetterWordList } from "../../shared/word-list.js";
import englishWordSource from "../../words_en.txt?raw";
import portugueseWordSource from "../../words_pt.txt?raw";
import { callGuessTool, createGameBridge, type BridgeStatus, type ToolPayload } from "./bridge.js";
import { t } from "./i18n.js";
import type { GameProgress, GuessPayload, GuessRow, OpenGamePayload } from "./types.js";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const STANDALONE_WORDS: Record<GameLocale, readonly string[]> = {
  en: parseFiveLetterWordList(englishWordSource),
  "pt-BR": parseFiveLetterWordList(portugueseWordSource),
};
const STANDALONE_ALLOWED: Record<GameLocale, ReadonlySet<string>> = {
  en: new Set(STANDALONE_WORDS.en),
  "pt-BR": new Set(STANDALONE_WORDS["pt-BR"]),
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(locale: GameLocale, puzzleKey: string) {
  return `word-guesser:v1:${locale}:${puzzleKey}`;
}

function emptyProgress(locale: GameLocale, puzzleKey: string): GameProgress {
  return {
    cacheKey: cacheKey(locale, puzzleKey),
    locale,
    puzzleKey,
    rows: [],
    status: "playing",
    updatedAt: Date.now(),
  };
}

function isProgress(value: unknown, key: string): value is GameProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameProgress>;
  return candidate.cacheKey === key && Array.isArray(candidate.rows);
}

function readProgress(locale: GameLocale, puzzleKey: string): GameProgress {
  const key = cacheKey(locale, puzzleKey);
  if (isProgress(window.openai?.widgetState, key)) return window.openai.widgetState;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (isProgress(parsed, key)) return parsed;
    }
  } catch {
    // Local storage may be unavailable in privacy-restricted iframe contexts.
  }
  return emptyProgress(locale, puzzleKey);
}

function writeProgress(progress: GameProgress) {
  try {
    localStorage.setItem(progress.cacheKey, JSON.stringify(progress));
  } catch {
    // ChatGPT widget state still provides a widget-scoped persistence fallback.
  }
  window.openai?.setWidgetState?.(progress);
}

function standaloneGuess(locale: GameLocale, puzzleKey: string, attempt: number, guessValue: string): GuessPayload {
  const guess = normalizeWord(guessValue);
  if (guess.length !== WORD_LENGTH) {
    return {
      kind: "guess_result",
      accepted: false,
      locale,
      puzzleKey,
      attempt,
      guess,
      isWin: false,
      isComplete: false,
      message: "five_letters",
      stateVersion: `${locale}:${puzzleKey}:${attempt}:${guess}`,
    };
  }
  if (!STANDALONE_ALLOWED[locale].has(guess)) {
    return {
      kind: "guess_result",
      accepted: false,
      locale,
      puzzleKey,
      attempt,
      guess,
      isWin: false,
      isComplete: false,
      message: "not_in_word_list",
      stateVersion: `${locale}:${puzzleKey}:${attempt}:${guess}`,
    };
  }
  const words = STANDALONE_WORDS[locale];
  const answer = words[stableWordIndex(`${locale}:${puzzleKey}`, words.length)]!;
  const evaluation = evaluateGuess(guess, answer);
  const isWin = isWinningEvaluation(evaluation);
  const isComplete = isWin || attempt === MAX_ATTEMPTS;
  return {
    kind: "guess_result",
    accepted: true,
    locale,
    puzzleKey,
    attempt,
    guess,
    evaluation,
    isWin,
    isComplete,
    ...(isComplete ? { answer } : {}),
    message: "accepted",
    stateVersion: `${locale}:${puzzleKey}:${attempt}:${guess}`,
  };
}

function mergeKeyState(rows: GuessRow[]) {
  const rank: Record<LetterState, number> = { absent: 1, present: 2, correct: 3 };
  const states = new Map<string, LetterState>();
  for (const row of rows) {
    row.guess.split("").forEach((letter, index) => {
      const next = row.evaluation[index]!;
      const current = states.get(letter);
      if (!current || rank[next] > rank[current]) states.set(letter, next);
    });
  }
  return states;
}

function Tile({ letter = "", state, active, delay = 0 }: { letter?: string; state?: LetterState; active?: boolean; delay?: number }) {
  return (
    <div
      className="tile"
      data-state={state ?? "empty"}
      data-active={active && letter ? "true" : "false"}
      style={{ "--tile-delay": `${delay}ms` } as React.CSSProperties}
      aria-label={state ? `${letter}: ${state}` : letter || "empty"}
    >
      {letter}
    </div>
  );
}

export function App() {
  const initialPayload: OpenGamePayload = {
    kind: "word_game",
    locale: "en",
    puzzleKey: todayKey(),
    wordLength: 5,
    maxAttempts: 6,
    stateVersion: "standalone:open",
  };
  const initialHostPayload = window.openai?.toolOutput as ToolPayload | undefined;
  const [openPayload, setOpenPayload] = useState<OpenGamePayload>(
    initialHostPayload?.kind === "word_game" ? initialHostPayload : initialPayload,
  );
  const [locale, setLocale] = useState<GameLocale>(openPayload.locale);
  const [progress, setProgress] = useState(() => readProgress(openPayload.locale, openPayload.puzzleKey));
  const [currentGuess, setCurrentGuess] = useState("");
  const [notice, setNotice] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(window.parent === window ? "standalone" : "connecting");
  const appRef = useRef<McpApp | null>(null);
  const payloadHandler = useRef<(payload: ToolPayload) => void>(() => undefined);
  const text = t(locale);

  payloadHandler.current = (payload) => {
    if (payload.kind === "word_game") {
      setOpenPayload(payload);
      setLocale(payload.locale);
    }
  };

  useEffect(() => {
    const bridge = createGameBridge((payload) => payloadHandler.current(payload));
    appRef.current = bridge.app;
    setBridgeStatus(bridge.status);
    if (!bridge.app) return;
    void bridge
      .connect()
      .then(() => setBridgeStatus("connected"))
      .catch(() => setBridgeStatus("error"));
  }, []);

  useEffect(() => {
    setProgress(readProgress(locale, openPayload.puzzleKey));
    setCurrentGuess("");
    setNotice("");
  }, [locale, openPayload.puzzleKey]);

  useEffect(() => {
    writeProgress(progress);
  }, [progress]);

  const keyboardStates = useMemo(() => mergeKeyState(progress.rows), [progress.rows]);
  const visibleNotice =
    notice ||
    (progress.status === "won"
      ? text.won
      : progress.status === "lost" && progress.answer
        ? `${text.lost} ${progress.answer}.`
        : "");

  const commitGuess = useCallback(async () => {
    if (isChecking || progress.status !== "playing") return;
    if (currentGuess.length !== WORD_LENGTH) {
      setNotice(text.fiveLetters);
      setShake((value) => value + 1);
      return;
    }
    setIsChecking(true);
    setNotice(text.checking);
    const attempt = progress.rows.length + 1;
    try {
      const result = appRef.current
        ? await callGuessTool(appRef.current, {
            locale,
            puzzleKey: openPayload.puzzleKey,
            attempt,
            guess: currentGuess,
          })
        : standaloneGuess(locale, openPayload.puzzleKey, attempt, currentGuess);

      if (!result.accepted || !result.evaluation) {
        setNotice(result.message === "not_in_word_list" ? text.notInList : text.fiveLetters);
        setShake((value) => value + 1);
        return;
      }

      const nextRows = [...progress.rows, { guess: result.guess, evaluation: result.evaluation }];
      const nextProgress: GameProgress = {
        ...progress,
        rows: nextRows,
        status: result.isWin ? "won" : result.isComplete ? "lost" : "playing",
        ...(result.answer ? { answer: result.answer } : {}),
        updatedAt: Date.now(),
      };
      setProgress(nextProgress);
      setCurrentGuess("");
      setNotice(result.isWin ? text.won : result.isComplete ? `${text.lost} ${result.answer}.` : "");
      void appRef.current?.updateModelContext({
        structuredContent: {
          game: "five-letter-word",
          locale,
          attempt,
          guesses: nextRows.map((row) => row.guess),
          status: nextProgress.status,
        },
      });
    } catch {
      setNotice(text.bridgeError);
      setBridgeStatus("error");
    } finally {
      setIsChecking(false);
    }
  }, [currentGuess, isChecking, locale, openPayload.puzzleKey, progress, text]);

  const typeLetter = useCallback(
    (key: string) => {
      if (isChecking || progress.status !== "playing") return;
      if (key === "ENTER") {
        void commitGuess();
        return;
      }
      if (key === "BACKSPACE") {
        setCurrentGuess((value) => value.slice(0, -1));
        setNotice("");
        return;
      }
      const letter = normalizeWord(key).slice(0, 1);
      if (letter) {
        setCurrentGuess((value) => (value.length < WORD_LENGTH ? value + letter : value));
        setNotice("");
      }
    },
    [commitGuess, isChecking, progress.status],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || helpOpen) return;
      if (event.key === "Enter") typeLetter("ENTER");
      else if (event.key === "Backspace") typeLetter("BACKSPACE");
      else if (/^[a-zA-ZÀ-ÿ]$/.test(event.key)) typeLetter(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, typeLetter]);

  const switchLocale = () => setLocale((value) => (value === "en" ? "pt-BR" : "en"));
  const reset = () => {
    const next = emptyProgress(locale, openPayload.puzzleKey);
    setProgress(next);
    setCurrentGuess("");
    setNotice("");
  };

  const rows = Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
    const submitted = progress.rows[rowIndex];
    const isCurrent = rowIndex === progress.rows.length && progress.status === "playing";
    return Array.from({ length: WORD_LENGTH }, (_, columnIndex) => {
      const letter = submitted?.guess[columnIndex] ?? (isCurrent ? currentGuess[columnIndex] : "") ?? "";
      return (
        <Tile
          key={`${rowIndex}-${columnIndex}`}
          letter={letter}
          {...(submitted?.evaluation[columnIndex]
            ? { state: submitted.evaluation[columnIndex] }
            : {})}
          active={isCurrent}
          delay={columnIndex * 75}
        />
      );
    });
  });

  return (
    <main className="game-shell">
      <header className="game-header">
        <h1 className="sr-only">{text.title}</h1>
        <div className="header-actions">
          <Button
            color="secondary"
            variant="ghost"
            size="sm"
            className="language-button"
            aria-label={`${text.switchLanguage} (${locale === "pt-BR" ? "BR" : "EN"})`}
            onClick={switchLocale}
          >
            <Globe aria-hidden="true" />
            <span className="language-code">{locale === "pt-BR" ? "BR" : "EN"}</span>
          </Button>
          <Button color="secondary" variant="ghost" size="sm" uniform aria-label={text.help} onClick={() => setHelpOpen(true)}>
            <Question />
          </Button>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {text.attempt} {progress.status === "playing" ? Math.min(progress.rows.length + 1, MAX_ATTEMPTS) : progress.rows.length} {text.of} {MAX_ATTEMPTS}
      </p>

      <section className={`board ${shake ? "shake" : ""}`} key={shake} aria-label={text.instruction}>
        {rows}
      </section>

      <div className="notice" data-visible={Boolean(visibleNotice)} aria-live="assertive">
        {progress.status === "won" && <TrophyTop aria-hidden="true" />}
        {progress.status === "lost" && <CheckCircleFilled aria-hidden="true" />}
        <span>{visibleNotice || "\u00A0"}</span>
      </div>

      <section className="keyboard" aria-label="Keyboard">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div className="keyboard-row" key={row}>
            {rowIndex === 2 && (
              <button className="key key-wide" type="button" onClick={() => typeLetter("ENTER")} aria-label={text.enter} disabled={isChecking || progress.status !== "playing"}>
                {text.enter}
              </button>
            )}
            {row.split("").map((letter) => (
              <button
                className="key"
                data-state={keyboardStates.get(letter) ?? "unused"}
                type="button"
                key={letter}
                onClick={() => typeLetter(letter)}
                aria-label={letter}
                disabled={isChecking || progress.status !== "playing"}
              >
                {letter}
              </button>
            ))}
            {rowIndex === 2 && (
              <button className="key key-wide key-icon" type="button" onClick={() => typeLetter("BACKSPACE")} aria-label={text.delete} disabled={isChecking || progress.status !== "playing"}>
                ⌫
              </button>
            )}
          </div>
        ))}
      </section>

      <footer className="game-footer">
        <Button color="secondary" variant="ghost" size="xs" onClick={reset}>
          <Reload />{text.reset}
        </Button>
      </footer>

      {bridgeStatus === "error" && <p className="bridge-warning">{text.bridgeError}</p>}

      {helpOpen && (
        <div className="help-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <aside className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <Button color="secondary" variant="ghost" size="sm" uniform className="help-close" aria-label={text.close} onClick={() => setHelpOpen(false)}>
              <X />
            </Button>
            <span className="help-mark"><Question aria-hidden="true" /></span>
            <h2 id="help-title">{text.helpTitle}</h2>
            <p>{text.helpBody}</p>
            <ul>
              <li><span className="legend-tile correct">A</span>{text.correct}</li>
              <li><span className="legend-tile present">B</span>{text.present}</li>
              <li><span className="legend-tile absent">C</span>{text.absent}</li>
            </ul>
          </aside>
        </div>
      )}
    </main>
  );
}
