# Five Letters — ChatGPT word game

An interactive five-letter guessing game for ChatGPT. Players get six attempts, Wordle-style letter feedback, a physical/on-screen keyboard, and local progress persistence. The app defaults to English and selects Brazilian Portuguese when ChatGPT supplies `BR` in the coarse user-location hint. Players can switch languages at any time.

This is an `interactive-decoupled` ChatGPT app:

- `server/` contains a stateless TypeScript MCP server.
- `web/` contains a React widget bundled into one CSP-friendly HTML resource.
- `shared/` contains game rules used by the server, widget fallback, and tests.
- `docs/APP_REFERENCE.md` is the durable implementation/product reference.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0`.

```bash
npm install
npm run build
npm start
```

The server exposes:

- health: `http://localhost:8787/health`
- MCP: `http://localhost:8787/mcp`

For standalone widget development, run:

```bash
npm run dev:web
```

Then open `http://localhost:5173`. Standalone mode bundles the same English and Brazilian Portuguese word lists used by the MCP server; ChatGPT mode validates guesses through the MCP tool.

Useful checks:

```bash
npm run typecheck
npm test
npm run build:web
```

## Connect to ChatGPT

1. Build and start the server locally.
2. Expose port `8787` through a public HTTPS tunnel, for example `ngrok http 8787`.
3. In ChatGPT, enable Developer mode under **Settings → Security and login**.
4. Open **Settings → Plugins** (or `chatgpt.com/plugins`), create a developer-mode app, and paste `https://YOUR-TUNNEL.example/mcp`.
5. Add the app to a new chat and ask: “Let’s play the five-letter word game.”
6. Refresh the app in its ChatGPT settings after changing MCP tools or metadata.

No OpenAI API key is required: ChatGPT is the host and the app only exposes MCP tools plus a widget.

## Current package baseline

Versions were resolved from npm on 2026-07-21 and pinned exactly for reproducibility:

| Package | Version |
| --- | ---: |
| `@modelcontextprotocol/sdk` | 1.29.0 |
| `@modelcontextprotocol/ext-apps` | 1.7.4 |
| `@openai/apps-sdk-ui` | 0.2.2 |
| React / React DOM | 19.2.8 |
| Vite | 8.1.5 |
| TypeScript | 7.0.2 |
| Zod | 4.4.3 |
| Tailwind CSS | 4.3.3 |

## Official references

- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart/)
- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server/)
- [Build the ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui/)
- [Apps SDK examples](https://developers.openai.com/apps-sdk/build/examples/)
- [Design tools](https://developers.openai.com/apps-sdk/plan/tools/)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference/)
- [Managing state](https://developers.openai.com/apps-sdk/build/state-management/)
- [OpenAI Apps SDK UI](https://github.com/openai/apps-sdk-ui)

## Security note

`npm audit --omit=dev` currently reports advisories in the latest pinned MCP/UI dependency trees. The app does not use Hono's affected `serve-static` path or lodash's affected template/unset APIs, and there is no non-breaking upstream fix available for the Apps SDK UI lodash dependency at this baseline. Re-run the audit when upgrading dependencies and replace the pinned versions only after the build and MCP checks pass.
