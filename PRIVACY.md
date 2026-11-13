# Privacy

Margin is built so your study notes never leave your computer.

## What Margin stores

Your courses, terms, definitions, quiz progress, recent PDFs and settings are saved in `chrome.storage.local`, inside your own Chrome profile. There is no account, no server and no sync. Uninstalling Margin deletes all of it, so use **Settings → Export** to keep a backup.

## What Margin sends over the network

Only one feature talks to the internet: the **Find one** tab on the save card. When it is open, Margin's background worker asks these public services for definitions of the term you are saving:

| Service | What is sent |
| --- | --- |
| Wikipedia (`en.wikipedia.org`) | the term and a subject word, for example `heap computer science` |
| Wiktionary (`en.wiktionary.org`) | the term |
| EMBL-EBI Ontology Lookup Service (`www.ebi.ac.uk`) | the term (statistics, biology, chemistry and medicine courses only) |
| MeSH, National Library of Medicine (`id.nlm.nih.gov`) | the term (biology, medicine and psychology courses only) |

Nothing else is sent: no page URL, page text, course name, glossary or identifier. Answers are cached locally so the same lookup isn't repeated. If you only use **Write my own**, Margin makes no network requests at all. OpenStax and NIST definitions are bundled inside the extension and work offline.

**Suggested terms** in the PDF viewer run entirely on your computer: the PDF's text is compared with the bundled glossaries and word lists, and never leaves your browser. On computers where Chrome's built-in AI model (Gemini Nano) is available, Margin also asks that model to rank the suggestions. The model runs on your device inside Chrome; Margin sends nothing to Google or anyone else for this.

When you open a PDF from the web, Margin's viewer downloads that PDF from its original address, the same way Chrome's own viewer would.

## Permissions, and why Margin needs them

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Keep your glossary on your computer, with no size cap for large courses. |
| Access to all sites | Underline your saved terms on school and learning sites (and any site you turn on), save terms from any page, and fetch the definition sources above. By default Margin stays inactive on other sites. |
| `contextMenus` | The right-click **Save to Margin** item. |
| `webRequest` | Notice when a tab opens a PDF so it can open in Margin's viewer instead. Only used if you turn on **Open PDFs in Margin** (off until you choose it). |

## No tracking

Margin has no analytics, no ads, no remote code and no third-party scripts.
