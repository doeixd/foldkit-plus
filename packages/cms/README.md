# foldkit-cms

What a CMS adds to a domain that is already declared. The domain is a
[`foldkit-entity`](../entity/README.md) Entity, editing it is a
[`foldkit-form`](../form/README.md) form, and the screens are
[`foldkit-crud`](../crud/README.md)'s. None of that is CMS-specific. Three things
are: **audience** (a visitor sees what is published, an author sees everything),
**time** (drafts, revisions, a schedule), and **address** (a slug).

> **Status: declarations and rules only.** This package is the pure core: roles,
> content types, the three Entities, the operations as descriptors, and the
> lifecycle. Its server is [`foldkit-cms-drizzle`](../cms-drizzle/README.md),
> which saves, discards, publishes and unpublishes, and enforces the audience
> boundary; the authoring editor and scheduling are next in
> [the design](../../docs/design/cms-DESIGN.md#13-build-order). Neither package
> is on npm.

## What it owns

| Fact | Owner |
| --- | --- |
| Published content | your tables, read as any Entity is |
| What an author has entered and not published | a draft, kept **beside** the row, never in it |
| Which state a piece of content is in | nobody stores it: `Cms.state` derives it |
| Which transitions that state offers | `Cms.offers`, before anyone asks who is asking |
| Who may make a transition | your `allow`, asked by the server |
| The draft being typed | `foldkit-form`, in your Model |

It owns no state and reads no database.

## Mental model

**A draft is an unsent form.** The content row holds what is published. A draft
is what an author has entered and not sent: the input of the operation that
would publish it, saved. So publishing is your own mutation, run with the
draft's value; a visitor's read cannot reach unfinished work, because it never
touches drafts; a revision is the same value, kept; and a half-filled form that
does not validate can be saved, which a row with a `not null` title cannot hold.

```text
   Entry ── Draft ── publish ──> your own mutation ──> content row ──> a visitor's read
     └── Revision  <── appended ──┘
```

An **Entry** is a piece of content from its first keystroke to its archive. It
exists before the row does, and after the row is hidden.

## Install

```sh
pnpm add effect foldkit foldkit-entity foldkit-form foldkit-remote foldkit-cms
```

## Example

```ts
import { Cms } from 'foldkit-cms'

// Which members play a CMS part is a fact about the Entity: metadata, by a pipe step.
const Post = Blog.Post.pipe(
  Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }),
)

// How a type of content is authored is a fact about the application.
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm, // an ordinary form: Form.make('PostForm', Entity.input(Post, PostInput))
  publish: { create: CreatePostMutation, update: UpdatePostMutation },
  words: { one: 'Post', many: 'Posts' },
})
```

- `Post` is the same Entity as `Blog.Post`; only its metadata changed. Register
  and bind the annotated one.
- A role names a member that can play it. `slug` on a number, or `published` on a
  field that admits no `null`, is a type error and throws.
- `publish.create`'s input is the form's value and its output names the row;
  `publish.update`'s input is that value and the row's id. A mutation of another
  shape is a type error. They are your own mutations: what publishing a post
  *does* stays your code.
- **A capability is declared, never implied.** No `slug` role, no slug handling.
  No `published` role, no unpublish, and every row is visible.

`Cms.rolesOf(Post)` reads the roles back as Fields. Anything may: the server's
audience policy, a `bySlug` query, a sitemap this package knows nothing of.

## The lifecycle

State is derived from facts and a clock. Nothing stores a status, so it cannot
disagree with what is true.

```ts
Cms.state({ archivedAt: null, row: 'visible', draft: { scheduledFor, scheduleError: null } }, now)
// { _tag: 'Changed', schedule: { at, overdue: false, error: null } }
```

| State | Facts |
| --- | --- |
| `New` | no row yet |
| `Published` | a row a visitor sees, and no draft |
| `Changed` | a row a visitor sees, and unpublished work beside it |
| `Unpublished` | a row hidden by its `published` role |
| `Archived` | the entry was archived; nothing else applies until it is restored |

A `schedule` rides beside a state that has a draft. **A scheduled publish that
did not happen reads `overdue`, with the reason**, because that is true; it does
not read `Published`.

`Cms.offers(facts, now, content)` is the transitions an entry offers now:
`save`, `discard`, `publish`, `schedule`, `unschedule`, `unpublish`, `archive`,
`unarchive`, `restore`. It is what a view enables and what a server checks
before it asks who is asking. `unpublish` is offered only to a content type with
a `published` role.

## Entities and operations

`Cms.Entities` is `Entry`, `Draft` and `Revision`, related: an entry has one
optional draft and many revisions. They are ordinary Entities. Register them
with Remote beside your own, and list them with `Crud.list`; an entry's
`state` is a derived member the server supplies with its clock.

`Cms.Operations` is what an author may ask, as Remote mutations: `SaveDraft`,
`DiscardDraft`, `Publish`, `Unpublish`, `Schedule`, `Unschedule`, `Archive`,
`Unarchive`, `Restore`. They are the same for every content type. `SaveDraft`
and `Publish` each carry what they were based on, so a second author's save or
publish is a conflict and not an overwrite. `Cms.operations` is the list, for
`Remote.make({ mutations })`.

An entry's id is `EntryId`, branded, so an entry is not opened with a post's id.

## API

| Call | Meaning |
| --- | --- |
| `Cms.roles({ label?, slug?, published? })` | Pipe step: the members of an Entity that play a CMS part. |
| `Cms.rolesOf(entity)` | Those roles, as Fields; `undefined` for a part nobody named. |
| `Cms.content(name, { entity, form, publish, words })` | A type of content: its Entity, form, publish operations, and name. |
| `Cms.state(facts, now)` | The state of an entry, with its schedule. |
| `Cms.offers(facts, now, content)` | The transitions it offers now. |
| `Cms.Entities`, `Cms.Operations`, `Cms.operations` | The CMS's own Entities and mutations. |
| `Cms.Entries` | The worklist query: one content type's entries, by label, archived or not. |

## Limits

- No editor and no scheduling yet: see the status above.
- One working draft per entry, not one per author.
- Media, rich text, localization, and review states beyond "who may publish" are
  [later](../../docs/design/cms-DESIGN.md#14-later-and-how-each-would-attach).
