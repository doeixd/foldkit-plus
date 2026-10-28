# Docs from the installed packages: `npx foldkit-plus docs` (#252)

Status: built (2026-10-27) in `packages/plus` (`src/docs.ts`,
`src/project.ts`, `src/cli.ts`). What is left is under [Deferred](#deferred).
The MCP server first built beside it (`npx foldkit-plus mcp`) was removed at
the user's request the same day; an agent runs the CLI command instead.

## The problem

The skill's references are long (`remote.md` is about 870 lines, and
`foldkit-remote`'s README is 2,300). To answer "does Remote have X?", an agent
greps several files and reads a few hundred lines around each hit, and still
cannot tell a missing feature from an undocumented one. It does this many
times a session, and a person new to the project does it too.

The answer also has to describe the version the application has. Docs on
`main` describe APIs a project may not have yet, and #230 found Yielded's docs
on `main` naming an API the pinned release lacks. So the source is what is in
`node_modules`, not the network.

## The choice

`npx foldkit-plus docs <query>`, a command beside `setup` in the `foldkit-plus`
CLI. No new package.

```text
project folder
  -> each Foldkit Plus package an import would load -> README.md, dist/**/*.d.mts
  -> the foldkit-plus skill, if installed           -> SKILL.md, references/*.md
  -> Markdown split into sections -> ranked against the query -> 3 sections
  -> a symbol also -> its declarations in the .d.mts
```

### Options considered

1. **An index built at publish time**, shipped in `foldkit-plus`'s `dist`.
   It would describe the READMEs of the release it was built with. But the
   skill is not in any package (users install it with `npx skills add`), so
   the index would either leave it out or freeze a copy of it, and a project
   that moves one package ahead of `foldkit-plus` would read the old README.
   It is also a second artifact derived from the docs that has to be kept in
   step. Rejected.
2. **Reading what is installed, at query time.** The READMEs and `.d.mts` are
   already in every installed package (`files: ["dist", "README.md", …]`), and
   the skill is wherever the user put it. Parsing about 30,000 lines of Markdown
   takes well under a second. Chosen: nothing to maintain, and it cannot
   describe another version than the one there.
3. **A separate package (`foldkit-docs`)** or a network service. The user ruled
   out a new package, and the network answers for `main`.
4. **The TypeScript compiler API for declarations.** It would read types
   exactly, but `foldkit-plus` does not depend on `typescript`, and TypeScript
   7 ships no compiler API (AGENTS.md). The bundled `.d.mts` that tsdown emits
   are regular enough to read as text (below).

## What is read, and how

All of it is read when the command runs; nothing is cached.

- **Which packages.** The set of names is derived, not listed: the
  `foldkit-*` dependencies and peers in the CLI's own manifest, plus those in
  the manifest of the `foldkit-plus` installed in the project, if there is one.
  Each is looked for the way an ESM `import` finds it, in the nearest
  `node_modules` above a folder, with links resolved. `NODE_PATH` and the global
  folders, which `require.resolve.paths` adds, are not used, because ESM ignores
  them (pnpm sets `NODE_PATH`, and under it a probe found a stray copy).
  - A package the project names is looked for from the project's folder:
    that is what the application's own imports load.
  - Any other package is looked for from beside `foldkit-plus`, which is where
    pnpm's store keeps its dependencies. Only then is the project's folder
    tried. A copy in a folder above the project must not stand for the one
    `foldkit-plus` brings.
- **READMEs.** The `README.md` of each package found. The topic is the name
  without `foldkit-` (`remote`).
- **The skill.** The nearest `<dot-folder>/skills/foldkit-plus/SKILL.md`. It is
  looked for in the project's folder and those above it up to the repository
  root, which covers `.agents/skills` (where `npx skills add` installs it),
  `.claude/skills` and the other agents' folders, and then in the home folder,
  where a global install lands. The skill's `metadata.version` is part of each
  section's label. Its topics are `skill` and each reference's name, so
  `--list remote` outlines both the README and `remote.md`.
- **Declarations**, only for a query that looks like a symbol (`Data.preload`,
  `RemoteData`: identifiers joined by dots, with a dot or a capital). Every
  `dist/**/*.d.mts` of each package is read, except `foldkit-plus`'s, whose
  types re-export the others'.
  - `X` gives `declare … X` with its doc comment. An object or interface is
    shown as its first line and the names of its members, which is what
    answers "does `Remote` have X?".
  - `X.y` gives member `y` of a declared `X`. When `X` is declared nowhere
    (`Data` is a value an application makes with `Remote.make`), it gives every
    member named `y`.
  - A name the bundler renamed (`Query$1`) is found by its own name.
  - A signature is read until its brackets close on `;` or `,`, at most 25
    lines.

### Refusals

The command fails loudly, with exit status 1 and a message that says what to
do, in these cases:

- a folder with no `package.json`;
- a project with no Foldkit Plus package installed (it points to `setup`);
- a package the project's `package.json` names but has not installed;
- a query nothing matches (it says how many documents were searched);
- `--list` of a topic nothing covers (it lists the topics there are).

A package the CLI knows of that the project neither names nor has is not a
fault: it is simply not used.

## Ranking

A section is a heading and the lines under it, up to the next heading of any
depth. Fenced code is not split, so a `#` inside a fence is not a heading.
Sections are ranked with BM25 (k = 1.2, b = 0.75) over their words:

- A word is lowercased, and a plural, tense or `-ly` ending is dropped, so
  `deletes` meets `delete`.
- A heading's words count three times.
- The whole query as written earns a bonus: twice the query's weight in the
  heading, once in the body. So `Data.preload` in a code block beats
  `data` and `preload` scattered across a section.
- A section with none of the query's words is left out. Ties keep document
  order.

The three best are printed. For a symbol, the declarations of the package
whose section ranks highest come first.

## Output

The default is Markdown, which serves both readers. An agent reads it as
context, and a person reads it in a terminal.

- It starts with `# <query>`.
- For a symbol, `## Declarations` follows: each declaration's doc comment and
  signature in a `ts` block, with its file and line.
- Then each section, under `## <heading>`, with a citation line:
  `From foldkit-remote@0.21.0 README.md › foldkit-remote › … (path:line,
  #anchor)`.
- A body longer than 60 lines is cut. A fence it left open is closed, and a
  last line names the file and line where the rest starts.

The absolute path is printed because the reader's next step is to open that
file at that line.

`--json` prints `{ query, declarations, sections }` for a program, each
section with its source, path, line, anchor, headings, score and full text.
A query that found nothing is reported in words on stderr even under
`--json`, with exit status 1.

`--list` with no topic lists the installed documents and their topics. With a
topic, it prints each matching document's headings as an indented outline,
with line numbers.

## Tests

- `docs.test.ts`: sections, ranking, declarations and rendering, as pure
  functions.
- `project.test.ts`: discovery on a pnpm-shaped fixture. `foldkit-plus` is
  linked into a store that holds its dependency, and an older copy of that
  dependency sits above the project and must not be read.
- `cli.test.ts`: builds the CLI with tsdown and runs `setup` and `docs`
  beneath a stray Effect 3.

`docs.mutations.ts` breaks each of these in 20 ways, and each is killed. The
CLI's own glue is not in it: `cli.test.ts` builds from the disk, which
`pnpm mutate`'s in-memory edits never reach, so that one was checked by hand.

## Deferred

- **Foldkit's own docs.** `foldkit` and `@foldkit/ui` are not Foldkit Plus
  packages and ship their own skills. A query about `Command` or `h.div` finds
  nothing here.
- **Checked examples (#229).** The sections are only as true as the READMEs.
  #229's CI job, which typechecks their code blocks against the published
  packages, is what makes an answer's example trustworthy.
- **Narrowing a search to one package** (`--in remote`). `--list <topic>` and
  the citation line cover it for now. Add the flag when a query's best sections
  keep coming from the wrong package.
- **Declarations through re-exports.** A symbol is found where it is declared.
  An alias declared only in an `export { A as B }` list is not followed, which
  matters for a package that renames on export. None of ours do today.
