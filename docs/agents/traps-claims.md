# Traps: claims about the repository and its documents

Read before claiming something is absent, done or retried, or before editing a README, the changelog, a design note or a commit message.

- **A search that proves an absence must cover the space the claim names.** I
  wrote "there is no benchmark anywhere in this repository" after listing
  `packages/remote/test`; there is a `pnpm bench` script, a CI workflow,
  `docs/benchmarks.md` and three `packages/*/bench` directories. The same week I
  wrote "evo item 2 is done" after grepping `examples/`, when the item's scope
  says "examples, package READMEs, and conceptual docs" — and the root README's
  own snippet was the violation. Both claims were then used to justify further
  decisions. Scope the search to the claim, or narrow the claim to the search.

- **Search a library for a name by its own spelling.** A grep for
  `AriaRowCount` found nothing, so the grid wrote `aria-rowcount` with
  `h.Attribute` and its design said Foldkit had no such builder; Foldkit spells
  it `AriaRowcount`. Before calling something absent, search case-insensitively
  and read the builder list itself.

- **A commit hash in a comment is read from `git log`, never written from
  memory.** Two issue comments in one session named a commit that did not
  exist (`7d0e`, `4f2…`), each corrected only on rereading. Run `git log -1
  --format=%h` in the step before posting, and paste its output.

- **Update the summary in the same change as the section.** Per-phase notes
  landed while `§0`'s findings table and `§13`'s status banner still described
  the old state — the banner said "3 onwards are not started" directly above
  three sections headed *done*. A stale claim is worse than no claim because it
  reads as current, and this recurred four sections after I committed that
  sentence.

- **A package README is a website guide, and a guide names no design note.**
  `examples/site` publishes every README and `docs/` guide, and
  `guides.test.ts` refuses a link or mention of `docs/design/`, `-DESIGN` or a
  plan; three READMEs in one day linked their new design note and failed it
  at HEAD. Say the reason in the README itself; the design note links to the
  README, never the other way.
- **The changelog is a document the commit list does not remind you of.**
  About fifty commits of the page builder updated each README and the skill
  but not `CHANGELOG.md`, which the plan requires in every change, and its
  unreleased entries went on naming APIs since removed. Before committing a
  public change, add its entry under Unreleased, and fix an unreleased entry
  the change makes wrong rather than logging a removal of it. When Unreleased
  has no heading for the kind of change (`### Changed`), add it: two entries
  were appended to the last release's `Changed` that way, and read as shipped.

- **A declared option nothing reads is worse evidence of demand than no
  option.** `LivePolicy` was typed, documented, carried on the descriptor and
  present in the Message schema, and nothing in the production path ever set it,
  so every live insert took the default. I had cited it in a design document as
  "the caller that already shipped" — the strongest evidence that work had
  demand. Grep for the field being *written*, not declared. (See also: an unused
  parameter is a promise the runtime does not keep.)

- **Do not delete scratch work that has a home in the repo.** A throwaway
  benchmark was deleted with "there is no bench infrastructure here to fit it
  into", which left published numbers nobody could reproduce. Check for the
  convention before concluding there is none.


- **"It retries" is a claim about what restarts it.** A Remote read entry
  restarts only when its dependencies change. A failed query or read that
  changed nothing in the Model changed nothing in the plan, so nothing
  retried, and a list sat at `Initial` for good. The docs said "the
  subscription retries" in three places. Before writing that something
  happens again, find the condition that makes it happen and check the
  failure path meets it.
