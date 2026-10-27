# Instant Dictionary

Chrome extension (Manifest V3): double-click a word, or right-click a selection → **See Meaning**, to get its definition and pronunciation. The toolbar popup has a search box too.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

Requires Chrome 116+.

## Layout

```
manifest.json
src/background.js   service worker: context menu, handles lookups
src/dict-api.js     fetches + normalises dictionaryapi.dev / Datamuse / Wiktionary
src/render.js       shared DOM rendering (textContent only)
src/content.js      in-page popup
src/popup.html/js   toolbar popup
src/card.css        styles shared by both popups
test/               node --test test/dict-api.test.mjs
```

## Privacy

Definition lookups run in the service worker without cookies or referrer, so dictionary services don't learn which site you were on (playing a recorded pronunciation loads the clip from the page, which can send its origin). Results are cached in `chrome.storage.session`, which is cleared when the browser closes.
