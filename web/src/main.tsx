import "./styles.css";
import { applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const initialTheme =
  window.openai?.theme ??
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyDocumentTheme(initialTheme);

window.addEventListener("openai:set_globals", (event) => {
  const theme = (event as CustomEvent<{ globals?: { theme?: "light" | "dark" } }>).detail.globals?.theme;
  if (theme) applyDocumentTheme(theme);
});

createRoot(document.getElementById("root")!).render(<App />);
