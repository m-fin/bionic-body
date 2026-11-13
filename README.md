# The Bionic Body

**Living longer by replacing parts.** A web deck and a sourced tracker by Matthew "Frog" Finley.

Live site: https://m-fin.github.io/bionic-body/

## What's here

- **[Deck](https://m-fin.github.io/bionic-body/deck/)** (`deck/index.html`): a slide deck making the case for longevity through replacement: fixing cells, bionic parts available today, what's coming next, and the people and projects pushing it forward.
- **[Tracker](https://m-fin.github.io/bionic-body/tracker/)** (`tracker/`): rates 16 body systems from 0 to 5 on how close a real replacement is, from 0 (idea) to 5 (routine clinical use). Each entry lists an example device, its status, the main bottleneck, and dated sources. You can sort, filter by readiness level, and search.

The tracker data lives in `tracker/data.json`, so updating a score or adding a source is a one-file change.

## Run it locally

It's plain HTML, CSS, and JavaScript with no build step or dependencies:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

(The tracker loads `data.json` with `fetch`, so use a local server rather than opening the file directly.)

## Deploy

Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.
