# CMS design

Status: design, nothing built. Written 2026-09-19, after the Entity, Form, and
Crud work it stands on ([entity-DESIGN.md](./entity-DESIGN.md) §50 left this
open, and said not to start it until the rest existed; it now does). Code in
this document is a sketch against today's APIs and has not been compiled.

## 1. What a CMS adds

Most of what people call a CMS is already here and is not CMS-specific: a domain
declared once (`foldkit-entity`), forms from an operation's input
(`foldkit-form`), edit screens and lists (`foldkit-crud`), a cache and a server
(`foldkit-remote`), and SQL (`foldkit-remote-drizzle`). Building those again
under a CMS name would be the second way to do the same thing.

What is left is three things the stack does not have:

| | The question | Why it is not already answered |
| --- | --- | --- |
| **Audience** | Who may see this? | A visitor sees what is published; an author sees everything. It is a read boundary, and the one a mistake in leaks unfinished work. |
| **Time** | Which version, and when? | Content has a past (revisions), a future (scheduled), and unfinished work (drafts). An Entity is a row: it has only now. |
| **Address** | Where does it live? | A slug: readable, unique, and still working after it changes. An id is none of those to a visitor. |

Everything else on the usual list is an instance of these or is a schema plus a
control kind. Preview is an audience. A review workflow is a gate on a transition
in time. SEO fields are a nested input. Media is an Entity, an upload, and a
control kind. Rich text is a control kind and a renderer. The
[one-primitive controls](./entity-DX-PLAN.md) make the last three additive, so
none of them has to be in the first version.

## 2. The decision everything follows from: a draft is an unsent form

There are two ways to model unpublished work.

**A status on the row.** `posts.status = 'draft'`. It is the obvious design and
it has the wrong default: editing a published post changes the live site as the
author types, unless every read everywhere remembers to filter. The safe
behaviour depends on nobody forgetting.

**A draft is a saved form value, kept beside the row and never in it.** The
content row holds what is published. A draft is what an author has entered and
not sent: the input of the operation that would publish it. This document
chooses this, because of what falls out of it:

- **Publishing is the real mutation.** The draft's value is the mutation's input.
  There is no second write path, no second validation, no copy of the row's
  shape to keep in step with the row.
- **The audience boundary holds by construction.** A public read never touches
  the drafts table. There is no `where` to forget.
- **Revisions are the same thing, kept.** Each published value is appended to a
  log. Restoring one is filling the form from it.
- **Unfinished work can be saved.** A form's Model has a Schema codec, so a
  half-filled form that does not validate is storable and resumable. A row with
  a `not null` title cannot hold a post with no title yet.
- **It is made of parts that exist**: `Entity.input`, `form.fill`,
  `Entity.valuesFor`, a Remote mutation, `Entity.page` for the revision list.

It costs two things, both accepted:

- Something has to fire when a scheduled time arrives, because a draft is not a
  row a `where publish_at <= now()` can reveal. The package exposes what is due
  and the host calls it (§9). It does not own a scheduler.
- A saved draft can outlive the form that made it. §11 says what happens.

The rejected alternative is recorded in §15.

## 3. Ownership

| Fact | Owner |
| --- | --- |
| Published content | the application's tables, read through `foldkit-remote-drizzle` |
| What an author has entered and not published | `cms_drafts`, through `foldkit-cms-drizzle` |
| What was published, and when | `cms_revisions`, append-only |
| That a piece of content exists at all, before and after it has a row | `cms_entries` |
| The cached copy of any of these | `foldkit-remote`, in the application's Model |
| The draft being typed, its validity, its checks | `foldkit-form`, in the application's Model |
| Which state a piece of content is in | nobody stores it: `foldkit-cms` derives it (§5) |
| Who may make a transition | the application's `allow`, asked by the server |
| When a scheduled publish happens | the host, which calls `due(now)` |
| What a slug input or a status badge looks like | the application's renderers; `foldkit-cms` ships defaults |

The package owns no state machine of its own. Its client half is a Bundle over
Crud's editor, its server half is handlers and a policy, and its core is pure
functions and declarations.

## 4. Mental model

```text
                     authors                                  visitors
                        |                                         |
   Entry ── Draft ──────┤  save (any time, valid or not)          |
     |        |         |                                         |
     |        └─ publish ──> the app's own mutation ──> content row ──> read
     |                              |                       ^
     └── Revision  <── appended ────┘                       |
                                          audience policy ──┘
                                     (a visitor's principal reaches
                                      rows, never entries or drafts)
```

An **Entry** is a piece of content from its first keystroke to its archive: the
thing an author works on. It exists before the content row does (a new post that
was never published has an entry and a draft, and no row) and after the row is
hidden. A **Draft** is the entry's one working copy. A **Revision** is a
published value, kept. The **content row** is the application's own Entity, and
is the only thing a visitor's read can reach.

## 5. The lifecycle

State is derived from facts, by a pure function of the entry, its draft, its row,
and a clock. Nothing stores a `status`.

| State | Facts |
| --- | --- |
| `New` | an entry and a draft; no row |
| `Published` | a visible row; no draft |
| `Changed` | a visible row, and a draft newer than it |
| `Scheduled` | a draft with `scheduledFor` in the future (beside `New` or `Changed`) |
| `Unpublished` | a row hidden by its `published` role (§6); there may be a draft |
| `Archived` | the entry has `archivedAt` |

Transitions are operations (§8), each asked of `allow(principal, transition,
entry)` on the server before it runs: `save`, `discard`, `publish`, `schedule`,
`unschedule`, `unpublish`, `archive`, `restore`. A review workflow in the first
version is `allow` refusing `publish` to a principal that is not an editor. A
workflow with more states than these is §14.

Because state is derived, it cannot disagree with the facts, and a scheduled
publish that fails leaves the entry `Scheduled` and overdue, which is true, and
visible, instead of `Published` and wrong.

## 6. Declaring content

Two declarations, because there are two kinds of fact.

**Which members play a CMS role is a fact about the Entity**, so it is Entity
metadata, attached by a pipe step, as `Input.of` and `Display.of` are. The
interpreter owns its key (entity-DESIGN §5), the Entity's identity is unchanged
(§10), and the annotated Entity is the one to register and bind:

```ts
import { Cms } from 'foldkit-cms'

const Post = Blog.Post.pipe(
  Cms.roles({
    label: 'title', // what an entry is called in a list
    slug: 'slug', // its address: a string field, unique
    published: 'publishedAt', // nullable: present means visible
  }),
)

Cms.rolesOf(Post) // { label: Post.fields.title, slug: ..., published: ... }
```

- A role names a member, checked by type where it is written: `slug` on a field
  that is not text, or `published` on a field that does not admit `null`, is a
  type error and throws.
- Anything may read them with `Cms.rolesOf`: the server's audience policy, the
  `bySlug` query, and code this package knows nothing of, such as a sitemap or a
  feed. None of those needs the content declaration below.
- **A capability is declared, never implied**, as in Crud. No `slug` role, no
  slug handling. No `published` role, no unpublish, and every row is visible.

**How a type of content is authored is a fact about the application**: which form
edits it, which operations publish it, what it is called.

```ts
export const Posts = Cms.content('posts', {
  entity: Post,
  form: EditPostForm, // made with Form.make from Entity.input(Post, PostInput)
  publish: { create: CreatePostMutation, update: UpdatePostMutation },
  words: { one: 'Post', many: 'Posts' },
})
```

- `form` is an ordinary form. The one that would edit a post without a CMS is
  the one the CMS uses. `publish.update`'s input is `publish.create`'s plus the
  id; the form's value is `create`'s.
- `words` is text, like every other word in the stack
  ([DX plan §9](./entity-DX-PLAN.md)), and is all a content type says about how
  it is named. It is not a registry: §15.
- `Cms.content` adds no fields and generates nothing.

The package contributes three Entities of its own, registered with Remote like
any other: `Cms.Entry`, `Cms.Draft`, `Cms.Revision`. A draft's and a revision's
`values` are opaque JSON to them; the content type's form gives them meaning.

## 7. Authoring, on the client

`Cms.editor` is a Bundle around `Crud.editor`, as `Crud.editor` is a Bundle
around a form. It adds the entry, the draft, and the transitions.

```ts
const Editor = Cms.editor('PostEditor', { content: Posts })
const PostEditor = Editor.at({ data: Data, model: App.model.postEditor })

Placed.helpers.open(entryId) // resume the draft, else show the published values
Placed.helpers.create() // a new entry: a draft and no row
Editor.Message.Published() // the value goes through publish.create or publish.update
Editor.Message.Scheduled({ at })
Editor.Message.Discarded()
Editor.Message.Restored({ revision })

PostEditor.state(model) // New | Changed | Scheduled | ... (§5)
PostEditor.status(model) // Loading | Editing | Saving | Saved | Conflict | Publishing | Failed
```

- **Opening** loads the entry and its draft. With a draft, the form resumes it
  (§11). With none, it shows the row through `Entity.selectFor` and
  `Entity.valuesFor`, which is what `Crud.editor` does.
- **Saving is automatic and is not publishing.** Each edit schedules a
  `SaveDraft` after a rest (the form's `debounce` idea, one level up). It saves
  the form's Model, valid or not. The author never loses work to a validation
  error, and "Save" is not a button they need.
- **Publishing submits the form.** Checks run and the submit waits for them, as
  any submit does. An invalid form publishes nothing and shows why, in place.
- Lists are `Crud.list` over `Cms.Entry`: `Cms.entries(Posts)` is a query whose
  input is a state filter, a search, and a `Sort`. A revision list is
  `Crud.list` over `Cms.Revision`, paged with `Entity.page`.
- `Crud.actives` gathers the editor's and the lists' requirements as it does
  Crud's own.

### In-app preview

The author's own preview needs no server feature, and one small Remote one.
Remote lays a mutation's `optimistic` patches over the store while the mutation
is in flight, so every Selection and view draws the change before the server
answers. Preview is that overlay for a mutation that is never sent: the draft's
value, through the patches the application already wrote for publishing
optimistically, laid over the store while preview is on and lifted when it is
off. Remote has no overlay without a request today; adding one (an overlay by
id, applied and removed by Message) is part of the seventh PR, and is useful
beyond the CMS. A content type whose publish mutation declares no `optimistic`
patches has no in-app preview, which is a capability declared, not implied.

A shareable preview link for someone who is not the author is an audience, and
is §14.

## 8. The server

```ts
import { CmsServer } from 'foldkit-cms-drizzle'

const cms = CmsServer.make({
  tables: cmsTables, // entries, drafts, revisions; the package ships their Drizzle definitions
  content: [
    { type: Posts, binding: Db.Post, create: CreatePost, update: UpdatePost },
  ],
  isAuthor: principal => principal?.role === 'author' || principal?.role === 'editor',
  allow: (principal, transition) => transition !== 'publish' || principal?.role === 'editor',
})

RemoteServer.make({
  entities: [...cms.sources, source(Db.Author)],
  queries: [...cms.queries],
  mutations: [...cms.mutations],
})
```

- **`cms.sources` is how the audience boundary cannot be forgotten.** A content
  type's source is made by the CMS, wrapping `source(binding)` with the policy:
  a principal that is not an author reads only rows whose `published` role,
  read off the Entity with `Cms.rolesOf`, is set. `Cms.Entry`, `Cms.Draft` and `Cms.Revision` refuse a principal that is
  not an author outright. An application that registers `source(Db.Post)` itself
  has opted out, visibly, in one line. Relations are covered because the server
  already authorizes every level through the target's source.
- **`create` and `update` are the application's own mutation handlers.**
  `publish` runs the right one inside a transaction that also appends the
  revision and deletes the draft, so a publish either happened entirely or did
  not. What publishing a post *does* stays the application's code.
- **Slugs.** A content type with a `slug` role gets a `bySlug` query, and its
  form gets a check that the slug is free. The check is advice; the unique index
  is the rule, and a publish that loses the race fails with the slug named, in
  the form, as any mutation error arrives.
- **Conflicts.** `SaveDraft` carries the `updatedAt` it was based on; a newer one
  on the server is a `Conflict`, not an overwrite. `Publish` carries the revision
  it was based on, so publishing over someone else's publish is refused. Both
  arrive as mutation errors and the editor's status says `Conflict`; the author's
  text is still in the form.

### Tables

```text
cms_entries    id, type, target_id?, label, created_by, created_at, archived_at?
cms_drafts     entry_id (pk), values, model, form, updated_at, updated_by,
               base_revision?, scheduled_for?, schedule_error?
cms_revisions  entry_id, n, values, published_at, published_by
```

One working draft per entry. `values` is the decoded input where it decodes, and
`model` is the form's encoded Model; §11 says why both. `form` names the form and
a version the application bumps when it changes a form incompatibly.

## 9. Scheduled publishing

`Schedule` sets `scheduledFor` on the draft, after checking the form submits
now. Nothing else happens until the time comes.

```ts
// A Cloudflare cron trigger, a setInterval, a queue consumer: the host's choice.
export default {
  scheduled: (_event, env) => run(cms.due(new Date()), env),
}
```

`due(now)` publishes every draft whose time has come, each in its own
transaction, as the principal that scheduled it. A publish that fails (the slug
was taken since, a check now fails, the author lost the right) leaves the draft
scheduled, records `schedule_error`, and the entry reads `Scheduled` and overdue
with the reason. It is retried on the next call only if the draft changed; a
publish that failed for a reason the author must fix is not hammered.

The package does not own a timer. Hosts differ in how they keep time, and a
library that starts its own is a library that runs twice behind a load balancer.

## 10. New kinds, and one new Form capability

Controls and Displays are one primitive each, so these are entries in a
collection, made the way the shipped ones are:

| Kind | For |
| --- | --- |
| `Cms.Slug` (control) | text that follows another key until the author edits it; shown with the address it makes |
| `Cms.DateTime` (control) | a moment, for scheduling; its `parse` reads the input's text |
| `Cms.State` (display) | the lifecycle state, as a word; a renderer makes it a badge |
| `Cms.Moment` (display) | a time, relative or absolute |

`foldkit-cms` exports `renderers` for `foldkit-mixins-form` and
`foldkit-mixins-crud` to spread beside their own. There is no CMS view package.

**The slug needs something Form does not have: a draft that follows another
key.** Until the author types in the slug, it is the title, made URL-safe; after,
it is theirs. This belongs in `foldkit-form`, not here: "display name follows
first and last name" is the same thing. The shape is a control kind option,
`follows: { key, through }`, and a per-key `touched` fact in the form's Model:
an edit to the followed key rewrites the follower's draft while it is untouched.
It is the first PR (§13) because the slug control cannot be written without it.

## 11. Failure and recovery

| What goes wrong | What happens |
| --- | --- |
| A saved draft no longer fits the form (a key was renamed, a kind changed) | The Model is tried first, guarded by `form`'s version. Failing that, the form is filled from `values`, key by key, keeping what still decodes. Failing that, the form opens on the published values and says a draft could not be resumed. **A draft never fails to open**, and the stored JSON is kept until the author saves over it. |
| Autosave fails (offline, the server is down) | The form's Model is the source of truth and is untouched. Status reads `Saving` then `Failed`, the next edit tries again, and nothing is lost unless the tab closes. `foldkit-mirror` to local storage closes that gap for an application that wants it. |
| Two authors edit one entry | The second save is a `Conflict` (§8). The first version shows it and lets the author reload or overwrite. Merging is not attempted. |
| The slug was taken between the check and the publish | The unique index refuses, the mutation fails, the error names the slug and lands on its key. |
| A scheduled publish fails | §9: it stays scheduled, overdue, with the reason. |
| The content row was deleted while a draft exists | The entry has a draft and no row: it reads `New`. Publishing creates the row again. The revisions say what it was. |
| A revision is restored that no longer fits the form | It is a fill, so the first row of this table applies. |

## 12. Synergies

| Package | What the CMS uses it for |
| --- | --- |
| `foldkit-entity` | The content type is an Entity; roles name its members; `Entry`, `Draft` and `Revision` are Entities; revisions are read with `Entity.page`. |
| `foldkit-form` | The draft *is* the form's Model. Validation, checks, nested input, words, and pipe steps are the form's, unchanged. |
| `foldkit-crud` | `Cms.editor` wraps `Crud.editor`; entry and revision lists are `Crud.list`; `Sort` and `Display` kinds serve the worklist. |
| `foldkit-mixins-form`, `-crud` | Drawing. The CMS adds renderers, not views. |
| `foldkit-remote` | Every operation is a mutation with its status and errors in the Model; its optimistic overlay, held without a request, is the author's preview (a small addition, §7); a relation read whole and by the page serves "all comments" beside "latest revision". |
| `foldkit-remote-server`, `-drizzle` | The audience policy is a source policy; `bind` binds the three CMS tables like any others; `sortTerms` orders the worklist. |
| `foldkit-agent` | An agent can be exposed `SaveDraft` and refused `Publish`: it drafts, a person publishes. The boundary between the two is already the shape of the lifecycle. |
| `foldkit-mirror` | The open entry in the URL; an unsaved Model in local storage. |
| `foldkit-sync` | Not used. Two authors typing in one document at once is a different product (§14). |

## 13. Build order

Each is a PR that stands on its own and leaves `pnpm check` green.

1. **`foldkit-form`: a draft that follows another key.** *Built as
   `Input.following(key, through)`, with `form.isFollowing`.* `follows`, `touched`,
   and the rule that a fill or a reset clears `touched`. No CMS in it.
2. **`foldkit-cms`: declarations and the lifecycle.** *Built; `Cms.offers` was
   added beside `Cms.state`, since a view and a server both need to know what a
   state allows before asking who is asking.* `Cms.roles` as Entity
   metadata, checked by type and at runtime, with `Cms.rolesOf`; `Cms.content`; the three Entities; `Cms.state(facts, now)`
   as a pure function with a table test over every row of §5; the operation
   descriptors. Nothing runs yet.
3. **`foldkit-cms-drizzle`: drafts.** *Built. It needed two things of
   `foldkit-remote-drizzle` first: row visibility on a binding, because a source's
   `policies` only reached a relation's children and a by-id read returned any
   row to anyone; and a derived member the application supplies, for an entry's
   state. The guard is narrower than planned: it checks that a content type that
   can be unpublished has a `visible` rule, not that the rule is right, since
   only the application knows what a principal is.* The tables, `SaveDraft` and `Discard` with
   the conflict rule, the `entries` query, and the audience policy with its
   tests: a visitor's principal is refused entries, drafts, revisions, and any
   unpublished row, at every depth of a nested read.
4. **Publish.** *Built. A mutation's error is a message and no more, so a taken
   slug names its key in a prefix, `CmsSlugTaken: <key>:`, as a conflict does;
   the form's own is-it-free check belongs to the editor, next. The transaction is the application's to
   name (`Transaction.statements` for one connection, `Transaction.drizzle` for an
   asynchronous driver), because Drizzle's differ by driver and a wrong guess
   either throws or silently does not roll back. Publishing also sets the
   `published` role's column when it is empty, so an unpublished row is shown
   again and a shown one keeps its first date.* The transaction: the application's handler, the revision, the
   draft's deletion; `Unpublish`; the base-revision conflict; the slug check and
   the unique-index failure arriving on the slug's key.
5. **`Cms.editor`.** *Built, as state: the kinds and renderers of §10 are not.
   It is a Bundle around the form and not around `Crud.editor`, whose one
   mutation and one loaded value are the wrong shape for an entry, a draft and a
   row. Two things it needed changed what was built before it: a mutation's
   status carries no output, so the client names a new entry's id and the entry
   row holds its latest `revision`; and refreshing an entity Remote believed
   absent did nothing, which a reload after a conflict depends on.* Open, resume (§11's ladder, each rung tested), autosave,
   publish, status. The kinds of §10 and their renderers.
6. **Scheduling.** `Schedule`, `Unschedule`, `due(now)` with a clock passed in,
   the failure path, and a Cloudflare cron example.
7. **History and preview.** The revision list and `Restore`; in `foldkit-remote`,
   an optimistic overlay that is held without a request, and the in-app preview
   over it.
8. **`examples/cms`.** A small site and its authoring app over SQLite: a visitor's
   read and an author's, one domain, in a printed trace and in a browser. Then
   the READMEs, the docs map, the release matrix, and the skill.

## 14. Later, and how each would attach

- **Media.** `foldkit-cms-media`: an `Asset` Entity, an upload Command, a storage
  adapter (R2, S3, disk), and an `Asset` control kind that is a relation picker
  with an upload. It needs nothing from this design but the control primitive.
- **Rich text and blocks.** A `Blocks` control kind whose draft is a list and
  whose value is a block tree, with a schema per block type. The editor is a
  renderer an application brings; the package would ship the schema, the
  validation, and a plain renderer.
- **Shareable preview.** A principal holding a signed token for one entry. The
  server applies the draft's value to the row in a transaction it rolls back, so
  the preview is exactly what publishing would produce. It is an audience, so it
  is a policy, not a second read path.
- **Slug history.** Old slugs kept, and `bySlug` answering with a redirect.
- **Localization.** A locale as part of an entry's identity: one entry, a draft
  and a revision log per locale.
- **Workflows with more states.** `allow` covers "only an editor publishes". A
  review state that content sits in is a fact that would need storing (who asked
  for review, when), and should be designed from a real case.
- **Simultaneous editing.** `foldkit-sync`'s territory, over the form's Model. A
  different product from a CMS with conflicts, and not a small step from it.

## 15. Rejected

- **A status column as the draft.** §2. Its safe behaviour depends on every read
  remembering a filter, and it cannot hold unfinished work.
- **A generated admin.** Already rejected in entity-DESIGN §66, and nothing here
  changes it: `Cms.editor` and `Crud.list` are headless, and a CMS's screens are
  its most application-specific part.
- **A `collections` registry** that a whole admin is drawn from: every content
  type in one value, with its screens, from which navigation and routes are
  derived. It is the universal `Resource` of entity-DESIGN §69 under another
  name, and an application's navigation is a list it writes. What is *not*
  rejected is a content type having a name (§6's `words`); entity-DESIGN §50
  lists "content collections" as CMS semantics, and that much of it is.
- **Owning a scheduler.** §9.
- **Revisions in `foldkit-durable`.** It is an ordered operation log, which is
  what revisions are, and it was considered. It is keyed for replay, not for
  "the revisions of this entry, newest first, paged", and it would make the CMS's
  storage a second database beside the application's. Three SQL tables that
  `bind` already understands are the smaller thing.
- **Storing rendered HTML.** A value is stored; a view draws it. Content that is
  HTML in the database cannot be re-drawn.

## 16. How this relates to entity-DESIGN

entity-DESIGN has no CMS design. It has guardrails for one, a list of nine
candidate features (§50), and examples written before the packages existed.

**Guardrails kept.** §27, do not make Entity imply CRUD: every capability here is
declared. §21, the CMS renderer is not a second component framework: there is no
CMS view package, only renderers. §44, do not name generic functionality `cms`:
the two generic needs found here went to `foldkit-form` (a draft that follows
another key) and `foldkit-remote` (an overlay held without a request). §51, do
not build it yet: it waited. §5 and §10, an interpreter's facts are metadata
under its own key on an Entity whose identity does not change: §6's roles.

**Where this departs from it, deliberately.**

- **Its examples model a draft as a field on the row.** §46 and the end-to-end
  example give `Post` a `published` boolean, edited with `Input.toggle()` and
  shown as a `Published` / `Draft` badge. That is the design §2 argues against.
  The two are closer than they look: this design keeps a `published` role on
  the row, but it means *visible*, not *unfinished*, and unfinished work is
  never on the row at all.
- **Its list has no audience.** §50's nine features are all about time and
  address. None is the read boundary between a visitor and an author, which this
  design treats as the first thing a CMS must get right and the one a status
  column gets wrong by default.
- **"Content collections"** is on §50's list and a registry of them is rejected
  in §15 here. The line between the two is drawn there.

**Where its prediction holds, and where it does not.** §50 says the package
should be "surprisingly small", and the success criteria that "CMS becomes mostly
derivation". That is true of the screens: the editor wraps Crud's, the lists are
`Crud.list`, the form is the application's. It is not true of the server half,
which is three tables, a transactional publish, a policy, and scheduling. The
prediction counted the editing and not the audience.

**§50's nine, and where each is here.** Draft/published lifecycle, slug
handling, revision history, scheduled publishing: the first version (§5–§9).
Content preview: in-app in the first version (§7), shareable later (§14). Media
fields, SEO metadata: later, and additive (§14, §1). Authoring workflows: `allow`
now, more states later (§5, §14). Content collections: a name, not a registry
(§6, §15).

## 17. Open questions

1. **Does the entry own the slug, or the row?** The design above says the row
   (a `slug` role on the Entity), so a visitor's read needs no CMS table. Slug
   history (§14) wants it on the entry. The likely answer is both: the row for
   reading, `cms_slugs` for history.
2. **One working draft per entry, or one per author?** One per entry is simpler
   and makes conflicts visible. One per author avoids them and needs a merge at
   publish. The first version is one per entry.
3. **Who is the scheduled publish's principal** when the author who scheduled it
   has since lost the right to publish? The design says: it fails, and says so.
4. **Should `Cms.content` make the form** when it is given only an input? Crud
   does not, and it would be the first place a package makes another's form.
   Probably not.
5. **How much of `Cms.editor` is Crud's editor with options**, and how much is
   new? If most of it is options, those options belong on `Crud.editor`, and the
   CMS editor is thinner than §7 suggests. The fifth PR will show which.
