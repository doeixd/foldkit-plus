# Traps: mutation testing

Read before writing a mutation spec, running pnpm mutate, or judging a surviving mutation.

- **A mutation that names what the file does not import is killed by a
  `ReferenceError`.** `Layer.buildWithScope(…, Scope.makeUnsafe())` in a file
  importing no `Scope` failed every test at once, and read as a kill. Add the
  import as a second edit of the same mutation, and check which tests killed
  it and why (`--only`).
- **A loop that advances by its own side effect hangs a mutation run.**
  `dropUnmovedHead` walked `for (next = open.nextSibling; …; next =
  open.nextSibling) next.remove()`; the mutation deleting `next.remove()`
  spun forever, and a synchronous loop outlives every test timeout (22
  minutes of CPU before it was killed). Collect what a loop visits first
  (`Array.from(root.childNodes)`), then act on it, so no mutation can stop
  it advancing.
- **A mutation killed by a red test proves nothing.** A test added between
  two mutation runs was already failing, so the second run "killed" its
  mutation for free. Confirm the suite is green before each run; `pnpm
  mutate` refuses a red baseline.
- **A change to shared code rots other specs' anchors.** Placing pending
  creates in `index.ts` broke `pendingPlacement.mutations.ts`, and another
  session had to re-anchor it. Run `pnpm mutate:check` before committing, not
  only your own specs.
- **Mutation specs do not run in CI, so their anchors rot.** Moving the
  registry's sort into `ProductsQuery`'s body renamed
  `Registry.Product.fields.description` to `fields.description`, and
  `registry.mutations.ts` refused to run until a later change happened to
  run it; by 2026-10-12 ten anchors in seven specs had rotted the same way.
  CI now runs `pnpm mutate:check`, which finds every anchor and test file of
  every spec and runs none. It cannot tell whether the mutation is still
  killed: after re-anchoring, run the mutation (`--only <name>`).
  Format before anchoring, too: `pnpm format` reflowed three long conditions
  after their mutations had passed, and the commit went out with anchors
  `mutate:check` refused. Run `pnpm format`, then the mutations, then
  `mutate:check`, then commit.
- **A surviving mutation usually means redundancy, not missing coverage.** This
  has now happened three times: overlapping disposal guards, then a `release()`
  duplicating an `Effect.ensuring`. The fix is to delete the redundant guard, not
  to write a test for a window that does not exist. One guard per window, one
  test per guard.
- **`pnpm exec` and `npx` can run different Nodes, with different ICU.** Here
  `npx` ran `/opt/node22` (ICU 77) and `pnpm exec`, which `pnpm mutate` uses, ran
  pnpm's own Node 22.23 (ICU 78), where Swiss francs group with `'` rather than
  `’`. A mutation of the apostrophe handling survived one and died in the other.
  Code reading what `Intl` writes must take every spelling an ICU release uses,
  and a test pinning `Intl` output should hold under both (`process.versions.icu`).
- **A constant `mint` makes a refusal test pass for any reason.** A test that an
  `InsertText` with bad link props is refused used `mint: () => 'x'`; the insert
  split a run twice, `apply` refused the duplicate id, and the case stayed green
  with the props check deleted. Mint distinct ids in every test that expects a
  refusal, so the refusal can only come from the check under test.
- **A stack that fails in `beforeAll` reads as "invalid" to `pnpm mutate`.**
  The tests are skipped, not failed, so the mutation is not killed. Start
  the stack in a test of its own as well.
