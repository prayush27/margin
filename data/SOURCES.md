# Definition sources

Margin's **Find one** tab suggests definitions from these sources. Each suggestion shows its source, and saved definitions keep a link back to it.

## Bundled (offline)

| Source | What | License | Rebuild |
| --- | --- | --- | --- |
| [OpenStax](https://openstax.org) glossaries | Key terms from 64 free college textbooks (psychology, biology, chemistry, economics, statistics, nursing, …) | CC BY 4.0 or CC BY-NC-SA 4.0 per book, listed in `openstax/books.json`. Margin is free and non-commercial. | `python3 tools/build_openstax.py` |
| [NIST Dictionary of Algorithms and Data Structures](https://xlinux.nist.gov/dads/) | 835 computer science definitions | Public domain (US government work). Entries copyrighted by CRC Press are skipped. | `python3 tools/build_nist.py` |

OpenStax is a trademark of Rice University. Margin is not affiliated with or endorsed by OpenStax or NIST.

## Live (only the term and a subject word are sent, only when *Find one* is open)

| Source | Used for | License |
| --- | --- | --- |
| [EMBL-EBI Ontology Lookup Service](https://www.ebi.ac.uk/ols4/): STATO, Gene Ontology, Cell Ontology, Uberon, ChEBI, NCI Thesaurus, Mondo | statistics, biology, chemistry, medicine | CC BY (per ontology) |
| [MeSH](https://www.nlm.nih.gov/mesh/), National Library of Medicine | biology, medicine, psychology | Public domain |
| [Wikipedia](https://en.wikipedia.org) | every subject | CC BY-SA 4.0 |
| [Wiktionary](https://en.wiktionary.org) | everyday meaning | CC BY-SA 4.0 |
