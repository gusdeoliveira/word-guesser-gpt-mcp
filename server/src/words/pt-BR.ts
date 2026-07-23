import { readFileSync } from "node:fs";
import { parseFiveLetterWordList } from "../../../shared/word-list.js";

const source = readFileSync(new URL("../../../words_pt.txt", import.meta.url), "utf8");

export const PORTUGUESE_ANSWERS = parseFiveLetterWordList(source);
export const PORTUGUESE_ALLOWED = PORTUGUESE_ANSWERS;
