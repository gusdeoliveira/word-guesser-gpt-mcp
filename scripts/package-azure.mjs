import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = resolve(root, "dist", "azure");
// This script only replaces its own generated directory inside the repository.
if (!stage.startsWith(resolve(root, "dist") + sep)) throw new Error("Unsafe package path");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const compiler = spawnSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.server.json"], {
  cwd: root,
  stdio: "inherit",
});
if (compiler.status !== 0) process.exit(compiler.status ?? 1);

for (const name of ["public", "words_en.txt", "words_pt.txt", "host.json", "package-lock.json"]) {
  await cp(resolve(root, name), resolve(stage, name), { recursive: true });
}
await mkdir(resolve(stage, "dist"), { recursive: true });
await cp(resolve(root, "dist/web"), resolve(stage, "dist/web"), { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
manifest.scripts = { start: "node server/src/index.js" };
delete manifest.devDependencies;
await writeFile(resolve(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const html = await readFile(resolve(stage, "dist/web/index.html"), "utf8");
if (!html.includes("<script") || html.includes('src="/src/main.tsx"')) {
  throw new Error("The widget must be built before packaging");
}
console.log(`Azure deployment package staged at ${stage}`);
console.log("Install production dependencies with: npm ci --omit=dev --ignore-scripts --prefix dist/azure");
