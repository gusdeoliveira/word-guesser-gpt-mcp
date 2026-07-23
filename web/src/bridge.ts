import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GuessPayload, OpenGamePayload } from "./types.js";

export type BridgeStatus = "connecting" | "connected" | "standalone" | "error";
export type ToolPayload = OpenGamePayload | GuessPayload;

type HostContext = ReturnType<App["getHostContext"]>;

function applyHostContext(context: HostContext) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}

function payloadFromResult(result: CallToolResult | undefined): ToolPayload | undefined {
  const payload = result?.structuredContent;
  if (!payload || typeof payload !== "object" || !("kind" in payload)) return undefined;
  return payload as ToolPayload;
}

export function createGameBridge(onPayload: (payload: ToolPayload) => void) {
  if (window.parent === window) {
    return { app: null, status: "standalone" as const, connect: async () => undefined };
  }

  const app = new App(
    { name: "word-guesser-widget", version: "0.1.0" },
    {},
    { autoResize: true, strict: true },
  );
  app.ontoolresult = (params) => {
    const payload = payloadFromResult(params);
    if (payload) onPayload(payload);
  };
  app.onhostcontextchanged = applyHostContext;

  return {
    app,
    status: "connecting" as const,
    connect: async () => {
      await app.connect();
      applyHostContext(app.getHostContext());
    },
  };
}

export async function callGuessTool(
  app: App,
  input: { locale: "en" | "pt-BR"; puzzleKey: string; attempt: number; guess: string },
): Promise<GuessPayload> {
  const result = await app.callServerTool({ name: "submit_word_guess", arguments: input });
  const payload = payloadFromResult(result);
  if (!payload || payload.kind !== "guess_result") throw new Error("Invalid guess response.");
  return payload;
}
