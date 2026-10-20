import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://localhost:8790");
const mcp = new URL("/mcp", origin);
let nextId = 1;
async function rpc(method, params) {
  const response = await fetch(mcp, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, method + ": HTTP " + response.status);
  const envelope = await response.json();
  assert.equal(envelope.error, undefined, JSON.stringify(envelope.error));
  return envelope.result;
}
for (const path of ["/health", "/", "/docs", "/privacy", "/terms", "/logo.svg", "/favicon.ico"]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, path);
}
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "word-guesser-deployment-check", version: "1.0.0" },
});
assert.equal(init.serverInfo.name, "word-guesser");
const initialized = await fetch(mcp, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  signal: AbortSignal.timeout(60000),
});
assert.equal(initialized.status, 202, "Initialization notification is accepted");
const { tools } = await rpc("tools/list", {});
const open = tools.find((tool) => tool.name === "open_word_game");
const guess = tools.find((tool) => tool.name === "submit_word_guess");
assert.ok(open && guess, "Both game tools are advertised");
assert.ok(open.outputSchema && guess.outputSchema, "Output schemas are present");
assert.deepEqual(guess._meta.ui.visibility, ["app"]);
assert.ok(!guess._meta.ui.resourceUri, "Guess calls do not remount the widget");
const resource = await rpc("resources/read", { uri: open._meta.ui.resourceUri });
assert.match(resource.contents[0].mimeType, /profile=mcp-app/);
assert.ok(resource.contents[0].text.length > 100000, "Bundled widget is present");
assert.ok(!resource.contents[0].text.includes("Widget not built"));
assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains, []);
if (origin.protocol === "https:") {
  assert.equal(resource.contents[0]._meta.ui.domain, origin.origin);
}
const puzzle = await rpc("tools/call", { name: "open_word_game", arguments: { language: "en" } });
assert.equal(puzzle.structuredContent.locale, "en");
assert.equal(puzzle.structuredContent.maxAttempts, 6);
assert.ok(!("answer" in puzzle.structuredContent), "Opening a game does not reveal the answer");
const portuguese = await rpc("tools/call", {
  name: "open_word_game",
  arguments: { language: "auto" },
  _meta: { "openai/userLocation": { country: "BR", timezone: "America/Sao_Paulo" } },
});
assert.equal(portuguese.structuredContent.locale, "pt-BR");
const input = { locale: "en", puzzleKey: puzzle.structuredContent.puzzleKey, attempt: 1, guess: "CRANE" };
const result = await rpc("tools/call", { name: "submit_word_guess", arguments: input });
assert.equal(result.structuredContent.accepted, true);
assert.equal(result.structuredContent.evaluation.length, 5);
const retry = await rpc("tools/call", { name: "submit_word_guess", arguments: input });
assert.deepEqual(retry.structuredContent, result.structuredContent, "A retry produces the same result");
const invalid = await rpc("tools/call", { name: "submit_word_guess", arguments: { ...input, guess: "12" } });
assert.equal(invalid.structuredContent.accepted, false);
const badAttempt = await rpc("tools/call", { name: "submit_word_guess", arguments: { ...input, attempt: 7 } });
assert.equal(badAttempt.isError, true);
const stream = await fetch(mcp, {
  headers: { accept: "text/event-stream", "mcp-protocol-version": "2025-06-18" },
  signal: AbortSignal.timeout(60000),
});
assert.equal(stream.status, 405, "Stateless endpoint declines standalone SSE streams");
await stream.body?.cancel();
console.log("PASS: public pages, MCP initialization, tools, bundled UI, language selection, guesses, retries and invalid inputs at " + origin.origin);
