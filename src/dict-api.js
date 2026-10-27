// Dictionary lookup. Runs only in the service worker, so pages never see the requests.
// Sources: dictionaryapi.dev (richest, often slow), Datamuse and Wiktionary (fast fallbacks).
// The primary gets a short head start; after that the first valid answer wins and the rest are aborted.

const GRACE_MS = 800;
const TIMEOUT_MS = 8000;
const MAX_MEANINGS = 6;
const MAX_DEFS = 4;
const MAX_SYNONYMS = 6;
const CACHE_PREFIX = "dict:";

const DATAMUSE_POS = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "interjection",
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const inFlight = new Map();

const str = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v : []);

// Accepts a word or short phrase of letters, apostrophes, hyphens and single spaces.
export function cleanWord(raw) {
  const word = String(raw ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .replace(/\s+/g, " ");
  return word.length <= 50 && /^\p{L}[\p{L}\p{M}' -]*$/u.test(word) ? word : "";
}

function httpsUrl(raw) {
  try {
    const url = new URL(str(raw));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// No DOM in a service worker; the result is only ever rendered with textContent.
export function stripHtml(html) {
  return str(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, e) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? match;
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// senses: flat [{ pos, definition, example, synonyms }] grouped by part of speech.
function build(word, phonetic, audioUrl, senses) {
  const byPos = new Map();
  for (const s of senses) {
    const definition = str(s.definition);
    if (!definition) continue;
    const pos = str(s.pos).toLowerCase();
    let m = byPos.get(pos);
    if (!m) {
      if (byPos.size >= MAX_MEANINGS) continue;
      m = { partOfSpeech: pos, synonyms: [], definitions: [], more: false };
      byPos.set(pos, m);
    }
    if (m.definitions.length < MAX_DEFS) m.definitions.push({ definition, example: str(s.example) });
    else m.more = true;
    for (const syn of list(s.synonyms)) {
      if (str(syn) && m.synonyms.length < MAX_SYNONYMS && !m.synonyms.includes(syn)) m.synonyms.push(syn);
    }
  }
  if (!byPos.size) throw new Error("not found");
  return { word, phonetic, audioUrl, meanings: [...byPos.values()] };
}

function fromDictionaryApi(word, data) {
  const entries = list(data).filter((e) => e && typeof e === "object");
  const phonetics = entries.flatMap((e) => list(e.phonetics)).filter(Boolean);
  const phonetic = str(entries[0]?.phonetic) || phonetics.map((p) => str(p.text)).find(Boolean) || "";
  const audioUrl = phonetics.map((p) => httpsUrl(p.audio)).find(Boolean) || "";
  const senses = entries
    .flatMap((e) => list(e.meanings))
    .filter(Boolean)
    .flatMap((m) =>
      list(m.definitions)
        .filter(Boolean)
        .map((d) => ({
          pos: m.partOfSpeech,
          definition: d.definition,
          example: d.example,
          synonyms: [...list(m.synonyms), ...list(d.synonyms)],
        }))
    );
  return build(word, phonetic, audioUrl, senses);
}

function fromDatamuse(word, data) {
  const exact = list(data).find((d) => str(d?.word).toLowerCase() === word);
  const senses = list(exact?.defs).map((raw) => {
    const [tag, ...rest] = str(raw).split("\t");
    return rest.length ? { pos: DATAMUSE_POS[tag] ?? tag, definition: rest.join(" ") } : { definition: tag };
  });
  return build(word, "", "", senses);
}

function fromWiktionary(word, data) {
  const senses = list(data?.en)
    .filter(Boolean)
    .flatMap((block) =>
      list(block.definitions)
        .filter(Boolean)
        .map((d) => ({
          pos: block.partOfSpeech,
          definition: stripHtml(d.definition),
          example: stripHtml(list(d.examples)[0] ?? list(d.parsedExamples)[0]?.example),
        }))
    );
  return build(word, "", "", senses);
}

async function getJson(url, signal) {
  const res = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (res.status === 404) throw new Error("not found");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchEntry(word) {
  const ctrl = new AbortController();
  const q = encodeURIComponent(word);
  const primary = getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`, ctrl.signal).then((d) =>
    fromDictionaryApi(word, d)
  );
  const fallbacks = [
    getJson(`https://api.datamuse.com/words?sp=${q}&md=d&max=5`, ctrl.signal).then((d) => fromDatamuse(word, d)),
    getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${q}`, ctrl.signal).then((d) =>
      fromWiktionary(word, d)
    ),
  ];
  for (const p of fallbacks) p.catch(() => {}); // losers are aborted; their rejections are expected
  // Fallbacks count once the primary settles or its head start runs out.
  const headStart = Promise.race([primary, new Promise((r) => setTimeout(r, GRACE_MS))]).catch(() => {});
  try {
    return await Promise.any([primary, ...fallbacks.map((p) => headStart.then(() => p))]);
  } catch (err) {
    const errors = err.errors ?? [err];
    throw new Error(errors.every((e) => e.message === "not found") ? "not found" : "failed");
  } finally {
    ctrl.abort();
  }
}

// shortcut: session storage is wiped on browser restart and capped at 10 MB (writes past it are dropped); add LRU eviction if that ever matters.
const session = () => globalThis.chrome?.storage?.session;

async function readCache(word) {
  try {
    return (await session()?.get(CACHE_PREFIX + word))?.[CACHE_PREFIX + word] ?? null;
  } catch {
    return null;
  }
}

function writeCache(word, entry) {
  session()
    ?.set({ [CACHE_PREFIX + word]: entry })
    .catch(() => {});
}

export function lookupWord(raw) {
  const word = cleanWord(raw);
  if (!word) return Promise.reject(new Error("not found"));
  let pending = inFlight.get(word);
  if (!pending) {
    pending = readCache(word)
      .then(
        (hit) =>
          hit ??
          fetchEntry(word).then((entry) => {
            writeCache(word, entry);
            return entry;
          })
      )
      .finally(() => inFlight.delete(word));
    inFlight.set(word, pending);
  }
  return pending;
}
