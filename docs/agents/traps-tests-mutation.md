# Traps: mutation testing

Read before writing a mutation spec, running pnpm mutate, or judging a surviving mutation. Tooling limits of `pnpm mutate` (what it cannot reach) are in `traps-tooling-vitest-mutate.md`.

- **A mutation killed for the wrong reason proves nothing; check which tests killed it and why (`--only`).**
  `Layer.buildWithScope(…, Scope.makeUnsafe())` in a file importing no `Scope` failed every test with a `ReferenceError` and read as a kill (add the import as a second edit of the same mutation). A test added between two runs was already failing, so the second run "killed" for free (confirm green first; `pnpm mutate` refuses a red baseline). A stack failing in `beforeAll` skips the tests, so the mutation reads "invalid", not killed: start the stack in a test of its own as well.
- **A loop that advances by its own side effect hangs a mutation run.**
  `dropUnmovedHead` walked `for (next = open.nextSibling; …; next = open.nextSibling) next.remove()`; deleting `next.remove()` spun forever past every test timeout (22 minutes of CPU). Collect what a loop visits first (`Array.from(root.childNodes)`), then act.
- **Anchors rot: run `pnpm mutate:check` before committing, and format first.**
  Placing pending creates in `index.ts` broke `pendingPlacement.mutations.ts` and another session re-anchored it. Specs do not run in CI, so by 2026-10-12 ten anchors in seven specs had rotted (moving the registry's sort into `ProductsQuery`'s body renamed `Registry.Product.fields.description` to `fields.description` and `registry.mutations.ts` refused to run). CI now runs `pnpm mutate:check` (finds every anchor and test file, runs none), which cannot say whether a mutation is still killed: after re-anchoring run it (`--only <name>`). `pnpm format` reflowed three long conditions after their mutations had passed and the commit shipped anchors `mutate:check` refused: run `pnpm format`, then the mutations, then `mutate:check`, then commit.
- **A surviving mutation usually means redundancy, not missing coverage.**
  Three times so far (overlapping disposal guards, a `release()` duplicating an `Effect.ensuring`, and more). Delete the redundant guard instead of testing a window that does not exist: one guard per window, one test per guard.
- **`pnpm exec` and `npx` can run different Nodes with different ICU.**
  `npx` ran `/opt/node22` (ICU 77) and `pnpm exec` (which `pnpm mutate` uses) pnpm's own Node 22.23 (ICU 78), where Swiss francs group with `'` rather than `’`: a mutation of the apostrophe handling survived one and died in the other. Code reading `Intl` output must take every spelling an ICU release uses, and a test pinning it should hold under both (`process.versions.icu`).
- **A constant `mint` makes a refusal test pass for any reason.**
  A test that an `InsertText` with bad link props is refused used `mint: () => 'x'`; the insert split a run twice, `apply` refused the duplicate id, and the case stayed green with the props check deleted. Mint distinct ids in every test expecting a refusal.
