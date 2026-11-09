# TODO

How to continue after the domains-plus performance work (2026-11-09). Ordered.
Each item says when it is done. Issue state was checked on the date above; read
an issue's latest comment before starting it.

## 0. Before new work: land what is on the branch

`ccr-dfcc253e-4x8hum` holds 43 commits (with this one) that CI has never run: CI runs
only on `main` and on pull requests.

- [ ] Open a PR when the maintainer agrees, and watch CI to green
      (`typecheck:force`, `e2e`, `demo`, `postgres-locale`).
- [ ] On merge, close what the branch fixed: #400 (Menu and Menubar),
      #431, #437, #467, #477, #484, #485, #487, #489.
- [ ] Upstream (the maintainer posts; sessions cannot reach foldkit/foldkit):
  - The animation-settle issue: draft written, listed in
    `docs/upstream-foldkit-ssr.md`, item 9 of its Order list.
  - Proposal 7: a comment on foldkit#1657 with the parse5 table.

## 1. #188: field recipes and CRUD screens (the main track)

The largest gain for people building apps. The issue asks for a design gate
first, and the decisions involved (a published API's shape) are for the most
capable model and a design note.

- [ ] **Audit.** What `foldkit-form`, `foldkit-crud`, `foldkit-mixins-form`,
      `foldkit-mixins-crud`, `foldkit-primitives` and `foldkit-mixins-ui`
      already cover for each control in #188's P0 table (`Input.kind`,
      `Input.bundle`, `Display.kind`, the `/ui` renderer, DatePicker, OTP and
      the rest). Done when each P0 row reads *have*, *adapt* or *missing*,
      with the file that proves it.
- [ ] **Design note** (`docs/design/188-field-recipes-DESIGN.md`). It decides:
      - how a recipe is declared: `Input.kind` helpers, a registry, or Schema
        annotations, with no globals and no matching by field name;
      - where its metadata lives (Schema, Entity or form) and which wins;
      - how a recipe's read-only `Display` shares its formatter;
      - the first slice.

      Done when the note answers #188's open questions or defers each one with
      a reason.
- [ ] **First slice.** It should be small enough to change after use. Likely:
      - money, date (date-only versus instant) and email recipes;
      - one unstyled renderer and the `/ui` adapter for each;
      - one complete `Crud` screen in an example (list, filter, detail,
        editor, delete, conflict and retry) with no hand-written parser or
        save state machine.

      Done when #188's end-to-end scenarios 1, 2 and 6 pass as tests, with
      their mutations killed, the README and skill reference updated, and the
      Jev review approved.
- [ ] Split what remains of #188 into child issues, P1 and P2.

## 2. #251: the last name strings

Small, contained API changes. Each is one session.

- [ ] The revision field declared once on the Entity (or read from
      `revisionTrigger`), so `GuardServer.writer`'s and `applyEdits`'
      `revision` string option goes. Keep it as a deprecated overload for one
      release.
- [ ] `Derived.make` counts take a member reference, not `{ relation: 'name' }`.
- [ ] A contributor-guide rule and a check (in the style of `pnpm tags:check`)
      that flags a string literal naming a declared member in an API argument.
      Done when the check runs in CI and finds nothing on `main`.

## 3. Close out what is nearly done

- [ ] #237: close it. Everything is built except reading the compiled build
      id, which needs Foldkit (#210 tracks it).
- [ ] #259: `isInt` and prefix rules compiled to CHECKs, under the same law
      (the database accepts a value exactly when the Schema does) on SQLite
      and PGlite. Then close it. Comparing live DDL stays out, for the reason
      in its design note.

## 4. Parked: performance

Resume only for a regression or a new target.

- #474: re-run solid-domains' live benchmark (`scripts/search-compare.mjs`
  shows it ahead locally: 198 against 260 ms).
- #413: a workerd reading. It needs an adapter so `Stack.start` can run the
  Worker that Foldkit's Vite plugin generates. The rest waits on foldkit#1657.
- #439: deferred by `docs/design/performance-PLAN.md` (re-reading a list
  costs about 22 µs).
- The fade race in Listbox, Combobox and Popover: waits on the upstream fix.

## 5. Held: large designs

Not before 1 and 2. Each needs a design note and an owner decision first: #190
(contract layer), #376 and #433 (a fine-grained runtime and compiled views),
#432 (islands), #148 and #149 (other platforms).
