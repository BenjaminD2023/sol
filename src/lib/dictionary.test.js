import assert from "node:assert/strict";
import { test } from "bun:test";
import { parseDictionaryQuery } from "./dictionary";
import { formatTemporaryResultForClipboard } from "../stores/ui.store.helpers";

test("define recognizes words and phrases without changing their spelling", () => {
	assert.equal(parseDictionaryQuery("define hello"), "hello");
	assert.equal(parseDictionaryQuery("  DEFINE   déjà vu  "), "déjà vu");
	assert.equal(parseDictionaryQuery("define 学生"), "学生");
	assert.equal(parseDictionaryQuery("define mother-in-law"), "mother-in-law");
	assert.equal(parseDictionaryQuery("define"), "");
	assert.equal(parseDictionaryQuery("define   "), "");
});

test("ordinary queries and unsafe or excessive terms are not looked up", () => {
	for (const query of ["hello", "defined hello", "redefine hello", "definehello"]) {
		assert.equal(parseDictionaryQuery(query), null);
	}
	assert.equal(parseDictionaryQuery(`define ${"a".repeat(257)}`), "");
	assert.equal(parseDictionaryQuery("define a\u0000b"), "");
});

test("copy preserves the full definition with its requested term", () => {
	assert.equal(formatTemporaryResultForClipboard({
		kind: "dictionary", word: "hello", definition: "A greeting.\nUsed on meeting someone.", status: "found",
	}), "hello\nA greeting.\nUsed on meeting someone.");
});
