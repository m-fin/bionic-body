# The Bionic Body

**Living longer by replacing parts.** A web deck and a sourced tracker by Matthew "Frog" Finley.

Live site: https://m-fin.github.io/bionic-body/

## What's here

- **[Deck](https://m-fin.github.io/bionic-body/deck/)** (`deck/index.html`): a slide deck making the case for longevity through replacement: fixing cells, bionic parts available today, what's coming next, and the people and projects pushing it forward.
- **[Tracker](https://m-fin.github.io/bionic-body/tracker/)** (`tracker/`): rates 16 body systems from 0 to 5 on how close a real replacement is, from 0 (idea) to 5 (routine clinical use). Each entry lists an example device, its status, the main bottleneck, and dated sources. You can sort, filter by readiness level, and search.

The tracker data lives in `tracker/data.json`, so updating a score or adding a source is a one-file change. Run `node tests/validate-data.mjs` after editing it: it checks every entry has a 0–5 level, the card fields, and at least one dated https source (CI runs that check and the view tests on pull requests).

## Sharing a view

Search, the readiness filter, and sort live in the page address, so copying that address shares the view. The tracker writes them with `history.replaceState`, which keeps the address current without adding a history entry on every keystroke.

- `q` is the search text.
- `level` is the readiness filter: `4` for available now (levels 4–5), `2` for in humans but not approved (levels 2–3), or `0` for lab or idea (levels 0–1). A single score works too: `5` counts as `4`, `3` counts as `2`, and `1` counts as `0`. Anything else is ignored.
- `sort` is `level` (most ready first, the default), `level-asc` (least ready first), or `name` (A–Z).

Example: [heart, available now, A–Z](https://m-fin.github.io/bionic-body/tracker/?q=heart&level=4&sort=name). A link like `?q=heart&level=3&sort=level` restores that search, the in-humans group (a score of 3 selects levels 2–3), and most-ready-first sort.

Each system card has a **Copy link** button. The anchor is a slug of the system name (`Heart` is `#heart`, `Pancreas / insulin` is `#pancreas-insulin`). Opening <https://m-fin.github.io/bionic-body/tracker/#heart> scrolls to that card and highlights it briefly. If the search or readiness filter would hide the card, those filters are cleared so it can show. The highlight does not animate when the browser has reduced motion turned on.

## Tests

No install step. From the repo root:

```sh
node tests/validate-data.mjs
node --test tests/view.test.mjs
```

`validate-data.mjs` checks `tracker/data.json`. `view.test.mjs` checks shared-view query strings, slug uniqueness across `data.json`, and filter/sort. CI runs both on pull requests.

## Run it locally

It's plain HTML, CSS, and JavaScript with no build step or dependencies:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

(The tracker loads `data.json` with `fetch`, so use a local server rather than opening the file directly.)

## Deploy

Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.
