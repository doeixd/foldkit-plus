# Traps: claims about the repository and its documents

Read before claiming something is absent, done or retried, or before editing a README, the changelog, a design note or a commit message.

- **A search that proves an absence must cover the space the claim names.**
  "There is no benchmark anywhere in this repository" came after listing `packages/remote/test`; there is a `pnpm bench` script, a CI workflow, `docs/benchmarks.md` and three `packages/*/bench` directories. "Evo item 2 is done" came after grepping `examples/` when its scope also names package READMEs and conceptual docs (the root README's own snippet was the violation). Both then justified further decisions: scope the search to the claim or narrow the claim.
- **Search a library for a name by its own spelling.**
  A grep for `AriaRowCount` found nothing, so the grid wrote `aria-rowcount` with `h.Attribute` and a design said Foldkit had no such builder; it is `AriaRowcount`. Search case-insensitively and read the builder list before calling something absent.
- **A commit hash in a comment is read from `git log`, never written from memory.**
  Two issue comments named commits that did not exist (`7d0e`, `4f2…`). Run `git log -1 --format=%h` in the step before posting and paste its output.
- **Update the summary in the same change as the section.**
  Per-phase notes landed while `§0`'s findings table and `§13`'s status banner still described the old state (the banner said "3 onwards are not started" above three sections headed *done*). A stale claim reads as current.
- **A package README is a website guide, and a guide names no design note.**
  `examples/site` publishes every README and `docs/` guide and `guides.test.ts` refuses a link or mention of `docs/design/`, `-DESIGN` or a plan; three READMEs in one day linked their new design note and failed at HEAD. Say the reason in the README; the design note links to the README, never the reverse.
- **The changelog is a document the commit list does not remind you of.**
  About fifty page-builder commits updated each README and the skill but not `CHANGELOG.md`, which the plan requires in every change, and its unreleased entries went on naming APIs since removed. Before committing a public change add its entry under Unreleased, fix an unreleased entry the change makes wrong rather than logging a removal of it, and add the heading (`### Changed`) when Unreleased lacks one (two entries appended to the last release's `Changed` read as shipped).
- **A declared option nothing reads is worse evidence of demand than no option.**
  `LivePolicy` was typed, documented, on the descriptor and in the Message schema, yet nothing in the production path set it, so every live insert took the default; a design document cited it as "the caller that already shipped". Grep for the field being written, not declared (see also: an unused parameter is a promise the runtime does not keep).
- **Do not delete scratch work that has a home in the repo.**
  A throwaway benchmark was deleted ("there is no bench infrastructure here") and left published numbers nobody could reproduce. Check for the convention first.
- **"It retries" is a claim about what restarts it.**
  A Remote read entry restarts only when its dependencies change; a failed query or read that changed nothing in the Model changed nothing in the plan, so nothing retried and a list sat at `Initial` for good (the docs said "the subscription retries" in three places). Find the condition that makes it happen and check the failure path meets it.
