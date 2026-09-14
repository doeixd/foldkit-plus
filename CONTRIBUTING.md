# Contributing

## Layout

- `packages/*` — the published packages. `foldkit-agent` is the contract; the
  adapters depend on it.
- `examples/*` — worked examples that import the packages through their
  published entry points.
- `docs/*` — conceptual guides and project/reference notes. Package API
  reference belongs with the package, not duplicated here.

## Before a commit

Run the checks CI runs. `pnpm check` runs all five in sequence:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm demo
pnpm pack:check
```

Format with `pnpm format`, never bare `prettier`: the repository config matches
the style already in the tree, and without it prettier rewrites files to its own
defaults.

## Tests

Every test must be able to fail. Mutate the code under test (invert a guard,
drop a branch, return a constant), confirm the relevant test goes red, then
revert. A test that passes against broken code is worse than no test. Assert on
behaviour, not on restatements of the implementation; repeated setup belongs in
a helper.

## Documentation

Write for a reader who knows Foldkit and TypeScript but did not participate in
the design discussion.

A package README should establish these things before becoming an API reference:

1. **What problem does this package solve?** Use application language before
   internal vocabulary.
2. **When should I use it, and when should I not?** Name the neighboring package
   when ownership is the deciding factor (`Remote` vs `Sync`, `Mirror` vs
   `Sync`, Behavior vs Submodel).
3. **Where does it sit in the system?** A small data-flow diagram or one concrete
   before/after is often worth more than another paragraph of terminology.
4. **What is the smallest useful example?** Show the happy path before advanced
   hooks, diagnostics, protocol details, or implementation notes.

Conceptual guides under `docs/` explain mental models and ownership boundaries;
they should not become second copies of package API reference. Worked examples
under `examples/` should state what they prove and, where practical, pin their
transcript or type-check their README snippets so documentation drift becomes a
test failure.

Avoid hard-coding a package's current `0.x.y` version into explanatory prose
unless the version itself matters. Link to [`docs/releases.md`](./docs/releases.md)
for the current matrix, or say that the API is still settling in the `0.x`
series. This keeps otherwise-correct READMEs from becoming stale after a release.

When changing behavior that a README demonstrates, update the prose/example in
the same change. When changing only wording, do not silently broaden the claims
an example is supposed to prove.

## TypeScript

Examples emit declarations (`emitDeclarationOnly`), so an exported value whose
inferred type expands a Foldkit-private alias fails with `TS2742`. Annotate the
export with a public type; `examples/sync/src/sync.ts` does exactly that with
`SyncContract<Message, Shared>` and explains why in a comment.

Typechecking is split into build and test projects. Each package has a
`tsconfig.build.json` (src only) that its consumers reference, so a leaf's
`tsc -b` never compiles a referenced package's `test/**`; the package's main
`tsconfig.json` keeps `test/**`, which is what the root `pnpm typecheck` uses.

`pnpm typecheck` is incremental; `pnpm typecheck:force` (what CI runs) rebuilds
every project, which is how to rule out a stale `.tsbuild` masking a change.

## Releasing

See the "Releasing" section of the [root README](./README.md).