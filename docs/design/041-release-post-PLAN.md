# Plan: the release post for 0.41.0

A plan for writing the post that announces 0.41.0, written on 2026-11-18. Nothing here is drafted yet. The release itself is described in `CHANGELOG.md` under `## 0.41.0` and in [589-example-factories-DESIGN.md](./589-example-factories-DESIGN.md).

The post succeeds when a reader who uses the library knows within two minutes whether to upgrade and what it costs, and a reader who does not use it sees one thing worth trying.

## What makes a release post good

- **One idea leads.** A release this size has a hundred changes and readers keep one. For 0.41.0 it is: every variation of a widget comes from the package's own factories, and a page ships only the features it uses.
- **It shows before it tells.** A before and after snippet, a short clip, a number. "More composable" persuades nobody; "a breadcrumb page dropped 27.8 kB" does.
- **It is honest about cost.** Breaking changes get a section of their own with the exact rename, not only a link to the changelog. Plain bad news makes the good news credible.
- **It serves two readers.** A newcomer wants to know what this is and why it differs. A user wants the upgrade path. The top serves the first, the middle the second.
- **Every example runs.** Snippets are copied from compiled code, and demos link to live pages.
- **It can be scanned.** Headings that say something, short paragraphs, and a summary at the top that stands alone.
- **It ends with a next step.** The install line, the upgrade section, the demos.

## Outline

1. **Opening**, three or four sentences. What Foldkit Plus is in one line, what 0.41.0 changes in one line, who should care.
2. **Examples you configure, not copy.** The problem: other libraries ship example source to paste, and ours shipped options that did not cover the variations. The four parts in plain words: the look (`recipe.add`), the state (`Bundles`), the drawing (`configure`), and features as values you pass. One widget shown three ways, linked to its live page.
3. **You ship what you use.** The measured numbers: freezing styles saves 22.4 kB brotli on a one-Button page, and a breadcrumb page dropped 27.8 kB once its menu became a passed value. Each number links to how it was measured.
4. **New things to try.** FileUpload, CodeBlock's line marks and collapsing, themed text selection, the Primitives gallery. One image or clip and two sentences each.
5. **Upgrading.** The breaking changes grouped by kind (`words`, passed features, tone `danger`, one `clear` option, `AppShell.view`'s `main`, the rest), a before and after for each group, and an honest estimate of the effort. The changes are many and shallow: say so.
6. **Under the hood**, short. The Chrome 157 colour fix as a small story (a low-chroma colour not written in OKLCH loses its hue, so tints went pink). CI from 36 minutes to 17.
7. **What is next, and thanks.** The missing primitives (#596), `Dialog.view` and `Popover.view`, the `make` factories for Sidebar and Questionnaire.

## Steps

1. **Decide the audience and the channels.** The site, the GitHub release and a short social thread are three lengths of one piece. Write the long one and cut the others from it.
2. **Gather the evidence before drafting.** The Phase 0 measurements (recorded in the design note and the progress file), the changelog summary, links to the live pages, and three or four clips recorded from the deployed site.
3. **Write the upgrade section first.** It is the part that must be exactly right, and writing it shows which changes actually hurt.
4. **Draft the headline section around one worked example**, compiled in the repository as the README snippets are.
5. **Cut.** Target 1,200 to 1,500 words. The rest belongs to the changelog, which the post links.
6. **Verify.** Every snippet compiles, every link resolves, every number traces to a measurement.
7. **Read it as a stranger** who has never heard of Foldkit. If the first screen does not say what this is, fix that before publishing.

## Risks particular to this release

- **It is too big to list.** The pull is to enumerate ninety widgets. The changelog does that; the post does not.
- **The breaking list reads scarier than it is.** Most entries are renames. Group them and say how long an upgrade takes.
- **The site has no place for posts.** The simplest home is a guide-style page on the site plus the GitHub release body, which today holds the changelog summary.
- **Screenshots age.** Record them after the phone-layout and code-block fixes now in progress are deployed.

## Not decided

- Where the post lives on the site, and whether the site gains a section for posts.
- Who the first reader is: an existing Foldkit user, or someone comparing UI libraries.
