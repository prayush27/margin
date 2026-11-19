# Chrome Web Store listing

Everything to paste into the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
Upload `dist/margin-<version>.zip`, built with `tools/package.sh`.

## Store listing tab

**Name:** Margin

**Summary** (132 characters max):

> Save a course term once. See your definition on Canvas, course sites and lecture PDFs, with a class sidebar and quizzes.

**Category:** Education
**Language:** English

**Description:**

```
Margin is a free glossary for your classes. Save a term once, and your definition shows up wherever you study: Canvas, course websites, textbooks online and lecture PDFs.

Beta: Margin is new. If something breaks or confuses you, use "Send feedback" in the Margin menu.

SAVE A TERM IN TWO SECONDS
Select a word and press Alt+Shift+S (⌥⇧S on Mac), or right-click → Save to Margin. Write your own definition, or tap "Find one" for definitions matched to your course from OpenStax textbooks, NIST, Wikipedia and other references.

SEE IT WHEREVER YOU STUDY
Saved terms get a soft underline on school and learning sites. Hover to see your definition, the class, and where you first saw it. Other sites stay untouched unless you turn Margin on for them.

LECTURE PDFS
Say yes once and PDFs open in Margin's viewer with your terms underlined. The Suggested tab finds the lecture's key terms for you, with definitions from your professor's slides or the course textbook, ready to save in one click.

CLASS SIDEBAR
Open the sidebar (Alt+Shift+M) to see every term for one class beside any page, with the ones on the current page first. On a course page, it picks the class by itself.

GLOSSARY AND QUIZ
Every term lands in a glossary sorted by class. Quiz yourself before exams; the ones you miss come back first. Export to CSV for Anki or Quizlet.

PRIVATE BY DESIGN
Your glossary is saved only on your computer. No account, no analytics, no ads, no AI service. Margin is open source: https://github.com/prayush27/margin
```

**Screenshots** (1280×800, in this order): `store/screenshots/1-hover.png` … `5-quiz.png`
**Small promo tile** (440×280): `store/promo-small-440x280.png`
**Store icon** (128×128): `icons/icon-128.png`

**Official URL:** none (needs Search Console verification; optional)
**Homepage URL:** https://margin.prayushdesai.com
**Support URL:** https://margin.prayushdesai.com/feedback

## Privacy practices tab

**Single purpose:**

> Margin helps students build a glossary of course terms and shows their saved definitions on the pages and PDFs they study.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's terms, classes and settings on their computer. |
| `unlimitedStorage` | A semester of terms plus cached definitions and PDF reading positions can exceed the default 10 MB limit. |
| `contextMenus` | Adds "Save to Margin" for selected text, "Open PDF in Margin" for PDF links, and toolbar menu items. |
| `webRequest` | Detects when a tab loads a PDF so it can open in Margin's PDF viewer. Used only after the user turns on "Open PDFs in Margin". Read-only; requests are never blocked or modified. |
| `sidePanel` | Shows the class sidebar: the user's saved terms for one class beside the page they're reading. |
| Host permission `<all_urls>` | Students study on many sites (every school's Canvas or Moodle domain, course sites, textbooks, PDFs), so the content script must be able to run on them to underline saved terms and save new ones. By default it only underlines on school and learning sites; on others it stays inactive unless the user turns it on. Also used to fetch definitions from public references (Wikipedia, Wiktionary, MeSH, EBI OLS) when the user clicks "Find one". |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package. Network requests return JSON definitions only.)

**Data usage.** Margin's developer receives no user data. The only data that leaves the device is the term a user looks up with "Find one", sent to public reference APIs to get definitions. To be safe, tick:

- [x] **Website content** (the looked-up term text, only when the user clicks Find one)

Leave everything else unticked. Then certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://margin.prayushdesai.com/privacy

## Distribution tab

**Visibility:** Public (since 0.1.1, Nov 2026)
**Regions:** All regions
**Pricing:** Free

## Test instructions (for the reviewer)

```
No account or login needed.
1. Open https://en.wikipedia.org/wiki/Heap_(data_structure). Select the word "heap" and press Alt+Shift+S (or right-click → Save to Margin). Click "Find one", pick a definition, and click Save.
2. "heap" is now underlined on the page. Hover it to see the saved definition.
3. Click the Margin toolbar icon → "Class sidebar" to see the saved terms for the class beside the page.
4. Click the toolbar icon → "Open glossary" to see the glossary and Quiz.
5. PDFs: in the glossary's welcome card click "Yes, open them in Margin", then open any PDF link; it opens in Margin's viewer with a Suggested terms panel.
```

## Each release

1. Bump `version` in `manifest.json`.
2. Run `tools/package.sh`.
3. Upload `dist/margin-<version>.zip` under Package → Upload new package, then Submit for review.
