# Agent working agreements

This file is the core every agent must know. Area-specific hazards live in `docs/agents/`: read the file for your area before you change code there (see "Traps: read before you change code").

## Repository

- Workspace: pnpm, `packages/*` and `examples/*`.
- Build: `tsdown`. Tests: `vitest`. Types: `tsc -b`. Format: `oxfmt` (`examples/site`'s API extractor keeps `prettier` as a library).
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, the unit and browser tests in shards, the production builds, e2e, the performance budgets, `demo`, `pack` and the scaffolds on every PR and on pushes to `main`. Before pushing, run what your change can break (see "A brief that does not make its agent wait"), not the whole list; `pnpm e2e` starts servers and a browser, so run a file of it when a change reaches an example with a server.
- `PLAN.md` is git-ignored and tracks in-progress work.

## Commit cadence

- **Commit often.** Small, coherent commits; commit as soon as a unit of work stands on its own (a module, a config, a test file).
- **After each bout of work, review it.** A bout is a piece that stands on its own: a feature, a widget, a fix with its tests. Re-read the whole bout's diff (`git diff <start>..HEAD`), run the relevant checks once (`pnpm typecheck`, `pnpm test`, `pnpm build`), and fix what the review finds in a follow-up commit.
- Per-commit mechanics that are about git safety, not review, stay per commit: see "Git in the shared tree".

## Scope: build the feature

The project aims to expand what Foldkit Plus can do. Do not defer, decline or close a feature because no application, caller or "second consumer" uses it yet: a design decides how to build it, and its tests, an example or a demo are its first consumer. Defer only for a concrete reason: it waits on upstream, a measured cost outweighs it, the design is unsound, or the work belongs to another package's ownership. The De-slop rules about options nobody passes and wrappers that only forward are about plumbing left dead inside a change, not about which features to build.

## Git in the shared tree

Several sessions share one worktree, one index and one branch.

- **No worktrees and no branches unless the maintainer says so. Ask first and wait for the answer.** Work in the one checked-out tree on its branch. Never create a worktree, a second checkout, a new branch (local or remote) or a remote environment on your own judgment, and never put one in a brief as a default.
- **Stage and commit in one command, with explicit paths:** `git add <new files> && git commit -m "…" -- <paths>`. Flags go before `--`; new files need `git add` first (a pathspec commit skips untracked files); name both sides of a rename.
- **Diff your paths right before the commit** (`git diff -- <paths>` in the same command): another session's hunk may have arrived. A pathspec commit takes the working tree, not the index.
- **After the commit read `git show --stat HEAD`** for strays, and push.
- **Committing only your hunks of a shared file:** use the temporary-index recipe in `docs/agents/traps-tooling-git.md` ("Committing through a temporary index"): capture `OLD` once, build from it, `commit-tree -S`, check `git diff --stat $OLD <new>`.
- **Never:** `git stash`, `git checkout -- <file>` (copy the file aside instead), a bare `git reset`, `git add -A` or `git add .`, `git add -N`, force pushes, or linking a second tree into this one's `node_modules`.
- Re-check `git status` at the start of a bout and after anything surprising (an edit whose old text matches twice, a file that already holds the change): the tree moved.
- Never commit secrets (`.env`, credentials). Never persist `TYPESAFE_API_KEY`.

## Delegating to subagents

Usage costs the maintainer money. Pick the cheapest model that can do the job well.

- **Haiku** for mechanical, well-specified work: a flag or config change, a rename, a version bump, a measurement that runs a script and reports numbers, a docs fix whose content is already decided. Give it exact files, exact commands and the proof to show.
- **Sonnet** for ordinary implementation and investigation: a feature inside one package with a clear design; a test or a budget; a bug hunt with a reproduction; a bundle or layout investigation; a refresh of a skill reference.
- **The default (most capable) model** for: deciding a published API's shape; security-sensitive code (authorization, identity, the wire, CSRF, caching across principals); changes spanning several packages' contracts; design notes; independent reviews.

A low-stakes subagent still follows every rule here. Its brief carries the git rules (shared worktree, explicit-path commits, the temp-index recipe, the never list), the checks to run, and what it must not touch. Subagents push and report; they do not wait for or run CI. The coordinating session checks CI and closes issues.

Run subagents in parallel only on disjoint files, and say in each brief what the others are editing. Never let two of them run Wrangler (or anything that refreshes the Cloudflare login) at once.

### A brief that does not make its agent wait

On 2026-11-18 the agents of one long effort spent most of their time waiting on commands: each ran the whole check list for every commit, cold, one command at a time. A brief sets the checks by these rules:

- **Name the inner loop, and keep it to what the change can break.** While building: the one project's typecheck and the one test file. Not `typecheck:force`, not a package's whole suite, not the site's prerender test. Say which files; an agent left to choose runs everything.
- **The whole check list and the review run once per piece of work, at its end** (format, the lint scripts, `mutate:check`, the docs check, the diff review). A commit inside the piece needs the project to compile and its own test green.
- **CI is the verdict on everything else.** An agent pushes and goes on; it does not run locally what CI runs in parallel (wide suites, bundle budgets it did not move, `pack:check`, e2e of examples it did not touch). The coordinator reads CI. Ask for a local run of a slow check only where the change is its subject.
- **A fast typecheck is for looking, `tsc` is for deciding.** `tsrs` (Cloudflare's Rust port, experimental) checked `packages/mixins-ui` in 25s against 64s and reported errors `tsc` does not. An agent may use it to find mistakes sooner; a commit is gated on `tsc -b <project>`.
- **Mutations in one run.** Give the agent the spec, not a name at a time: a run per name is a cold start per name.
- **One agent looks, the builders build.** Screenshots at four sizes and the Jev review, done by every builder for every widget, were most of the waiting. Builders write the browser test of what they claim; one review agent at the end of a batch takes the screenshots and runs Jev over the batch's diff. Ask a builder for screenshots only when the task is the look.
- **Size the checks to the risk.** A docs or example change needs its snippet compiled and nothing else. A published API change needs the type tests and Jev. Do not paste one maximal check list into every brief.
- **Let it work while a command runs.** Where memory allows, run a long command in the background and write the next piece; say so in the brief, and say when the machine is too full for it (then: one heavy command at a time, in the foreground).
- **No worktrees and no branches** (see "Git in the shared tree"): never a default in a brief.

## Reviewing a bout of work

When re-reading the bout's diff, check each of these deliberately:

- **Logic and correctness.** Does it do what the message claims? Trace the real control flow, not the intended one.
- **Edge cases.** Empty, missing, duplicate, already-aborted, out-of-order, called-twice, called-after-dispose.
- **Synergy with existing features.** Does it compose with what is already here, or bolt on a second way to do the same thing?
- **Types and TypeScript DX.** No accidental `any` (especially from `Parameters<>` on intersections or circular conditionals). Errors land at the mistake and read clearly. Inference works at the call site without annotation ceremony.
- **Comments.** Explain why, not what; delete any that restate the code. Doc comments on public API, none on the obvious.
- **Tests.** They must be able to fail (see "Tests").
- **Security hardening.** Untrusted input crosses a validation boundary before anything else; capability and authorization checks cannot be skipped; failures do not leak internals.
- **Performance.** Work done once at definition time rather than per call; no accidental O(n) lookups or repeated derivation in a hot path.

Fix what the review finds in a follow-up commit rather than letting it sit.

AFTER EVERY BOUT OF WORK, DOUBLE CHECK AND REVIEW!!!

## Jev preference review

Run it only on a change to a published package's API: one that adds, removes, renames or reshapes what a package exports (a function, type, option, Message, error or wire schema) or changes what it promises. Include the README and skill reference files the change updates (`--include` once per file). Do not run it on internal code, tests, mutation specs, examples, CI, scripts or docs alone.

```bash
npx jev-pref review --hunks --include <file>
```

- It is an independent semantic review of the current diff; it accepts at most 30k input tokens, so review while the change is small and use `--include` or `--exclude` for broad changes.
- Fix blocking findings and rerun. Consider every advisory finding: address it or say why it does not apply.
- Commit only on approval. Exit code 2 is a setup or infrastructure error, never approval.
- Stop after three review/fix iterations and ask the user how to proceed.
- Shared preferences live in `jev-pref.json`. When project guidance changes meaningfully, run `npx jev-pref sync` and follow its reconciliation: update the preferences when guidance adds, removes, weakens or strengthens a semantic rule judgeable from a diff; keep procedural rules here and deterministic rules in tooling. Encode only externally defined yes/no conditions or fixed taxonomies visible in Jev's input; subjective checks need observable criteria or removal. When you change `jev-pref.json`, check whether the prose here must change too.

## De-slop

Review for AI slop and remove it. Prefer deleting code to adding it; the smallest version a reader understands on one pass wins.

- **Dead abstraction.** Wrappers that only forward, files that re-export one module, options nobody passes, type parameters that appear once, `_tag` discriminants never discriminated on.
- **Unused exports.** If nothing imports it and it is not deliberate public API, delete it.
- **Comments that restate the code** (`// build the map`). Keep those that explain a non-obvious why: a workaround, a subtle ordering, a rejected alternative.
- **Doc-comment padding.** A one-line summary beats three sentences; no `@param` that restates the name.
- **Ceremonial defensiveness.** Guards for conditions the types rule out, `?? undefined` on an optional call, try/catch that rethrows unchanged.
- **Copy-paste tests.** Near-identical cases that differ by one literal belong in a table; repeated setup in a helper.
- **Inflated prose.** In docs and commit messages say the thing once; cut "powerful", "seamless", "robust", "simply" and restated headers.

Slop is also code that looks finished and is wrong:

- **Misunderstood tools.** Code written from a plausible model of a library instead of its source: assuming a Schema can refuse excess keys (only the decode call can); an outline on a `display: contents` element (draws nothing); indexing a plain object with a client-chosen name (reads `constructor` from `Object`); trusting `event.target` for a touch the browser captured where it went down. Probe the behaviour before building on it.
- **Claims the code does not keep.** A README promises "nothing stored makes it throw" but one path throws; a doc comment names a removed parameter; a commit says "refused" when the value is silently dropped; a type check compares payload shapes, not tags. Check every sentence against the code as you would a test.
- **Pseudo-code in docs.** A snippet with bare names (`base`, `Props`, `defaults`) no fixture defines is not an example: compile it or delete it.
- **Tests that pass for the wrong reason.** A fixture where key order and position agree; a scenario where the old path is already invalid so the mutation is behavior-equivalent; `toBeDefined()` on an always-defined value or an assertion that only proves the import is used.
- **Quiet fallbacks.** A default that turns a missing input into a wrong one (`owner ?? {}`, which SSR then refuses), a `catch` that hides a programming error, a no-op that still records an undo step. Fail loudly at definition time, or do nothing visibly.
- **Bad design.** Two ways to do the same thing; sibling APIs whose signatures disagree (one `active` takes an owner, the other invents one); a parameter typed wider than what works (`Schema.Top` where only a struct is read); a value decided at one moment and applied later after its inputs may have changed (a drop place worked out on pointer move, applied on release); a positional parameter list callers must count; a cast that makes a type promise nothing enforces; an option naming a member (field, relation, query, mutation) typed `string` (type it by the Entity's or binding's keys, or take the reference; #251); markup a package draws outside a Slot (a stylist reaches only Slots: put structural facts such as depth, state or position on a Slot as a custom property like `--fk-tree-level` or a data attribute).
- **Bad performance.** Work repeated per row that depends only on the whole; a lookup in a loop (`indexOf`, `includes`, `some`, array spread per item); derivation on every render or Model change of what changes with one input (memoize by that input's identity); listeners attached for a component's whole life that are needed only during an interaction.
- **Bad code.** Helpers copied instead of shared; a predicate spelled out twice; a function whose name no longer says what it does; comments separated from what they document; state threaded through closures where a value would do.
- **Tag branching the checker cannot see.** `x._tag === 'Ready'` on a precisely typed union is checked; on a value typed `{ _tag: string }` or read through a cast any string compiles, and an `if` run or a `switch` with a catch-all `default` compiles silently when a variant is added. Branch on every variant through the union's own `match` (`defineMessageUnion`, `defineTaggedUnion` from `foldkit/schema`, the `RemoteData` helpers) or Effect `Match.valueTags` / `Match.tagsExhaustive`; on a few with `matchOrElse` or `Match.tags`; narrow one with a single `===` on a typed union. A ternary over a tag is a two-arm match the checker cannot see: use the union's match even for two variants. Construct through the union's constructors (`Message.Variant(...)`, `Schema.TaggedStruct`), never an object literal with `_tag` outside a test fixture. Type a Schema AST as `SchemaAST.AST` and test it with its guards (`SchemaAST.isUnion`, `isNull`, `isLiteral`). Where the tag is open by design (another application's Message at a boundary) compare against a typed set and mark the line above `// tag-check: open` with why. `pnpm tags:check` finds the rest in every `src`; tests need review eyes for the same shapes. Ternaries over plain values stay (`cond ? a : b`); a ternary or `if`/`else` whose condition reads a tag, or a nested ternary, becomes `match` or a restructured branch; do not use Effect `Match` on booleans.
- **Spreading builds; it does not write.** `{ ...model, field }` and `{ ...link, update }` are ordinary construction. Model writes go through `modifyFields` in `update`, a no-op returns the Model it was given, and no spread may smuggle a transition past either rule. `ModelRef.set`/`modify` and `WritableProjection.set` install already-derived values (checkpoints, restoration, reconciliation), never a shortcut around a Message (`docs/state-model.md`).
- **`null` or `undefined` for "nothing here".** Absence is an Effect `Option` (`Option.none()`, `Option.some(x)`, `Option.match`, `Schema.Option` in a Model that is never stored); `T | null` makes every reader remember a check. Keep `null` only at a boundary that speaks it (JSON, a database column, the DOM, a foreign API) and convert there (`Schema.OptionFromNullOr` for stored data). An optional config field (`?:`) is fine.

## Tests

- **Verify every test can fail.** After writing tests, mutate the code under test (invert a condition, drop a guard, return a constant) and confirm the test goes red, then revert. Declare the mutations beside the tests (`test/<area>.mutations.ts`: `{ name, edits: [{ file, find, replace }], tests }`) and run `pnpm mutate <spec>`: it refuses a missing or ambiguous anchor, requires green tests first, applies edits in memory, and reports killed, survived, invalid or not applied. A mutation that cannot be killed says why (`survives`). If a test cannot be made to fail, delete it or replace it.
- Assert real behaviour, not a restatement of the implementation: no vacuous assertions, no tests that only exercise a mock, never weaken an assertion to make a test pass.
- **A claim about focus, layout or the pointer is a browser test** (`*.browser.test.ts`) in the view packages: jsdom lays nothing out and moves no focus. An example with a server has an end-to-end test (`examples/*/e2e/*.e2e.ts`, run with `pnpm e2e`) for what only the running page shows.
- Run a test from the repo root; after a package's behaviour change run `npx vitest run examples --project unit` too.

## Documentation and README standard

A README is an onboarding document first and a reference second: the reader understands the package's idea, ownership boundary and normal path before the API surface. Full standard: `docs/agents/readme-standard.md` (read it before writing or reviewing a README or guide).

- **Reading order:** what it is (one thesis); when it owns the problem and what a neighbouring package owns; the mental model (the smallest lifecycle or equation, naming the authoritative owner); install and a sixty-second example that teaches one mechanism; what each call does and does not do (I/O, state, mutation); common workflows and integrations; failure and recovery semantics; advanced and lower-level API; limits; reference.
- **Teach ownership before features.** Say who owns the authoritative fact or transition; distinguish observation, capability, caching, mirroring, replication and persistence from ownership; compare easily confused packages near the top; state what the package does not own. Ordinary Model changes happen in `update`, normally with `modifyFields`.
- **Examples are executable claims.** Read the implementation and real examples first; use exact current names and shapes; copy snippets from typechecked examples or tests; label schematic ones as pseudocode; verify negative claims ("this does not fetch") against source; a docs-only change still needs a diff review against source.
- **Progressive disclosure, not duplication.** Explain a mechanism once at the right level; keep the first example small; link to a guide or `examples/` demo for depth.
- **Review as a newcomer before calling it done:** after two paragraphs can I say what problem it solves? Do I know who owns the state? Is there one mental model before the API grows? Does the first example prove the core idea with minimal machinery? Are I/O and transitions explicit? Are advanced features introduced only after the need? Are failure and recovery visible before a bad architectural choice? Is every copyable claim verified, every diagram consistent with the implementation, every repeated catalogue removed? The usual failure is too much correct information in the wrong order.

## The `foldkit-plus` agent skill

`skills/foldkit-plus/` ([SKILL.md](./skills/foldkit-plus/SKILL.md)) is an Agent Skill, installed with `npx skills add doeixd/foldkit-plus --skill foldkit-plus`, that teaches agents what each package owns, when to use it, and a basic example. It is published documentation: treat it like a README, and read `SKILL.md` plus the `references/` file for the package before changing it. Detail: `docs/agents/skill.md`.

- `SKILL.md` is the map (under about 150 lines); depth lives in `references/<family>.md`, one level deep.
- A change that renames, removes or reshapes a public API, or changes what a package owns, updates the matching reference in the same change; a new package gets a row in the `SKILL.md` table. Bump `metadata.version` on release. Set a reference's first line (`Checked against <package> <version>, …`) to the current `package.json` versions only when you actually did that check.
- Every snippet must compile: copy it with minimal fixtures into a temporary `*.test-d.ts` in a project mapping the package names (`examples/kitchen-sink`), run `pnpm exec tsc -b <project>`, prove the file is checked with a deliberate error, delete it. Import published names (`foldkit-remote`), never `../src`.
- "See also" links are absolute `https://github.com/doeixd/foldkit-plus/blob/main/...` URLs; only links between files inside the skill are relative.
- Frontmatter: `name` matches the folder (lowercase, hyphens, at most 64 characters, no "claude" or "anthropic"); `description` at most 1,024 characters, third person, naming the packages and the words a user would say.

## Styling, themes, and tokens

One pipeline: `tokens -> ref -> pieces -> slots -> sheet`. Full guide: `docs/agents/styling.md` (read it before styling anything).

- **Tokens are the only values.** `Theme.tokens` (`packages/mixins/src/theme/tokens.ts`) is the shipped scales; the palette derives every color from knobs; `Theme.standard(Theme.make({ … }))` is both. Read every value through `Theme.ref` (a name the theme lacks is a type error); never copy a literal out of a theme into a style: add or override a token.
- **Knobs are typed values:** `Theme.make({ shape: { density: 1.1 } })`, checked against `Knobs.standard`; scales derive from them. A still or compact theme is one `Theme.make`, installed by name with `Themes.make`. A duration of something that moves or resizes also multiplies by `travel`, which the reset zeroes under reduced motion.
- **Install order is the cascade:** `Layers.standard` is `reset, tokens, theme, defaults, components, layouts, variants, utilities, app`. Compose a sheet with `Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme)), L.in('defaults', Defaults.body), ...slotStyles)` (`examples/todo-app/src/sheet.ts`); `Style.stylesheet` refuses an unlayered rule.
- **Pieces:** `Style.self` is normal (layerable); `Style.inline` sits outside every layer and beats `app`: only for values no theme may touch. Bases go in `components`, selections in `variants`, the application's `app` layer beats both. Recipes select (`Style.recipeFor`), applications extend (`.extend`, never a fork).
- **A state rule in a base loses to a variant that sets the same property; a shorthand beside a longhand can win (a rule's declarations are sorted); a shorthand in a state rule resets a base's longhands.** Write longhands in states and check computed style in a browser test.
- No `.css` files in examples: style with `foldkit-mixins` `Style` and `Style.stylesheet`.

## Traps: read before you change code

Every trap here cost real time. **Before you change code in an area, read the traps file for it in `docs/agents/`.** When you learn a durable lesson (one that would have saved the work you just redid), add it to the matching traps file, never to this file: a bold imperative lead, one sentence with the concrete failure (file or API, symptom, issue number or commit hash), and the fix or check. Merge it into an existing trap if it teaches the same lesson. When our own package behaves surprisingly (drops input, fails open, needs a workaround in caller code), file an issue on doeixd/foldkit-plus and link it from the trap (`(#n)`); delete the trap when the issue closes. Foldkit's own behaviour that we work around is also in `docs/upstream-foldkit-ssr.md`.

| File in `docs/agents/` | Read before |
| --- | --- |
| `traps-foldkit-runtime.md` | touching a Mount, Subscription, Command, lazy slot, embed or boot, URL Message, Scene test, or an upstream component (Menu, Listbox, Button, Dialog) |
| `traps-ssr-and-rendering.md` | server rendering, hydration, Resume or the loader entry, head tags, a page cache |
| `traps-bundling-and-builds.md` | a package's build or exports, declarations, a bundle budget, an import that may pull a namespace or server into a page |
| `traps-data-and-sql.md` | Remote, Entity, Guard, Sync, Form, live reads, the Drizzle, SQLite or Postgres code |
| `traps-cloudflare-and-servers.md` | a Worker, the Miniflare or Wrangler stack, D1, auth, an RPC or WebSocket server, server logging |
| `traps-css-and-layout.md` | styling or laying out a component, a theme knob, an animation, an overlay |
| `traps-effect-4.md` | writing Effect code from memory, bumping Effect, using a renamed or removed API |
| `traps-types.md` | a public type, a generic signature, a type test, an Option-returning API, TypeScript or tsgo tooling |
| `traps-async.md` | code that awaits, forks, subscribes, or depends on the order of Messages or frames |
| `traps-external-apis.md` | an adapter for a library or protocol we do not own (Agent Native, WebMCP), a schema boundary an agent calls |
| `traps-tests-general.md` | writing or reviewing any test, fixture, seeded walk or race test |
| `traps-tests-browser.md` | a `*.browser.test.ts`, an e2e test, a touch or pointer test, a layout assertion |
| `traps-tests-mutation.md` | a mutation spec, `pnpm mutate`, a surviving mutation |
| `traps-claims.md` | claiming something is absent, done or retried; editing a README, the changelog, a design note, a commit message |
| `traps-tooling-git.md` | staging, committing through a temporary index, moving files, restarting a branch |
| `traps-tooling-shell.md` | writing a file through a script, chaining commands with `&&` or a pipe, formatting |
| `traps-tooling-typescript-packaging.md` | a tsconfig, a package export, workspace resolution, a Vite config, running `tsc` |
| `traps-tooling-vitest-mutate.md` | running Vitest or `pnpm mutate`, a Vitest config or alias, driving a dev server and browser |
| `traps-tooling-ci-npm.md` | a dependency or lockfile, a publish or release step, a CI job, a Jev review |

Guidance files, same folder: `readme-standard.md` (READMEs and guides), `skill.md` (the skill), `styling.md` (themes, tokens, recipes).

### Traps that bite everywhere

- **A pipe, `;`, a trailing `for` loop or a heredoc hides a failed check.** Chain checks into the commit with `&&` and read the exit status; a check's last line is its summary, not its verdict (`format:check | tail -1` printed "Finished").
- **Read `Test Files` as well as `Tests`.** A file that fails to load counts no failed test.
- **Vitest does not typecheck.** Run the root `pnpm typecheck` after editing an example; when any project is red run `pnpm typecheck:force`, since `tsc -b` skips projects downstream of a red one. Use `tsc -b`, not `tsc -p`.
- **Write source with the Edit or Write tool, never a heredoc, `sed` or Python.** They turn `\n` into newlines, drop backslashes, write CRLF or cp1252, and `open(p, 'w')` truncates before it fails. Grep with `grep -F` and check bytes (`cat -A`) after writing escapes.
- **Format with `pnpm format`, never bare `oxfmt`, and only your own files** (`pnpm exec oxfmt <paths>`) while others work in the tree; then `pnpm format:check`. Markdown is not formatted.
- **An `Option` compared with `undefined` or `null` type-checks and is always unequal.** After changing a return to `Option`, grep callers for `=== undefined`, `=== null`, `?.` and `${`.
- **A no-op returns the Model it was given.** Foldkit renders only when the root Model changes identity; test with `toBe(model)`.
- **Run a test from the repo root, and a scratch probe from inside the package.** The root resolves the workspace to source; a probe from the root resolves a different `effect`.
- **Search case-insensitively, and scope a search to the claim before saying something is absent.** Read a library's source before describing its behaviour; probe, do not assume.
- **One heavy command at a time when memory is low,** in the foreground; do not start a second build, test run or dev server beside another.
- **Run `pnpm mutate:check` before committing a change to code that has mutation specs,** and `pnpm format`, the mutations, then `mutate:check`, in that order.
- **A package change needs `pnpm install` for the lockfile** (CI uses `--frozen-lockfile`) and, for a new export, `pnpm --filter foldkit-plus generate` then `pnpm paths`.
- **Add the changelog entry under Unreleased** (with the right heading) for every public change.
