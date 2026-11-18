Read when: changing a public API, adding a package, or editing `skills/foldkit-plus/`.

## The `foldkit-plus` agent skill

[`skills/foldkit-plus/`](../../skills/foldkit-plus/SKILL.md) is an
[Agent Skill](https://agentskills.io) that teaches coding agents what each
package owns, when to use it, and basic examples. Users install it with
`npx skills add doeixd/foldkit-plus --skill foldkit-plus`
([skills.sh](https://skills.sh)), which looks for `skills/<name>/SKILL.md`.
It is published documentation: treat it like a README.

Use it yourself, too: for what each package is for and a basic example of
each, read `SKILL.md` and the `references/` file for the package at hand
before changing it.

- **Layout.** `SKILL.md` is the map: what Foldkit Plus is, which package owns
  which state, how they connect, one small example. It stays under ~150 lines,
  because an agent loads all of it once the skill triggers. Depth lives in
  `references/<family>.md` (`surface`, `remote`, `sync`, `mirror`, `agent`,
  `mixins`), one level deep, read only when needed.
- **Keep it in step with the API.** A change that renames, removes, or
  re-shapes a public API, or changes what a package owns, updates the matching
  reference file in the same change. A new package gets a row in the `SKILL.md`
  table and a place in a reference file. Bump `metadata.version` on release.
  Each reference's first line, `Checked against <package> <version>, …`, names
  the versions in the tree when it was last checked against the code: set it
  to the current `package.json` versions whenever you do that check, and only then.
- **Examples are executable claims here too.** Every snippet must compile
  against the current code: copy it with minimal fixtures into a temporary
  `*.test-d.ts` in a project whose tsconfig maps the imported package names
  (`examples/kitchen-sink` maps all of them), run `pnpm exec tsc -b <project>`,
  prove the file is checked with a deliberate error, then delete it. Import from
  published names (`foldkit-remote`), never `../src`.
- **Links are absolute.** The skill is installed without this repository, so
  "See also" links are `https://github.com/doeixd/foldkit-plus/blob/main/...`
  URLs; only links between files inside the skill are relative.
- **Frontmatter limits.** `name` matches the folder, lowercase and hyphens, at
  most 64 characters, no "claude" or "anthropic". `description` is at most 1,024
  characters, in the third person, naming the packages and the words a user
  would say, because it is all an agent sees when deciding to load the skill.

