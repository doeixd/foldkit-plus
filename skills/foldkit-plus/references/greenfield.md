# Starting a new application

For an empty folder, or a user who says "build me an app". Extending an
existing application is `npx foldkit-plus setup` alone.

The order is the point: **understand, record, map, agree, then build.** Do not
scaffold features before the domain is agreed; do not write entities before
the user has said what the domain is. Every phase leaves a file in the project,
so a later session (or another agent) picks up where this one stopped.

```text
1 brief -> 2 scaffold -> 3 domain rounds -> 4 survey + mapping -> 5 implement
  ask       create        ask, record       read, propose        on "go"
```

## 1. The brief

Ask, in one message, and wait for the answers:

- **Name** of the project (it becomes the folder and `package.json` name).
- **Goal**: what it is for, in a sentence, and who uses it.
- **Must-haves** for a first version, and what is explicitly later.
- **Where it runs**: a static host, a Node server, Cloudflare Workers; does
  it need SEO or a first paint before scripts (decides `ssg`/`ssr` over `spa`)?
- **Package manager** (pnpm, npm, yarn, bun), if they care.

Ask about constraints that change architecture now, not later: offline use,
several devices editing the same thing, sign-in, content editors who are not
developers, AI agents acting in the app.

## 2. Scaffold

In the parent folder, run `npx foldkit-plus setup`: with no `package.json` it
prints the `create-foldkit-app` release whose Foldkit matches this release, as
a non-interactive command. Run it with the brief's answers:

```bash
npx create-foldkit-app@<version setup names> --name <name> --rendering <spa|ssg|ssr> --example counter --package-manager <manager>
cd <name>
npx foldkit-plus setup
```

Follow the second `setup` output (install, the skill, imports). Install an
adapter only when the mapping (phase 4) calls for it. Then:

- Run the project's `typecheck` and `test` once, so a later failure is yours.
- Create `docs/domain/` and add a line under **Project Notes** in the
  scaffold's `AGENTS.md`: "The domain, its decisions and its mapping to Foldkit
  Plus are in `docs/domain/`; read them before changing the app."
- Write `docs/domain/brief.md` from phase 1's answers.

The scaffold's counter is a placeholder: leave it until phase 5 replaces it.

## 3. Domain rounds

Ask a few questions at a time (three to six), grouped by topic, and record the
answers before asking more. Keep going, round after round, **until the user
says to stop**. Use their words for names; ask when two words might mean one
thing. Skip a topic the brief already settled, and come back to one an answer
reopened.

| Topic | Ask |
| --- | --- |
| Language | What are the nouns? Which are things with identity (a Project), which are values (an address)? Which words do users use for them? |
| Fields | What does each thing hold? Which fields are required, unique, derived from others, limited (a length, a range, one of a set)? |
| Identity | How is each identified: generated id, a slug, a natural key? Can it change? |
| Relationships | What belongs to what? One or many on each side? What happens to the children when a parent goes? |
| Lifecycle | What states does a thing pass through (draft, published, archived)? Which moves are allowed, and which are not? |
| Invariants | What must always be true ("a project has one owner", "stock is never negative")? What must never happen? |
| Interactions | What can a user do: create, edit, archive, approve, invite, reorder? Which are one step, which a flow? |
| People | Who uses it: visitors, members, editors, admins? How do they sign in? |
| Permissions | Who may see and do each interaction, and on which rows ("only the owner", "members of its project")? Which fields are hidden from whom? |
| Ownership of data | What lives on a server and is shared? What does one person write that must survive going offline? What belongs in the URL (filters, the open item)? What is only on screen? |
| Display | Which screens, lists, details, forms? Filtering, sorting, pagination? Anything a grid, a board or a builder? |
| Content | Long-form text, drafts and publishing, pages an editor lays out, images and uploads? |
| Live and offline | Must others' changes appear without a reload? Must it work offline, on several devices at once? |
| Agents | Should an AI agent read or act in the app? Which actions, for whom? |

Record every round in `docs/domain/`:

- `rounds.md`: each question and the user's answer, verbatim, dated, appended.
- `model.md`: the current understanding, rewritten as answers come in: each
  entity with its fields, identity, relationships, lifecycle and invariants;
  each interaction and who may do it; open questions at the bottom.

Beside each decision in `model.md`, note the package it points to, as a hint
for phase 4 ("archived only by an admin → a principal guard on an `Archive`
interaction, `foldkit-guard`").

## 4. Survey and mapping

Before proposing anything, read this skill's `SKILL.md` and the reference of
every package the model touches, so the mapping uses the APIs as they are.
Then write `docs/domain/mapping.md`: every concept of the model, where it
lives, and through which API.

| In the domain | Owned by | Reference |
| --- | --- | --- |
| A thing with fields, identity, relations, derived members | `foldkit-entity`: `Entity.define`, `Relation`, Selections | [entity.md](entity.md) |
| Shared server data, its queries and mutations, live updates | `foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle` | [remote.md](remote.md) |
| One person's edits that survive offline and converge across devices | `foldkit-sync` (`/entity`, `/journal`) over `foldkit-durable` | [sync.md](sync.md) |
| Who may see and do what, per interaction and row | `foldkit-guard` and its seam subpaths | [guard.md](guard.md) |
| Who is signed in | `foldkit-auth` over Yielded Auth | [auth.md](auth.md) |
| A screen's state in the URL, or remembered locally | `foldkit-mirror` | [mirror.md](mirror.md) |
| Routes, their hierarchy and titles | `foldkit-site` | [site.md](site.md) |
| Forms, drafts, validation | `foldkit-form`, `foldkit-mixins-form` | [form.md](form.md) |
| Edit, create, list and detail screens over Remote | `foldkit-crud`, `foldkit-mixins-crud` | [crud.md](crud.md) |
| A spreadsheet-like grid | `foldkit-data-grid`, `foldkit-mixins-data-grid` | [data-grid.md](data-grid.md) |
| Drafts, revisions, publishing, editor roles | `foldkit-cms`, `foldkit-cms-drizzle` | [cms.md](cms.md) |
| Pages an editor lays out from blocks | `foldkit-composition`, `foldkit-builder` | [composition.md](composition.md) |
| Long-form text, Markdown, code | `foldkit-richtext` and its family | [richtext.md](richtext.md) |
| Images, uploads, icons | `foldkit-media`, `foldkit-mixins-ui`'s `Image` | [media.md](media.md) |
| Components, themes, styling | `foldkit-mixins`, `foldkit-mixins-ui` | [mixins.md](mixins.md) |
| A feature's view of the Model and the Messages it may send | `foldkit-surface` | [surface.md](surface.md) |
| A reusable piece placed several times | `foldkit-bundle` | [bundle.md](bundle.md) |
| Server rendering, static pages | `foldkit-ssr` | [ssr.md](ssr.md) |
| An AI agent reading and acting | `foldkit-agent` and an adapter | [agent.md](agent.md) |
| Timers, media queries, sockets, clipboard, undo | `foldkit-primitives` | [primitives.md](primitives.md) |

In `mapping.md`, for each entity and interaction: the package, the API, where
its state lives (the Model, the server, a replica, the URL), and which guard
decides it. Write each invariant down with who enforces it: a Schema check (on
decode), `update` (on every Message), or the server (on every write). Keep one
owner per fact: if a datum appears in two rows of the mapping, one of them is
wrong. Name what is deliberately left out, and the adapters to install.

Then show the user `mapping.md`, ask what is wrong or missing, and revise it.
Repeat until they say it is right. A disagreement about the domain goes back to
`model.md` and `rounds.md` first.

## 5. Implement

Only after the user approves the mapping. Build in slices that each run:

1. The domain: Entities, their Schemas and invariants (`foldkit-entity`).
2. Who may do what: the guard set, implemented on the server.
3. The data path: Remote's server and client, or Sync, per the mapping; Auth.
4. The screens: routes (`foldkit-site`), views and forms, through Mixins.
5. What remains of the mapping: media, content, agents, server rendering.

For each slice: tests that can fail (an invariant broken, a guard refusing),
`typecheck` and `test` green, a commit, and `mapping.md` updated where the
build departed from it. When the mapping is wrong, stop and ask the user,
rather than quietly building something else.

See also: [Foldkit](https://foldkit.dev),
[the guides](https://foldkit-plus.pages.dev).
