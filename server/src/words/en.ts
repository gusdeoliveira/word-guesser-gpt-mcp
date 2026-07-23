import { readFileSync } from "node:fs";
import { parseFiveLetterWordList } from "../../../shared/word-list.js";

const source = readFileSync(new URL("../../../words_en.txt", import.meta.url), "utf8");

export const ENGLISH_ANSWERS = parseFiveLetterWordList(source);
export const ENGLISH_ALLOWED = ENGLISH_ANSWERS;
