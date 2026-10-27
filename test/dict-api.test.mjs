// Run: node --test test/dict-api.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWord, stripHtml, lookupWord } from "../src/dict-api.js";

const json = (body, status = 200, ms = 0) =>
  new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status })), ms));

function mockFetch(routes) {
  globalThis.fetch = (url) => {
    const host = new URL(url).hostname;
    return routes[host]();
  };
}

test("cleanWord", () => {
  assert.equal(cleanWord("  Hello, "), "hello");
  assert.equal(cleanWord("“café”"), "café");
  assert.equal(cleanWord("don’t"), "don't");
  assert.equal(cleanWord("ad  hoc"), "ad hoc");
  assert.equal(cleanWord("a*b"), "");
  assert.equal(cleanWord("123"), "");
  assert.equal(cleanWord("x".repeat(51)), "");
  assert.equal(cleanWord(undefined), "");
});

test("stripHtml removes tags and decodes entities", () => {
  assert.equal(stripHtml('<a href="x">big</a> &amp; <img src=x onerror=alert(1)>tall&#x21;'), "big & tall!");
  assert.equal(stripHtml("&#99999999;"), "&#99999999;");
});

test("a failing fallback does not sink a later success", async () => {
  mockFetch({
    "api.dictionaryapi.dev": () => json({}, 404),
    "api.datamuse.com": () => json([]),
    "en.wiktionary.org": () =>
      json({ en: [{ partOfSpeech: "Noun", definitions: [{ definition: "<b>a</b> thing", examples: ["an <i>x</i>"] }] }] }, 200, 50),
  });
  const e = await lookupWord("zzwik");
  assert.equal(e.meanings[0].partOfSpeech, "noun");
  assert.deepEqual(e.meanings[0].definitions[0], { definition: "a thing", example: "an x" });
});

test("slow primary loses to a fallback after the head start", async () => {
  mockFetch({
    "api.dictionaryapi.dev": () => json({}, 500, 3000),
    "api.datamuse.com": () => json([{ word: "zzfast", defs: ["adj\tquick"] }]),
    "en.wiktionary.org": () => json({}, 404),
  });
  const t = Date.now();
  const e = await lookupWord("zzfast");
  assert.ok(Date.now() - t < 2000);
  assert.equal(e.meanings[0].partOfSpeech, "adjective");
});

test("primary inside head start wins; non-https audio dropped", async () => {
  mockFetch({
    "api.dictionaryapi.dev": () =>
      json([
        {
          phonetics: [{ audio: "http://evil/a.mp3" }, { text: "/p/", audio: 'https://ok/a".mp3' }],
          meanings: [{ partOfSpeech: "verb", synonyms: ["s"], definitions: [1, 2, 3, 4, 5].map((n) => ({ definition: `d${n}` })) }],
        },
      ]),
    "api.datamuse.com": () => json([{ word: "zzprim", defs: ["n\tother"] }]),
    "en.wiktionary.org": () => json({}, 404),
  });
  const e = await lookupWord("zzprim");
  assert.equal(e.audioUrl, "https://ok/a%22.mp3");
  assert.equal(e.phonetic, "/p/");
  assert.equal(e.meanings[0].definitions.length, 4);
  assert.equal(e.meanings[0].more, true);
});

test("all sources missing -> not found; network error -> failed", async () => {
  mockFetch({
    "api.dictionaryapi.dev": () => json({}, 404),
    "api.datamuse.com": () => json([]),
    "en.wiktionary.org": () => json({}, 404),
  });
  await assert.rejects(lookupWord("zznone"), { message: "not found" });
  mockFetch({
    "api.dictionaryapi.dev": () => Promise.reject(new TypeError("offline")),
    "api.datamuse.com": () => json([]),
    "en.wiktionary.org": () => json({}, 404),
  });
  await assert.rejects(lookupWord("zzoff"), { message: "failed" });
});
