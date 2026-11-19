# Website documentation audit, 2026-11-19

Companion to [`docs-review-2026-11-19.md`](./docs-review-2026-11-19.md). That review audited individual Markdown files; this audit measures what a real end user actually meets on the built website (`examples/site`), why it reads as AI slop despite compiling, and the wave plan to fix it.

## Measured slop across all 75 website source files

Scanned all 75 Markdown files registered in `examples/site/src/catalog.ts` (`54,381` total lines, `896` level-2 headings):

| Pattern | Hits | Files affected | End-user impact |
| --- | ---: | ---: | --- |
| Clipped double-colon prose (`X: Y: Z`) | 2,037 | 73 / 75 | Reads like a compressed spec or LLM summary instead of an explanation |
| Defensive negations (`does not`, `performs no I/O`, `reads no database`, `holds nothing`, `owns no`) | 690 | 73 / 75 | Opens by listing what a package is *not* before showing what it does |
| Table cells over 100 chars (worst: 2,002 chars) | 502 | 51 / 75 | Walls of TypeScript signatures crammed into narrow table columns |
| Hidden `<!-- docs-check -->` blocks | 304 | 56 / 75 | Stripped by `examples/site/src/content/guides.ts:109`, leaving visible website code referencing undefined identifiers |
| `ts sketch` pseudo-code blocks | 106 | 34 / 75 | Unrunnable code snippets |
| Generic template headings (`What it is`, `What it owns`, `Mental model`, `Sixty seconds`, `Core concepts`) | 93 | 55 / 75 | Every sidebar repeats identical robotic labels; impossible to scan by task |
| ASCII diagrams | 29 | 18 / 75 | Replaced by prose or real visuals under `writing-docs.md` |
| Repo-internal wording (`in this repository`, `pnpm --filter`, `the design asks for`) | 22 | 15 / 75 | Contributor context leaking onto user pages |
| Issue / version references in user prose | 20 | 13 / 75 | Belongs in changelogs or Limits, not tutorials/landing pages |

Top files by size and slop density:

- `packages/remote/README.md`: 4,559 lines, 26 `##` sections, 34 hidden `docs-check` blocks (lines 6–120 hidden!), 83 defensive negations.
- `packages/mixins-ui/README.md`: 3,401 lines, 22 `##` sections, 2,002-char table cells, opens on `@foldkit/ui` adapter/Slot/resolver jargon.
- `packages/remote-drizzle/README.md`: 2,130 lines, 29 hidden `docs-check` blocks, opens on the word "Provisional".
- `packages/entity/README.md`: 2,080 lines, 33 defensive negations, 460-char table cells, definition-first opening.
- `packages/ssr/README.md`: 2,013 lines, 25 hidden `docs-check` blocks, 31 defensive negations, 7 ASCII diagrams.
- `packages/mixins/README.md`: 1,898 lines, 748-char table cells, mixes Slot basics with the entire Theme/Knobs design system.
- `packages/remote-server/README.md`: 1,893 lines, 14 hidden `docs-check` blocks, 342-char cells, ASCII pipeline first.
- `packages/guard/README.md`: 1,178 lines, 31 defensive negations, 4 generic headings.

## End-user failures on the live website

1. **"Get started" (`/learn`) is a dead end for strangers.** The homepage's primary button (`examples/site/src/view/home.ts:71`) opens `/learn`, which renders the raw GitHub `README.md` (including a DeepWiki badge, ~25 undefined terms in 60 lines, and a 163-line 6-package mega-snippet with undefined `Model`/`Message`/`update`). There is no 5-minute Quickstart tutorial. The `/learn` sidebar also includes an internal maintainer status log (`docs/ui-architecture.md`) and a release upgrade guide (`docs/upgrading-0.41.md`).
2. **Version drift on the homepage itself.** `examples/site/src/view/frame.ts:115` says `Foldkit 0.168`, `examples/site/src/view/home.ts:408` says `Foldkit 0.169`, `skills/foldkit-plus/SKILL.md` says `0.170.x`, while root `package.json` pins `foldkit: 0.170.0`.
3. **Hidden `docs-check` fixtures break website code.** Because `guides.ts` strips HTML comments, 304 hidden blocks leave visible snippets on the site referencing symbols (`App`, `Data`, `ProjectSummary`, `ProjectsByOwner`, `TodoFields`) that never appear on the page.
4. **Mega-README splitting creates 100-link sidebars and 500-line home pages.** `guides.ts` glues everything up to `"Sixty seconds"` onto a subsite's home page (`/remote` opens on 567 lines) and splits every remaining `##` into flat sidebar entries (~100 links under `/remote`).
5. **Navigation mirrors npm packages, not user intent.** Users arrive with tasks or symptoms ("load server data", "add login", "render a table", "why is my list still Loading?") and meet 21 package subsites with identical generic headings and no site search.

## Rewrite waves

All rewrites follow [`writing-docs.md`](./writing-docs.md) and [`writing-docs-examples.md`](./writing-docs-examples.md), keep every snippet compiling under `node scripts/docs-check.mjs`, preserve required test invariants (`README.md`'s `<!-- demos -->` block, `guides.test.ts` no-design-note check, existing internal `#anchor` links), and get cold-reader review.

### Wave 1 (highest-traffic front door + worst slop landing pages)

1. **Website front door & `/learn` shelf:** write `docs/quickstart.md` (5-minute end-to-end start), wire `/learn` in `examples/site/src/catalog.ts` to lead with it (removing `ui-architecture.md` from `learn`), fix Foldkit version drift in `frame.ts` and `home.ts` (`0.170`), rewrite `docs/glossary.md`, `docs/state-model.md`, `docs/events-folds-and-gates.md`, and `docs/declared-data-to-ui.md`.
2. **Root `README.md`:** problem-first opening (<= 1,200 prose words), plain 1-sentence Foldkit intro, preserve `<!-- demos -->` verbatim, replace the 163-line 6-package soup with one <= 25-line runnable example with visible output, clean short-cell package table.
3. **`foldkit-mixins-ui` & `foldkit-mixins`:** problem-first openings, visible `Button.view`/`Table.view` first example with rendered HTML, link `/components` and `/create`, eliminate 2,000-char table cells and generic headings.
4. **`foldkit-remote`, `foldkit-remote-drizzle`, `foldkit-remote-server`:** purge hidden `docs-check` setup that hides identifiers taught by the opening examples, problem-first openings (drop "Provisional" and ASCII pipeline openings), kill negation walls, fix generic headings and >100-char cells.
5. **`foldkit-entity`, `foldkit-form`, `foldkit-crud`, `foldkit-media`, `foldkit-guard`:** problem-first openings (apply `proposals/media-README.md` for `media`, lift `crud`'s line-52 paragraph to top, draw a real form with an error in `form`, show a refused request in `guard`, kill hidden-identifier traps, generic headings, issue numbers, and >100-char cells).

### Wave 2 (follow-on after Wave 1 lands)

- Site architecture upgrade: render ~200-line package READMEs as single landing pages without `##` chopping, group subsite sidebars by intent (Start / Guides / Troubleshooting / API), add client-side search across titles/headings/symptoms.
- Split oversized READMEs (`remote`, `mixins-ui`, `ssr`, `mixins`, `entity`, `remote-drizzle`, `remote-server`) into dedicated `docs/<family>/*.md` task/reference pages (widening `scripts/docs-check.mjs` to `docs/*/*.md`).
- Remaining packages (`sync`, `bundle`, `surface`, `mirror`, `ssr`, `site`, `cms`, `agent*`, `richtext*`, `data-grid`, `composition`, `builder`).
