---
title: One declarative kernel from database locks to instant SSR
description: How unifying expressions, transitions, maintained lists, and SSR resumption on metakit cut 100k-row placement from 318 ms to 2.8 ms and made server-rendered pages answer presses before the framework loads.
date: 2026-11-25
author: Foldkit Plus
tags: [metakit, remote, ssr, surface, durable]
---

# One declarative kernel from database locks to instant SSR

Every web application repeats the same rules in four places: once in the UI to disable a button, once in the client reducer to apply an optimistic update, once in the server handler to validate a write, and once in SQL to keep two concurrent requests from breaking an invariant. When those four copies drift apart, you get stale totals, race conditions, or buttons that look enabled and then fail.

Across the MetaKit unification, Foldkit Plus moved expressions, state transitions, custom operations, maintained lists, store capabilities, and pre-hydration DOM bindings onto one inspectable kernel: `metakit`.

## One `Machine` drives `update`, graphs, forms, and agents

Declaring a Message's state transition with `Transition.make` and deriving Foldkit's `update` through `Declared.of` lets every downstream consumer read the same declaration:

- **`Writes.track` and `Graph.of`** know which Model paths each Message writes, so Surfaces that read untouched fields skip redrawing and `deadReaders` identifies static SSR regions.
- **`foldkit-form` and `foldkit-agent`** derive disabled states and JSON Schema tool metadata (including `x-metakit-operations`) directly from the machine.
- **`Declared.of` lazy arms** (`lazyTags` + `registerArm`) let the runtime hold Messages for unloaded chunks in FIFO order and drain them once their chunk arrives.

See [Declare your `update`](../guides/declare-update.md) and [See what a Message can affect](../guides/message-impact.md).

## 100,000-row placement in 2.8 ms and O(1) maintained folds

Previously, placing a pending write into a 100,000-row loaded list scanned every row (`100,000` order comparisons, `318.3 ms` median). Replacing that scan with binary search over cached keys (`packages/remote/src/placement.ts`) brought placement down to **17 comparisons per read and 2.8 ms median** on the ledger machine (`docs/design/metakit-unification-LEDGER.md`, commit `d2bded751`).

On top of row deltas, `foldkit-remote/maintained` now supports:
- **`Maintained.reduce`** over custom `metakit/operation` commutative monoids (updating in O(1) on delete when `invertible`, rescanning otherwise).
- **`Maintained.join`** backed by `ReverseIndex` for O(1) foreign-key grouping.
- **Postgres `SELECT ... FOR UPDATE` parent locks** (`writer(..., { parentLock })` and `withParentLock`) so aggregate rules like `neverOverdrawn` serialize concurrent transfers in ascending parent id order without deadlocking, while D1 refuses read-first aggregate rules explicitly.
- **`Journal.replay`** in `foldkit-durable` so reconnecting clients catch up incrementally from their cursor or reset cleanly to an authoritative snapshot after compaction or an epoch change.

See [Keep a list up to date](../guides/maintained-lists.md) and [Hold a rule to a store](../guides/store-capabilities.md).

## Pages that answer presses before the framework loads

With `foldkit-ssr/binder`, a server-rendered page can answer declared presses before the Foldkit runtime chunk downloads, update anchored elements in place, and hand its updated state to `SSR.hydrate` with zero rebuilt elements.

On `examples/foldkit/domains-plus` (`DOMAINS_PLUS_BINDER=1`, commit `9b76bd4ac` and `b57c52c7c`):
- Clicking "Add to cart" while `assets/entry-*.js` is held updates `Cart, 1 domains` and `#cart-announcement` immediately with zero POSTs, preserves DOM node identity across hand-over, and hydrates at rest with **0 rebuilt elements** out of 746 served nodes.
- Cutting `ClickedAddDomain` into a lazy per-Message chunk (`src/client/chunks/addDomain.ts`) produces a **327 B brotli** (`748 B` raw) chunk that prefetches on hover/focus/touch, executes held presses exactly once, and releases failed form presses to browser POST fallback.
- Because `foldkit-ssr/binder` currently shares a 50.4 kB brotli `effect/Schema` + `metakit` chunk with the runtime (while the binder's own code is 4.18 kB brotli), `DOMAINS_PLUS_BINDER=1` stays opt-in until the schema decoder is trimmed below the 20 kB gate.

See [Make a page answer before the framework loads](../guides/resume-before-runtime.md) and [Cut script by Message](../guides/cut-script-by-message.md).

## Upgrading

Phases 1–4 introduced four focused breaking changes (`foldkit-entity/laws`, `metakit/operation` replacing `Law.*`, `foldkit-remote/maintained` replacing `foldkit-remote/aggregate`, and `foldkit-ssr/binder`). Every compiler error and before/after diff is listed in [Upgrading across the MetaKit unification](../upgrading-metakit.md).
