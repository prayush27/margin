# Contributing to Margin

Thanks for helping make studying a little easier. Bug reports, ideas and pull requests are all welcome.

## Run it locally

Margin has no build step and no dependencies.

1. Clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the repo folder.
3. After changing code, click ↻ on Margin's card, then refresh the page you're testing. Page-side code (`src/content`, `src/shared`) reloads with the page, but the background worker only updates when the extension reloads.

## Tests

```sh
node tests/run.mjs          # or, on macOS without Node:
jsc -m tests/run.mjs        # /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
node tools/check.mjs        # manifest and bundled-data checks
```

CI runs both on every push and pull request.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/background.js` | Service worker: context menu, shortcut, PDF redirect, definition lookups |
| `src/content/` | Content-script loader (imports the shared modules) |
| `src/shared/matcher.js` | Finds saved terms in text (plurals, aliases, acronyms) |
| `src/shared/highlighter.js` | Underlines matches with the CSS Custom Highlight API |
| `src/shared/ui.js` | Hover card, save card, pill and toasts in a closed shadow root |
| `src/shared/lookup.js` | **Find one** sources and ranking |
| `src/shared/storage.js` | `chrome.storage.local` data layer |
| `src/viewer/` | PDF viewer built on PDF.js |
| `src/hub/` | Glossary, quiz, PDFs and settings |
| `data/` | Bundled definitions (see `data/SOURCES.md`) |
| `tools/` | Data builders, checks and packaging |

## Guidelines

- **Keep it private.** No analytics, remote code or new network calls without a clear reason, and update `PRIVACY.md` if you add one.
- **Keep it light.** Plain JavaScript modules, no frameworks or bundlers. The content script runs on every page.
- **Don't touch page HTML.** Highlights use `CSS.highlights`; UI lives in a closed shadow root.
- **Match the design.** Use the tokens in `src/styles/tokens.css` and support light and dark mode.
- Add a test in `tests/run.mjs` for logic changes.

## Refreshing bundled definitions

```sh
python3 tools/build_openstax.py   # OpenStax glossaries -> data/openstax/
python3 tools/build_nist.py       # NIST DADS -> data/nist-dads.json
python3 tools/build_wordfreq.py   # word frequencies -> data/english-zipf.json (pip install wordfreq)
```

## Releasing

Margin is distributed only through the Chrome Web Store. To prepare an update, bump `version` in `manifest.json` and run `./tools/package.sh` to build the zip for the Web Store dashboard.
