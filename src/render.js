// Shared by the in-page popup (content.js) and the toolbar popup (popup.js).
// Builds DOM with textContent only: API data never touches innerHTML.
var DictUI = (() => {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function speak(word, audioUrl) {
    if (audioUrl) new Audio(audioUrl).play().catch(() => tts(word));
    else tts(word);
  }

  function tts(word) {
    if (!globalThis.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function spinner() {
    return el("div", "id-loading");
  }

  function renderEntry(entry) {
    const frag = document.createDocumentFragment();
    frag.append(el("div", "id-word", entry.word));
    if (entry.phonetic) frag.append(el("div", "id-phonetic", entry.phonetic));
    const btn = el("button", "id-audio-btn", "\u{1F50A}");
    btn.type = "button";
    btn.setAttribute("aria-label", `Play pronunciation of ${entry.word}`);
    btn.addEventListener("click", () => speak(entry.word, entry.audioUrl));
    frag.append(btn);
    for (const m of entry.meanings) {
      if (m.partOfSpeech) frag.append(el("div", "id-pos", m.partOfSpeech));
      if (m.synonyms.length) frag.append(el("div", "id-synonyms", `Synonyms: ${m.synonyms.join(", ")}`));
      const numbered = m.definitions.length > 1;
      m.definitions.forEach((d, i) => {
        frag.append(el("div", "id-def", (numbered ? `${i + 1}. ` : "") + d.definition));
        if (d.example) frag.append(el("div", "id-example", `"${d.example}"`));
      });
      if (m.more) frag.append(el("div", "id-more", "…"));
    }
    return frag;
  }

  function renderError(text, err) {
    const frag = document.createDocumentFragment();
    frag.append(
      el("div", "id-word", text.trim().slice(0, 50)),
      el("div", "id-not-found", err.message === "not found" ? "Word not found" : "Could not connect. Try again.")
    );
    return frag;
  }

  // Resolves to a ready-to-insert fragment for either outcome.
  async function lookup(text) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "lookup", text });
      if (!res?.entry) throw new Error(res?.error ?? "failed");
      return renderEntry(res.entry);
    } catch (err) {
      return renderError(text, err);
    }
  }

  const hasLetter = (text) => /\p{L}/u.test(text);

  return { spinner, lookup, hasLetter };
})();
