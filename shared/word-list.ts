import { WORD_LENGTH } from "./game.js";

function normalizeListEntry(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function parseFiveLetterWordList(source: string): string[] {
  const words = new Set<string>();

  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const word = normalizeListEntry(line);
    if (word.length === WORD_LENGTH) words.add(word);
  }

  if (words.size === 0) {
    throw new Error("The word list does not contain any valid five-letter words.");
  }

  return [...words];
}
