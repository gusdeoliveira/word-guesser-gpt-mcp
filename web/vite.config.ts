import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: resolve(import.meta.dirname, "../dist/web"),
    emptyOutDir: true,
    target: "es2022",
  },
});
