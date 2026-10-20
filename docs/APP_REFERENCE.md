# Word Guesser app reference

Last updated: 2026-10-01

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

The cached snapshot contains submitted rows, status, optional completed-game answer, and update time. Guess validation remains authoritative on the server in ChatGPT mode. Standalone browser mode bundles the same normalized lists for local UI development.

## Word lists

The source dictionaries are:

- `words_en.txt`
- `words_pt.txt`

At startup/build time, both lists are normalized to five uppercase A-Z letters and deduplicated. The current sets contain 2,332 English entries and 5,427 unique Brazilian Portuguese entries after normalization. The same entries serve as possible daily answers and accepted guesses.

Portuguese input uses Unicode NFD normalization, so a typed word such as `TÊNIS` compares as `TENIS`. Completed answers are displayed in normalized form. Before public submission, review answer suitability and document the source/license for both dictionaries.

## Visual system

- Single visual anchor: the 5 × 6 letter board.
- The default screen keeps static chrome to controls only; the game title, instructions, and attempt count remain available to assistive technology.
- Validation, connection, win, and loss messages appear only when they are actionable.
- The header uses the Apps SDK circled question-mark glyph for help and shows the active language as `EN` or `BR`.
- Apps SDK and MCP host theme values are applied to the document so light/dark control states retain readable contrast.
- One green success/accent color, amber for present letters, neutral gray for absent letters.
- ChatGPT Apps SDK UI provides button styling, tokens, and icons.
- Motion is limited to first render, tile entry, result flip, invalid-input shake, and help-panel reveal.
- Dark mode follows the host/browser color scheme and reduced-motion preferences are honored.

## Public submission pages

The MCP origin also serves the public pages and assets required for app review:

- `/` and `/docs`: English developer documentation for the app's tools and widget.
- `/privacy`: data handling, local persistence, infrastructure, and user-choice disclosures.
- `/terms`: the app's terms of use.
- `/favicon.ico` and `/logo.svg`: shared 11 Feed publisher branding.

The public pages identify Gustavo de Oliveira Soares Silva, trading as 11 Feed, as the
operator and use `support@11feed.com` for privacy, legal, and support contact.

## Production follow-ups

- Review answer suitability and document the word-list sources/licenses.
- Add abuse-safe request logging and latency/error metrics for `/mcp`.
- Complete OpenAI domain verification and public submission packaging.
- Re-run ChatGPT Developer Mode tests on web and mobile after every SDK upgrade.
- Revisit dependency audit findings as upstream MCP and Apps SDK UI releases land.

## Azure hosting

Azure Functions hosts the stateless MCP server on Linux Flex Consumption using the
self-hosted MCP custom-handler preview and Node 22. The configured origin is
`https://func-word-guesser-6e5da.azurewebsites.net`; the MCP path remains `/mcp`,
and public pages have no `/api` prefix. Standalone MCP GET event streams return
HTTP 405; JSON-RPC requests and notifications use POST.

`npm run build:azure` compiles the server and stages its widget, public pages and
dictionaries in `dist/azure`. Production dependencies are installed there before
`scripts/publish-azure.ps1` packages and uploads them through Flex OneDeploy.
`WIDGET_DOMAIN` supplies the UI resource's dedicated origin. Production startup
fails if the bundled widget is missing.

Infrastructure is reproducible through `infra/main.bicep` and uses resource group
`rg-word-guesser-brazilsouth` and managed identity storage access. Only the Function App,
Flex Consumption plan and required storage account are retained. Application Insights,
Log Analytics and their alert resources are not configured, so application telemetry
is not sent to an Azure monitoring workspace. Functions execution and storage remain usage billed.
The public game requires no login. Public OpenAI submission and real ChatGPT
web/mobile UI testing remain separate from deployment verification.
