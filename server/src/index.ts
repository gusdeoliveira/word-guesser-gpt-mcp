import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { MAX_ATTEMPTS, WORD_LENGTH } from "../../shared/game.js";
import { checkGuess, puzzleKeyForTimezone, selectLocale } from "./game.js";

const APP_VERSION = "0.1.0";
const RESOURCE_URI = "ui://word-guesser/game-v1.html";
const MCP_PATH = "/mcp";
const port = Number(process.env.PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const widgetPath = resolve(here, "../../dist/web/index.html");
const publicDir = resolve(here, "../../public");
const widgetDomain = process.env.WIDGET_DOMAIN
  ? new URL(process.env.WIDGET_DOMAIN).origin
  : undefined;
const productionWidgetHtml = process.env.NODE_ENV === "production"
  ? await readFile(widgetPath, "utf8")
  : undefined;

const localeSchema = z.enum(["en", "pt-BR"]);
const letterStateSchema = z.enum(["correct", "present", "absent"]);

const openGameOutputSchema = z.object({
  kind: z.literal("word_game"),
  locale: localeSchema,
  puzzleKey: z.string(),
  wordLength: z.literal(WORD_LENGTH),
  maxAttempts: z.literal(MAX_ATTEMPTS),
  stateVersion: z.string(),
});

const guessOutputSchema = z.object({
  kind: z.literal("guess_result"),
  accepted: z.boolean(),
  locale: localeSchema,
  puzzleKey: z.string(),
  attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
  guess: z.string(),
  evaluation: z.array(letterStateSchema).optional(),
  isWin: z.boolean(),
  isComplete: z.boolean(),
  answer: z.string().optional(),
  message: z.enum(["accepted", "five_letters", "not_in_word_list"]),
  stateVersion: z.string(),
});

type ClientMeta = {
  "openai/userLocation"?: { country?: string; timezone?: string };
};

async function loadWidgetHtml(): Promise<string> {
  if (productionWidgetHtml) return productionWidgetHtml;
  try {
    return await readFile(widgetPath, "utf8");
  } catch {
    return `<!doctype html><html><body><main style="font-family:system-ui;padding:24px"><h2>Widget not built</h2><p>Run <code>npm run build:web</code>, then refresh the app.</p></main></body></html>`;
  }
}

async function servePublicFile(
  response: import("node:http").ServerResponse,
  filename: string,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  try {
    const body = await readFile(resolve(publicDir, filename));
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": cacheControl,
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function createWordGuesserServer() {
  const server = new McpServer(
    { name: "word-guesser", version: APP_VERSION },
    {
      instructions:
        "Use open_word_game whenever the user asks to play, start, or continue Word Guesser or a five-letter word game. The widget owns progress locally. Guess validation is available only to the app UI.",
    },
  );

  registerAppResource(
    server,
    "Word Guesser game",
    RESOURCE_URI,
    { description: "Word Guesser is an interactive five-letter guessing game for ChatGPT." },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await loadWidgetHtml(),
          _meta: {
            ui: {
              prefersBorder: false,
              ...(widgetDomain ? { domain: widgetDomain } : {}),
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription":
              "An interactive six-attempt word grid with an on-screen keyboard, local progress, and English or Brazilian Portuguese play.",
            "openai/widgetPrefersBorder": false,
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "open_word_game",
    {
      title: "Open Word Guesser",
      description:
        "Use this when the user wants to play, start, resume, or open Word Guesser, a five-letter word guessing game.",
      inputSchema: {
        language: z
          .enum(["auto", "en", "pt-BR"])
          .optional()
          .describe("Use auto unless the user explicitly requests English or Brazilian Portuguese."),
      },
      outputSchema: openGameOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": RESOURCE_URI,
        "openai/toolInvocation/invoking": "Opening today’s puzzle…",
        "openai/toolInvocation/invoked": "Puzzle ready",
      },
    },
    async ({ language }, extra) => {
      const meta = (extra as { _meta?: ClientMeta })._meta;
      const location = meta?.["openai/userLocation"];
      const locale = selectLocale(language, location?.country);
      const puzzleKey = puzzleKeyForTimezone(location?.timezone);
      const structuredContent = {
        kind: "word_game" as const,
        locale,
        puzzleKey,
        wordLength: WORD_LENGTH as 5,
        maxAttempts: MAX_ATTEMPTS as 6,
        stateVersion: `${locale}:${puzzleKey}:open`,
      };

      return {
        structuredContent,
        content: [
          {
            type: "text" as const,
            text:
              locale === "pt-BR"
                ? "Abri o desafio de hoje do Word Guesser. O progresso fica salvo localmente."
                : "Opened today’s Word Guesser puzzle. Progress is saved locally.",
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    "submit_word_guess",
    {
      title: "Check a word guess",
      description:
        "Use this only from the game widget to validate one five-letter guess and return its letter-by-letter result.",
      inputSchema: {
        locale: localeSchema,
        puzzleKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
        guess: z.string().min(1).max(16),
      },
      outputSchema: guessOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: { visibility: ["app"] },
        "openai/toolInvocation/invoking": "Checking guess…",
        "openai/toolInvocation/invoked": "Guess checked",
      },
    },
    async ({ locale, puzzleKey, attempt, guess }) => {
      const result = checkGuess(locale, puzzleKey, guess);
      const isComplete = result.accepted && (result.isWin || attempt === MAX_ATTEMPTS);
      const answer = isComplete ? result.answer : undefined;
      const structuredContent = {
        kind: "guess_result" as const,
        accepted: result.accepted,
        locale,
        puzzleKey,
        attempt,
        guess: result.guess,
        ...(result.accepted ? { evaluation: result.evaluation } : {}),
        isWin: result.accepted ? result.isWin : false,
        isComplete,
        ...(answer ? { answer } : {}),
        message: result.accepted ? ("accepted" as const) : result.message,
        stateVersion: `${locale}:${puzzleKey}:${attempt}:${result.guess}`,
      };

      return {
        structuredContent,
        content: [
          {
            type: "text" as const,
            text: result.accepted ? "Guess checked." : "That guess was not accepted.",
          },
        ],
      };
    },
  );

  return server;
}

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/docs")) {
    await servePublicFile(
      response,
      "docs.html",
      "text/html; charset=utf-8",
      "public, max-age=300",
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/privacy") {
    await servePublicFile(
      response,
      "privacy.html",
      "text/html; charset=utf-8",
      "public, max-age=300",
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/terms") {
    await servePublicFile(
      response,
      "terms.html",
      "text/html; charset=utf-8",
      "public, max-age=300",
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    await servePublicFile(response, "favicon.ico", "image/x-icon", "public, max-age=86400");
    return;
  }

  if (request.method === "GET" && url.pathname === "/logo.svg") {
    await servePublicFile(
      response,
      "logo.svg",
      "image/svg+xml; charset=utf-8",
      "public, max-age=86400",
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, app: "word-guesser", mcp: MCP_PATH }));
    return;
  }

  if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    response.end();
    return;
  }

  // Stateless JSON responses need no standalone event stream. Explicitly decline
  // GET so Functions does not keep an idle proxy connection open waiting for events.
  if (url.pathname === MCP_PATH && request.method === "GET") {
    response.writeHead(405, {
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      Allow: "POST, OPTIONS",
    });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "This stateless MCP endpoint accepts POST requests." },
      id: null,
    }));
    return;
  }

  if (url.pathname === MCP_PATH && ["POST", "DELETE"].includes(request.method ?? "")) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createWordGuesserServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) response.writeHead(500).end("Internal server error");
    }
    return;
  }

  response.writeHead(404).end("Not found");
});

httpServer.listen(port, () => {
  console.log(`Word Guesser MCP server: http://localhost:${port}${MCP_PATH}`);
});
