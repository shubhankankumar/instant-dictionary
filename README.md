# Instant Dictionary

Double-click any word on any web page and a small card pops up right there with its meaning, how to pronounce it, an example and a few synonyms. You never leave the page.

## Install

It's not on the Chrome Web Store, so load it yourself.

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder (the one with `manifest.json` in it).

You need Chrome 116 or newer.

Pages that were already open before you installed it need a refresh before double-click works on them. It also can't run on Chrome's own pages like `chrome://` or the Web Store, because Chrome doesn't allow extensions there.

## Usage

There are three ways to look up a word:

1. **Double-click a word.** The card appears just below where you clicked.
2. **Select some text, right-click, choose See Meaning.** Handy on pages where double-click does something else. It looks up the first word of what you selected.
3. **Click the toolbar icon** and type a word into the search box.

If the word has a recorded pronunciation, there's a play button on the card. The card closes when you click anywhere else, scroll, or press Esc.

Double-clicking inside text boxes and editable areas is ignored, so it won't get in your way while you're typing.

## Where the definitions come from

It asks three free dictionaries at the same time:

1. [Free Dictionary API](https://dictionaryapi.dev) has the best answers (phonetics, audio, examples, synonyms) but is often slow.
2. [Datamuse](https://www.datamuse.com/api/)
3. [Wiktionary](https://en.wiktionary.org)

The Free Dictionary API gets 800 ms to answer on its own. After that, whichever source comes back first with a real definition wins and the other requests are cancelled. So you get the rich answer when it's quick, and a fast answer when it isn't. Each request gives up after 8 seconds.

To keep the card readable it shows at most 6 parts of speech, 4 definitions for each, and 6 synonyms.

Words you've already looked up are cached until you close the browser, so looking up the same word again is instant. If you double-click the same word twice quickly, only one request goes out.

## Privacy

The lookups happen in the extension's background worker, not on the web page. They go out without cookies and without a referrer, so the dictionary sites can't tell which page you were reading.

The card is drawn inside a closed shadow root. That means the page's own CSS can't mess up how it looks, and more importantly the page's scripts can't read it, so a site can't see which words you looked up. The card's stylesheet is passed in by message instead of being a public extension file, so websites can't probe for it to find out you have the extension installed.

Pages also can't trigger lookups by faking double-clicks. Only real clicks from you count.

All text from the dictionaries goes onto the page with `textContent`, never as HTML. Audio links are only used if they use HTTPS.

The one leak: when you press play on a pronunciation, the audio file is loaded from the page, so the audio host can see which site you were on.

The cache lives in `chrome.storage.session`, which Chrome wipes when the browser closes. Nothing is written to disk and nothing is sent anywhere else.

## Permissions

`contextMenus` for the right-click menu, `storage` for the session cache, and access to the three dictionary sites. The content script runs on all pages because double-click has to work everywhere.

## Files

```
manifest.json
src/background.js   right-click menu and lookups
src/dict-api.js     talks to the three dictionaries and turns their answers into one format
src/render.js       builds the card, shared by the page card and the toolbar popup
src/content.js      the card on web pages
src/popup.html      the toolbar popup with the search box
src/popup.js
src/card.css        styles for both
icons/
test/
```

## Tests

```
node --test test/dict-api.test.mjs
```

No packages needed. CI runs the tests on every push to main and every pull request.
