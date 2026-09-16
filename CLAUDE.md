# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for the working agreements in this repository:
commit cadence, the commit review checklist, testing rules, and the mandatory
[documentation and README standard](./AGENTS.md#documentation-and-readme-standard).

When writing or revising package docs, follow that section deliberately: teach
the ownership boundary and mental model before the API surface, keep the first
example minimal, use progressive disclosure, and verify copyable snippets
against the current implementation and real examples.

For what each package is for and a basic example of each, load the
[`foldkit-plus` skill](./skills/foldkit-plus/SKILL.md) and its
`references/` file for the package at hand. It is also published for users
(`npx skills add doeixd/foldkit-plus --skill foldkit-plus`), so a public API
change updates the matching reference file in the same change; see
[the skill section of AGENTS.md](./AGENTS.md#the-foldkit-plus-agent-skill).
