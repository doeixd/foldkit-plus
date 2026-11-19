# Writing documentation

Read this before you write or edit any README, guide, skill reference,
changelog summary, upgrade guide or post. It replaces `readme-standard.md`.

Most of our documentation is accurate, compiles, and is hard to read. A
review of every document on 2026-11-19 (`docs/agents/docs-review-2026-11-19.md`)
found the same causes everywhere: pages open with what a package *is* in our
own words instead of the problem it solves; they use our terms before
explaining them; one 2,000-line file tries to be a landing page, a tutorial, a
reference and a design note at once; the first example compiles but never
runs or shows a result; and the prose is written in a clipped, inward voice
that only someone who built the package can follow. This guide exists so the
next document does not repeat them. Its rules come with checks you can run on
your own draft. The numbers are limits to stay under, not targets.

Paired before-and-after examples from this repository are in
[`writing-docs-examples.md`](./writing-docs-examples.md). Read them once.

## Who reads what

Every page has one reader in mind. Decide which before you write a line.

- **The stranger** arrived from a search, a link or the package list. They
  have not heard of Foldkit Plus and may not know Foldkit. They want to know,
  within one screen, what this solves and whether it is for them.
- **The adopter** has decided to use the package today. They want something
  working on their screen as fast as possible, with as few new ideas, imports
  and files in the way as possible.
- **The user with a question** already uses it: "how do I keep the sort in the
  URL?", "what does `throttle` do?", "why does my list stay empty?". They scan
  headings, land on one section and need an answer they can act on.
- **The coding agent** reads the skill. It needs the map (which package owns
  which job), one example that compiles, and the mistakes it would otherwise
  make, in as few tokens as possible.

A page that serves two of these at once serves neither: the stranger drowns in
reference, and the user with a question cannot find the answer in a story.

## Document types

Each type has one job. If something does not serve that job, it goes to the
type named under "Not here".

### The root README

- **Job:** tell the stranger what Foldkit Plus is and send each reader to the
  right package.
- **Shape:** the problem Foldkit Plus solves, in two or three sentences a
  newcomer understands (including one plain sentence on what Foldkit is);
  links to the running demos; a table "you want to…, use…" with short cells;
  one small example of one package doing one visible thing; install; where to
  go next.
- **Budget:** 1,200 words of prose.
- **Not here:** a composition of seven packages (an explanation page), the
  ownership graph (an explanation page), every install line (each package's
  landing page), version policy (the releases page).

### A package's landing page (its `README.md`)

This is the package's home page on the site and on npm. It is one page.

- **Job:** let the stranger decide, and get the adopter to a first result.
- **Shape:**
  1. *The problem*, in the reader's words, with the "before" (what you write
     today without this package). Then the plain idea of the fix. Then its
     name. One short paragraph each.
  2. *See it*: a link to a running demo or example, or a screenshot.
  3. *Install*: one command.
  4. *The first example*: one sentence on what it will show, the code, then
     what happened (the output, the URL, the picture).
  5. *What the example did*: the two to four calls that matter, each in a
     sentence that says what it does (not what it does not do).
  6. *When to use something else*: the neighbouring package for the case
     this one does not cover, in a sentence each.
  7. *Next*: links to the tutorial, the task guides and the reference, each
     with the question it answers.
- **Budget:** 1,500 words of prose, about 200 source lines.
- **Not here:** every option (reference), every feature (task guides),
  internals and why the design is so (explanation), version history
  (changelog), how this repository tests it (contributor docs).

### A tutorial

- **Job:** take the adopter from an empty project to one working feature they
  can see, one step at a time.
- **Shape:** what you will build (a picture); prerequisites; numbered steps,
  each adding one idea, each ending with what you see now; the finished file
  linked in `examples/`; next steps.
- **Budget:** 3,000 words. One per family is usually enough.
- **Not here:** alternatives at each step ("or you could…"), options the
  steps do not use, edge cases.

### A task guide ("how do I…")

- **Job:** answer one question a user has.
- **Shape:** the heading is the task ("Keep the sort order in the URL"); one
  sentence of context; the code; what happens; the one or two variations
  people ask for; a link to the reference for the rest.
- **Budget:** 1,200 words. Several short guides beat one long one.
- **Not here:** teaching the package from scratch (link the landing page).

### Troubleshooting

- **Job:** get a user from a symptom to the fix.
- **Shape:** each heading is a symptom as the user would say it ("The list
  stays empty after a reload"); then the cause in a sentence; then how to
  confirm it; then the fix. Remote's "When it does not do what you expect"
  is the model.
- **Not here:** failures nobody meets in practice.

### An explanation

- **Job:** tell a reader who has used the package why it works the way it
  does, so they can predict what it will do.
- **Shape:** the question it answers, as the title; the concrete situation
  that raises it; the idea, in prose; the consequences, each with an example;
  what was rejected and why. `docs/state-model.md`'s "Messages carry intent"
  section is the model: each rule comes with the bug it prevents.
- **Budget:** 2,500 words.
- **Not here:** steps (tutorial), option lists (reference). No ASCII
  diagrams: say it in prose, or use a real image.

### Reference

- **Job:** answer "what exactly does X do?" completely.
- **Shape:** one topic per file or section; for each export or option, what it
  does, when you would use it, its default, and what happens on bad input.
  Behaviour that takes more than two sentences gets a heading of its own.
- **Generated, not written:** signatures, parameter types and the list of
  exports. The site generates the API pages from the types and doc comments,
  so a type restated in prose is a second copy that drifts. Write what the type
  cannot say: the meaning, the default, the failure, the interaction with
  other options.
- **Not here:** a story, a first example, motivation.

### The skill (`skills/foldkit-plus/`)

- **Job:** give a coding agent the map and one working example, fast.
- **Shape of `SKILL.md`:** what Foldkit Plus is in three sentences; the table
  "job → package → reference file", with cells short enough to scan; one
  compiled example; the rules that apply to every package. Under 150 lines.
- **Shape of a `references/<family>.md`:** when to use this package and when
  another; the normal path as one compiled example; the five or so mistakes an
  agent makes with it, each with the fix; exact names of the main exports;
  absolute links to the README and guides for the rest.
- **Not here:** prose an agent does not act on (history, motivation, prior
  art). The mechanical rules (frontmatter limits, absolute links, the "Checked
  against" line, compiling snippets) are in [`skill.md`](./skill.md).

### A changelog entry

- **Job:** tell a user what changed for them.
- **Shape:** one entry per change, under the right heading in Unreleased:
  what a user sees or must do, then the API name, then, for a breaking change,
  the replacement. Plain words; no internal module names.
- **Not here:** how it was implemented, the hunt for the bug.

### An upgrade guide

- **Job:** get a user's project compiling and correct on the new version.
- **Shape:** ordered by what breaks first; each item shows the compiler error
  or symptom, a before/after diff, and one sentence of why.
- **Not here:** new features that need no change (the post or changelog).

### A post

- **Job:** tell a reader who may not use Foldkit Plus why this release
  matters to them. `docs/blog/2026-11-18-foldkit-plus-0.41.0.md`, compared
  with its first draft (`git show a32b4476e:docs/release-0.41.0.md`), is the
  model and the warning.
- **Shape:** open with a problem the reader has, not with what we did; a
  "before" picture; one section per big change, each with code or an image
  and a measured result stated plainly with its source; small changes in one
  closing list; upgrade notes linked, not inlined; an ending that says what
  to do next.

## How a package's documentation is split

One README per package, holding everything, is the main reason our pages are
unreadable: `foldkit-remote`'s is 4,553 lines and the site's home page for it
is everything before its first example, 567 lines. Split by document type:

- `packages/<name>/README.md` is the landing page and nothing else.
- Task guides, troubleshooting and written reference for a family live in
  `docs/<family>/<topic>.md`, one topic per file, named for the question
  (`docs/remote/troubleshooting.md`, `docs/mirror/cookies.md`).
- Explanations shared by several packages stay in `docs/<topic>.md`.
- Notes for people working on this repository (design notes, upstream
  workarounds, dependency audits, migrations of the past) live in
  `docs/design/` or `docs/agents/`, never among the user guides.

`examples/site/src/catalog.ts` already takes any file as a source of a family,
so the split needs only catalog entries. Three changes to the site and checks
would make it work well; until they land, keep READMEs short anyway:

1. The site cuts every source at its `##` headings and makes the README's
   first page everything up to a heading named like "Sixty seconds" or
   "Example". Once a README is a landing page it should render as one page.
2. The sidebar lists every cut page of every source (about 110 entries under
   `/remote`). It should group by type: start, guides, reference, API.
3. `scripts/docs-check.mjs` compiles `docs/*.md` but not `docs/<family>/*.md`.

## Hard rules, and how to check them

Run each check on your draft. A failed check is a defect, not a judgement
call.

1. **The first screen answers "what is this and is it for me?"** The first 150
   words after the title say what problem this solves and for whom, and link
   to something running. *Check:* copy those 150 words out and ask: could a
   developer who has never heard of us say what this does? Does it name a
   problem before it names a package or an API?

2. **Problem, then the plain idea, then the name.** Never introduce a concept
   by its name first. *Check:* find the first sentence that uses each of our
   nouns; the sentences before it must already describe the thing.

3. **Every term is explained where it first appears.** *Check:* list, in order
   of first appearance, every term of ours (Surface, Projection, Slot, Bundle,
   placement, wiring, durable…), every API name and every package name, each
   with the sentence that introduces it. Any entry whose sentence does not
   explain it, in plain words, is a defect. Foldkit's own terms (Model,
   Message, `update`, Command, Subscription) count too on a landing page:
   explain each in a clause or link one page that does. At most three new
   terms on the first screen.

4. **A runnable example comes early, and it is small.** On a landing page or
   tutorial the first example starts before word 400. It has at most 5 import
   lines and at most 25 lines after them. If the feature needs more, show the
   lines that are new and link the complete file in `examples/`. *Check:*
   count. Then check every identifier in the block is imported, defined in a
   visible block above, or explained in the sentence before it. A
   `<!-- docs-check -->` fixture may hide only what the reader has already
   written (their Model, their `h`), never the names the example teaches.

5. **Every example is framed.** One sentence before it says what it will show.
   After it, say what happened: the output, the URL, the rendered HTML, a
   screenshot. *Check:* is there a result the reader can compare with their
   own screen?

6. **One new idea per example.** *Check:* name the idea the example teaches.
   If you need "and", split it.

7. **Headings say what the section contains.** Use the task or the question
   ("Keep a draft across reloads", "Why is it still `Initial`?"). Never
   "Overview", "Introduction", "Core concepts", "Mental model", "Usage",
   "Details", "Advanced", "Example" on its own, or "API" outside reference.
   *Check:* read the headings alone, as the site's "On this page" shows them.
   Could the user with a question find their answer from them?

8. **Short cells, short sentences.** No table cell over 100 characters; a cell
   that needs more becomes prose under a heading. No table over 15 rows outside
   reference. No sentence over 40 words; no paragraph over five sentences.
   *Check:* `awk -F'|' '/^\|/{for(i=1;i<=NF;i++) if(length($i)>100) print FNR}' file`.

9. **Options say what, when and default.** "Writes at once instead of waiting
   for typing to pause. Set it when the value changes only on a click. Default:
   300 ms." Not the type restated. *Check:* each option's description answers
   all three.

10. **A failure is documented by its symptom first.** What the user sees, then
    the cause, then the fix. *Check:* would a user who searched for the symptom
    land here?

11. **Say what happens, not what does not.** A list of "it does not fetch, it
    does not store, it holds nothing" tells a newcomer nothing they can use.
    Say what the call does and where the thing it does not do happens instead.
    One "does not" where a reader would really expect the opposite is fine.

12. **Evidence plainly, with its source.** "A page with a breadcrumb is 27.8 kB
    smaller; a test fails if the menu comes back." Not a figure in parentheses
    after a hedge. *Check:* every number names what measured it.

13. **No history, no repository internals.** No "through 0.11.0", "since #192",
    "the design asks for", `pnpm` scripts of this repository, mutation specs or
    "in this repository" in user documents. History goes in the changelog and
    upgrade guides; an open limitation may link its issue under "Limits".
    *Check:* `grep -nE '#[0-9]{2,}|[0-9]+\.[0-9]+\.[0-9]+|pnpm (mutate|.*:check)'`.

14. **Every page ends with where to go next.** Not "See also" with ten links:
    the two or three next questions and the page that answers each.

15. **Link, do not repeat.** Each explanation lives in one place. *Check:*
    before writing a paragraph, search the other docs for it; if it exists,
    link it.

16. **Keep what makes our docs trustworthy.** Every snippet compiles. Every
    claim is checked against the source. State who owns the state and what
    the package does not own, after the reader has seen what it does. Name the
    one rule or lifecycle the package revolves around, in a sentence. Explain
    the failures that should change how someone designs their application
    before they could make that mistake.

## Voice

You are a colleague explaining something to a developer at their desk. Write
to them as "you". Use the active voice and concrete nouns ("the filter",
"the URL", "the server"), and sentences you would say aloud.

The "accurate and terse" register fails a newcomer because every clipped
sentence leaves out the context that makes it true, and only the author has
that context. "A Remote Projection does not fetch" is exact to someone who
knows what a Projection is, why one might fetch, and what fetches instead. To
anyone else it is three unknowns and a negation.

Phrasings to stop using, from our own documents:

| Instead of | Write |
| --- | --- |
| "None of these calls performs I/O." | "Nothing is fetched yet; the request starts when the page is shown." |
| "It reads no database." / "Nothing runs." | What it does: "It describes the rule; the server applies it when it saves." |
| "A capability **is** a Message." | "An agent can do only what your app's buttons can: each tool sends one of your Messages." |
| "Observation does not transfer ownership." | "Reading a field does not let a package change it; only your `update` does." |
| "That is the whole architecture:" | Show the result, then stop. |
| "the parser stack the design asks for" | The reason itself, or nothing. |
| "(see #538)", "Through 0.11.0 …" | Move it to the changelog or the Limits section. |
| "What each call does, and does not do:" | "What happened:" followed by what happened. |
| "deliberately", "merely", "honest", "simply" | Delete. |

No hype either: "powerful", "seamless", "robust", "blazing", "elegant",
"effortless". Show the thing and let the reader judge.

## How to write one

1. **Use it as the reader would.** Start from an empty file in a scratch
   project (a temporary `*.test-d.ts` in `examples/kitchen-sink` for types;
   an example under `examples/` for running code) and follow your own draft.
   Write down every point where you had to look something up. Each is a
   sentence the document is missing.
2. **Pick the type and the reader.** Write them at the top of your notes.
3. **Write the reader's question for each section** before the section. The
   question becomes the heading, or close to it.
4. **Draft** the first screen and the first example first. If you cannot
   write the first screen without our vocabulary, you do not yet know what
   problem the package solves for someone else. Find out (read the examples,
   the issues, the demo) before writing the rest.
5. **Cut.** Delete every sentence that does not answer its section's
   question. Move reference to reference. Move history to the changelog.
6. **Run the hard-rule checks** above, the term check (rule 3) last.
7. **Compile every snippet:** `node scripts/docs-check.mjs <file>` for a
   README, `docs/*.md` or the skill; for anything else, the temporary
   `*.test-d.ts` recipe in [`skill.md`](./skill.md).
8. **Verify every claim against the source.** Read the implementation and the
   real examples, not your memory or a design note. Use exact current names
   and shapes. Confirm negative claims ("this never fetches") in the code.
   Check that snippets compose with each other. A documentation-only change
   still gets a diff review against the source.
9. **Have a cold reader check it.** Spawn an agent with no context (a Sonnet
   is enough) and brief it as below. Fix what it reports. If you changed the
   first screen or the first example, repeat with a new agent.

### Briefing the cold reader

An agent that knows it is reviewing your work will approve it. Give it a
reader's task instead:

- Give it only the document's path. Tell it not to open any other file, the
  source, or the web: it knows TypeScript and nothing about Foldkit or
  Foldkit Plus.
- Ask it, after reading only the first 150 words, to write two sentences on
  what the package does and whether it would use it for a scenario you name.
  Compare them with yours: if they differ, the first screen failed.
- Ask it to list every word or name it could not explain at the point it met
  it, with the line.
- Ask it to follow the first example and list everything it would need that
  is not on the page.
- Give it three concrete questions a user would ask (written before you show
  it the page) and ask it to quote the answer or say where it looked and gave
  up.
- Ask for the three sentences it had to read twice.
- Ask for problems only: no summary, no praise, no overall grade.

## Checklist

Before you call a document done:

- [ ] I know its type and its one reader.
- [ ] The first 150 words name a problem the reader has, before any name of
      ours, and link to something running.
- [ ] Every term, API and package is explained where it first appears (term
      list made); at most three new on the first screen.
- [ ] The first example starts before word 400, has at most 5 imports and 25
      lines, defines everything it uses, and shows what happened.
- [ ] Each example teaches one idea and is introduced by one sentence.
- [ ] Headings name tasks or questions; no "Overview", "Core concepts", "Usage".
- [ ] No table cell over 100 characters; no sentence over 40 words.
- [ ] Options give what, when and default; failures start from the symptom.
- [ ] Sentences say what happens; numbers name their source.
- [ ] No history, issue numbers or repository scripts outside the changelog
      and Limits.
- [ ] It ends with the next two or three questions and where they are answered.
- [ ] Within its word budget; anything over moved to its own page.
- [ ] Snippets compile; claims checked against the source.
- [ ] A cold reader read it and I fixed what it reported.
