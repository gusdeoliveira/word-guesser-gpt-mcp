# Five Letters app reference

Last updated: 2026-07-21

## Product contract

- Five-letter daily puzzle, maximum six accepted guesses.
- English by default.
- Brazilian Portuguese when ChatGPT's best-effort `_meta["openai/userLocation"].country` equals `BR`.
- Explicit language requests and the in-widget language switch override the automatic default.
- Progress is local: browser `localStorage` is the durable device cache; `window.openai.widgetState` mirrors the current widget snapshot for ChatGPT lifecycle persistence.
- No login, database, external API, or OpenAI API key is required in v0.1.

## Tool contract

### `open_word_game`

Model- and app-visible render tool. It selects the locale and date key and opens `ui://word-guesser/game-v1.html`.

Input:

```json
{ "language": "auto | en | pt-BR" }
```

Output is concise and model-visible: locale, puzzle key, word length, attempt limit, and a deterministic state-version token. The answer is never returned.

### `submit_word_guess`

App-only validation tool. It is intentionally separate from the render tool so repeated guesses update the mounted widget without remounting it.

Input:

```json
{
  "locale": "en | pt-BR",
  "puzzleKey": "YYYY-MM-DD",
  "attempt": 1,
  "guess": "CRANE"
}
```

The handler is stateless and retry-safe. The answer is derived deterministically from locale + puzzle key. It is returned only after a win or the sixth accepted attempt.

## State and cache

Each puzzle has its own cache key:

```text
word-guesser:v1:<locale>:<YYYY-MM-DD>
```

The cached snapshot contains submitted rows, status, optional completed-game answer, and update time. Guess validation remains authoritative on the server in ChatGPT mode. Standalone browser mode uses a clearly limited local fallback list for UI development.

## Replacing the placeholder word lists

Replace the arrays in:

- `server/src/words/en.ts`
- `server/src/words/pt-BR.ts`

Keep these rules:

1. Store exactly five normalized A-Z letters per entry.
2. Put possible daily answers in `*_ANSWERS`.
3. Put every accepted guess in `*_ALLOWED`; the answer list must be included.
4. Remove duplicates after normalization.
5. Keep offensive, extremely obscure, proper-name, and regionally ambiguous words out of the answer list.
6. Add word-list license/source notes before shipping a third-party list.

Portuguese input is normalized with Unicode NFD, so a typed word such as `TÊNIS` compares as `TENIS`. Decide whether the future curated list should display accents after a completed puzzle; the placeholder implementation displays the normalized form.

## Visual system

- Single visual anchor: the 5 × 6 letter board.
- One green success/accent color, amber for present letters, neutral gray for absent letters.
- ChatGPT Apps SDK UI provides button styling, tokens, and icons.
- Motion is limited to first render, tile entry, result flip, invalid-input shake, and help-panel reveal.
- Dark mode follows the host/browser color scheme and reduced-motion preferences are honored.

## Production follow-ups

- Replace and license the placeholder word lists.
- Add abuse-safe request logging and latency/error metrics for `/mcp`.
- Host behind a stable HTTPS endpoint with streaming-friendly proxy settings.
- Set `_meta.ui.domain` to the final unique widget origin before public submission.
- Re-run ChatGPT Developer Mode tests on web and mobile after every SDK upgrade.
- Revisit dependency audit findings as upstream MCP and Apps SDK UI releases land.
