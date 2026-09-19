# Foldkit Plus Entity / Form / Admin Architecture

**Status:** Proposed implementation direction
**Target:** `doeixd/foldkit-plus`
**Primary inspirations:** current `foldkit-plus`, `doeixd/gen`, `doeixd/gen2`, `doeixd/effect-atom-jsx`
**Goal:** Introduce a small semantic domain substrate that lets Remote, Drizzle, forms, admin interfaces, and eventually CMS functionality reuse the same entity/schema/relation declarations without creating a second application architecture.

---

# 1. Executive decision

The recommended architecture is:

```text
Effect Schema
     │
     ▼
foldkit-entity
 Entity
 Field
 Relation
 Derived
 Selection
 Metadata
     │
     ├────────────────┬─────────────────┐
     ▼                ▼                 ▼
foldkit-remote    foldkit-form     future interpreters
     │                │
     ▼                ▼
remote-drizzle    foldkit-admin
                      │
                      ▼
                  foldkit-cms?
```

The fundamental rule is:

> **Entity describes domain structure. Other packages attach or interpret capabilities.**

An Entity should know:

* its name and stable identity;
* its intrinsic fields and their Effect Schemas;
* its logical relationships to other entities;
* optionally, explicitly declared derived/read-only members;
* typed metadata attached by independent packages.

An Entity should **not** know:

* which SQL table stores it;
* which foreign-key layout implements a relation;
* which React/Foldkit component edits a field;
* which routes expose it;
* whether CRUD endpoints exist;
* whether a user is authorized to update it;
* which admin page layout should be used;
* whether it is even editable.

Those belong to interpreters or higher-level descriptors.

This gives Foldkit Plus the useful part of Gen/Gen2 — a reusable semantic graph — without recreating Gen's monolithic application object.

---

# 2. The central architectural insight

There are several different facts currently being conflated.

They should become distinct:

```text
Schema
    "What values are valid?"

Entity
    "What kind of domain object is this?"

Field
    "What intrinsic fact belongs to this entity?"

Relation
    "What other entity can be navigated from this entity?"

Derived member
    "What readable fact exists but is not intrinsic stored value?"

Selection
    "Which readable part of this entity graph does a consumer want?"

Presentation metadata
    "How should a human-facing tool describe this?"

Input
    "How may this value be edited?"

Form
    "What draft values are being edited and validated?"

Resource/Admin descriptor
    "Which operations does this management interface expose?"

Drizzle binding
    "How are fields and relationships implemented in this database?"

Remote
    "How are selected facts fetched, normalized, cached and mutated?"

Surface
    "Which facts/messages does this particular feature observe/cause?"

Submodel
    "Who owns this state machine?"

Mixins
    "Where may this rendered interface be styled or decorated?"
```

The key is that these compose **in one direction** rather than all being properties of one huge `Entity` configuration object.

---

# 3. What to take from each existing project

## From current Foldkit Plus

Keep its architectural discipline.

Surface already establishes the right pattern:

> a declaration can describe an architectural boundary without owning another state system.

Its `ModelRef`, `FieldRef`, `Projection`, and typed metadata keys are particularly relevant.

Mixins establishes another useful pattern:

> a component publishes capabilities/slots and independent packages attach interpretations later.

Remote establishes:

> data requirements are declarations; I/O and state ownership remain explicit.

These principles should govern the new Entity work.

---

## From `gen`

Take the **capability inventory**, not the object model.

Gen demonstrates that entity metadata can eventually drive:

* validation;
* inputs;
* displays;
* relations;
* filtering;
* sorting;
* search;
* forms;
* detail pages;
* admin lists;
* mutations;
* permissions;
* routes;
* extension metadata.

But putting all of these into one object causes the Entity to become the application.

Do **not** reproduce:

```ts
entity = {
  db: ...,
  fields: {
    title: {
      schema: ...,
      inputComponent: ...,
      displayComponent: ...,
      searchable: true,
      ...
    }
  },
  relationships: ...,
  permissions: ...,
  routes: ...,
  mutations: ...,
}
```

Foldkit already has better owners for many of those concerns.

---

## From `gen2`

Take the idea of a **typed inspectable semantic graph** and the distinction between semantic declaration and target interpreter.

Particularly valuable ideas are:

* first-class Entity/Field/Relation references;
* static typed IR;
* forms derived from existing domain/operation contracts;
* target-specific interpreters;
* UI controls selected from semantic information rather than embedded concrete components.

Do **not**, however, copy Gen2's parallel `SemanticType` hierarchy into Foldkit Plus.

Effect Schema is already here and should remain the validation/type source of truth.

---

## From `effect-atom-jsx`

Take the **capability-matching idea**.

A control should not say:

```ts
inputComponent: ReactMarkdownEditor
```

at the domain layer.

It should say something closer to:

```ts
Input.markdown()
```

or simply carry enough semantic information for a resolver to choose a control.

The renderer can then supply an implementation satisfying the required UI capability.

This mirrors Mixins nicely.

---

# 4. New foundation: `foldkit-entity`

Create a new foundational package.

```text
packages/entity
```

Suggested public exports:

```ts
Entity
Field
Relation
Derived
Selection
EntityRef
EntityMember
```

Potential package name:

```text
foldkit-entity
```

This package depends on:

```text
effect
foldkit-metadata
```

It must **not** depend on:

```text
foldkit-remote
foldkit-remote-drizzle
foldkit-form
foldkit-admin
foldkit-mixins
```

---

# 5. Extract generic metadata first

Surface already contains a very useful generic facility:

```ts
Metadata.key<A>(name, {
  merge,
  summarize,
})
```

That mechanism should be extracted into a tiny foundational package:

```text
foldkit-metadata
```

Surface should then re-export it for compatibility.

Conceptually:

```ts
interface MetadataKey<A> {
  readonly name: string

  readonly of: (value: A) => MetadataEntry<A>

  readonly merge: (
    left: A,
    right: A,
  ) => A

  readonly summarize: (value: A) => unknown
}
```

Metadata itself should remain opaque.

Something like:

```ts
interface Metadata {
  readonly [MetadataTypeId]: typeof MetadataTypeId
}
```

with:

```ts
Metadata.empty()
Metadata.add(metadata, entry)
Metadata.merge(left, right)
Metadata.get(metadata, key)
Metadata.inspect(metadata)
```

Important properties:

* key identity, not magic string lookup;
* each interpreter owns its own metadata type;
* key owns merge semantics;
* metadata can be inspected through deterministic summaries;
* attaching metadata does not require Entity core to understand it.

Then the same substrate is reusable for:

```text
Surface Projection metadata
Entity metadata
Field metadata
Relation metadata
possibly operation metadata later
```

This is the extension mechanism that prevents Entity from becoming Gen v1.

---

# 6. Entity should distinguish Fields, Relations, and Derived members

This is one of the strongest design decisions.

Do **not** represent everything as fields in one Effect `Schema.Struct`.

Instead:

```text
Entity
 ├── fields
 ├── relations
 └── derived
```

with a convenience union:

```text
Entity.members
```

---

## Fields

A Field is an intrinsic value of the Entity.

Example:

```ts
const Post = Entity.define(
  "Post",
  Schema.Struct({
    id: PostId,
    title: Schema.String.pipe(
      Schema.minLength(1),
      Schema.maxLength(200),
    ),
    body: Schema.String,
    published: Schema.Boolean,
  }),
)
```

`Post.schema` remains exactly the canonical intrinsic-value schema.

But `Post.fields` should no longer just expose raw Schema values.

Generate typed refs:

```ts
Post.fields.id
Post.fields.title
Post.fields.body
Post.fields.published
```

Conceptually:

```ts
interface EntityField<
  Name extends string,
  Key extends string,
  S extends Schema.Top,
> {
  readonly _tag: "Field"

  readonly owner: EntityIdentity<Name>

  readonly key: Key

  readonly schema: S

  readonly metadata: Metadata
}
```

Therefore:

```ts
Post.fields.title.schema
Post.fields.title.key
Post.fields.title.owner
Post.fields.title.metadata
```

This mirrors Surface's generated `FieldRef` pattern.

The original Struct fields can remain available internally as:

```ts
Post.shape
```

if useful.

---

# 7. Relations should be separate from `Entity.schema`

This is the biggest departure from current Remote.

Current Remote effectively models:

```ts
Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  owner: Entity.ref(User),
})
```

That works for normalization, but it makes a navigation relationship appear to be an intrinsic row/value field.

It also forces Remote to discover relation semantics from Schema annotations.

Instead:

```ts
const Post = Entity.define(
  "Post",
  Schema.Struct({
    id: PostId,
    title: Schema.String,
    body: Schema.String,
    published: Schema.Boolean,
  }),
).pipe(
  Entity.relations({
    author: Relation.one(() => Author),
    comments: Relation.many(() => Comment),
    tags: Relation.many(() => Tag),
  }),
)
```

Now:

```ts
Post.schema
```

means only:

> this is the intrinsic Post value.

And:

```ts
Post.relations.author
```

means:

> from a Post, there is a semantic navigation edge to one Author.

This distinction fixes several problems at once.

---

# 8. Relation cardinality should be owner-local

Do not put relational database vocabulary into the core model.

Avoid requiring:

```text
one_to_one
one_to_many
many_to_one
many_to_many
```

at the individual relation declaration.

Instead:

```ts
Relation.one(() => Author)
Relation.many(() => Comment)
```

means only what the owner sees.

For example:

```text
Post.author
    one Author

Author.posts
    many Posts
```

Together, those imply the familiar many-to-one / one-to-many relationship.

Likewise:

```text
Post.tags
    many Tags

Tag.posts
    many Posts
```

may be implemented as a many-to-many join table.

But the domain relation itself does not need to care.

This gives us:

```ts
interface RelationDescriptor<
  Owner,
  Key extends string,
  Target,
  Cardinality extends "one" | "many",
> {
  readonly _tag: "Relation"
  readonly owner: Owner
  readonly key: Key
  readonly target: () => Target
  readonly cardinality: Cardinality
  readonly optional: boolean
  readonly metadata: Metadata
}
```

For singular relationships:

```ts
Relation.one(() => Author)

Relation.one(() => Author, {
  optional: true,
})
```

For collections:

```ts
Relation.many(() => Comment)
```

---

# 9. Use lazy relation targets

Targets should be thunks:

```ts
Relation.one(() => Author)
```

rather than:

```ts
Relation.one(Author)
```

This helps with:

* recursive entities;
* module cycles;
* forward declarations;
* mutually related models.

The thunk should be evaluated only when the target is actually inspected or interpreted.

---

# 10. Stable Entity identity is required

Pipeable decorators will often return a new immutable descriptor:

```ts
const CmsPost = Post.pipe(
  EntityUI.describe(...),
)
```

But `CmsPost` and `Post` still represent the same semantic entity.

Do not use JavaScript object identity as Entity identity.

Create an identity token once:

```ts
interface EntityIdentity<Name extends string> {
  readonly name: Name
  readonly token: symbol
}
```

Every pipe-produced version preserves:

```ts
entity.identity
```

Relations point to the semantic entity identity, not to a particular decorated object version.

This matters for:

* lazy cycles;
* relation target validation;
* registries;
* Remote;
* Drizzle bindings;
* metadata-decorated variants;
* eventual devtools manifests.

---

# 11. Add explicit Derived/read-only members

Current `remote-drizzle` can synthesize computed fields.

That concept should no longer need to pretend to be an intrinsic field.

Support:

```ts
Post.pipe(
  Entity.derived({
    commentCount: Derived.make(Schema.Number),
  }),
)
```

A Derived member says:

> consumers may read a value with this schema, but it is not part of the canonical Entity value.

It does **not** specify how the value is calculated.

That is interpreter-specific.

For example:

```ts
Drizzle.bind(Post, posts, {
  derived: {
    commentCount: Drizzle.count(Post.relations.comments),
  },
})
```

A non-Drizzle interpreter could satisfy it differently.

This gives:

```text
Field
    intrinsic value

Relation
    navigation edge

Derived
    externally supplied/read-only value
```

All three are readable Entity members.

---

# 12. `Entity.members` should be the unified readable namespace

Expose:

```ts
Post.members
```

as the union of:

```text
Post.fields
Post.relations
Post.derived
```

Collisions are definition-time errors.

For example:

```text
field "author"
+
relation "author"
```

must fail immediately.

Remote and generic admin tooling can operate on `members` while form generation can distinguish writable Fields from Relations and Derived values.

---

# 13. Entity selection should probably become storage-neutral

The more this design is pushed, the more `Selection` looks like a generally useful Entity operation rather than a Remote-specific primitive.

Recommended eventual API:

```ts
const AuthorSummary = Author.select({
  id: true,
  name: true,
})

const PostCard = Post.select({
  id: true,
  title: true,
  author: AuthorSummary,
  commentCount: true,
})
```

This is semantic:

> assemble this view of the entity graph.

It does not inherently mean:

> make an HTTP request.

Therefore the plain selection model should eventually live in `foldkit-entity`.

A Selection can contain:

```text
Field
    true

Derived
    true

Relation
    true
    or nested target Selection
```

`true` on a Relation may mean “return its `EntityRef` value.”

Nested Selection means “assemble the selected target value.”

For a `many` relation:

```ts
comments: CommentSummary
```

produces:

```ts
ReadonlyArray<CommentSummary>
```

For an optional `one` relation:

```ts
author: AuthorSummary
```

produces:

```ts
AuthorSummary | null
```

---

# 14. Pagination remains an interpreter extension

> **Status: revised.** The *shape* of a page moved into `foldkit-entity` as
> `Entity.page(selection, window)`; what stays with the interpreter is what this
> section was protecting: cursors, ordering, and fetching. A Selection that
> could not say "the first ten" forced every paged view down to Remote's
> descriptor layer, which made the documented path the incomplete one. Remote
> compiles a page to its existing `Selection.connection`, and `remote-drizzle`
> windows it in SQL with no change.

Do not force pagination into `foldkit-entity`.

Pagination is a data-access concern.

Core Entity:

```ts
Post.select({
  comments: CommentSummary,
})
```

means:

> a collection of Comments.

Remote may extend this with:

```ts
Remote.connection(
  Post.relations.comments,
  window,
  CommentSummary,
)
```

or preserve an equivalent `Selection.connection(...)` API.

This keeps:

```text
Entity Selection
    semantic shape

Remote Connection
    transport/query policy
```

separate.

---

# 15. Move `EntityRef` concept toward the Entity layer

A relation needs a semantic reference independent of Drizzle.

A core value can look like:

```ts
interface EntityRef<Name extends string = string> {
  readonly entity: Name
  readonly id: string
}
```

Longer term, the ID type can become generic.

Do not make the core API dependent on Remote's wire encoding:

```text
"User:u1"
```

Remote can continue encoding refs however its protocol requires.

The application-facing value remains:

```ts
{
  entity: "User",
  id: "u1",
}
```

---

# 16. Effect Schema remains the validation truth

Do not create another validation system.

Do not copy Gen2's `SemanticType` as a parallel type hierarchy.

Each intrinsic Field has:

```ts
field.schema
```

and that schema determines whether a final domain value is valid.

Examples:

```ts
Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(200),
)

Schema.Boolean

Schema.Literal("draft", "published")

Schema.Struct(...)
```

Form submission ultimately decodes through Effect Schema.

Server mutation input ultimately decodes through Effect Schema.

Remote values ultimately decode through Effect Schema.

There should be one validation truth.

---

# 17. Semantic hints are metadata, not validation

Some UI meaning cannot be inferred merely from:

```ts
Schema.String
```

because a string could be:

```text
plain text
markdown
slug
email
URL
code
color
phone number
media ID
```

Do not solve this by inventing a second type system.

Use typed field metadata.

For example, an eventual semantic key could describe:

```ts
Semantic.Markdown
Semantic.Slug
Semantic.Email
Semantic.Url
Semantic.Code
Semantic.Color
```

But this metadata means:

> this valid value has this semantic role.

It does **not** replace its Schema.

A good rule is:

```text
Schema
    validity

Semantic metadata
    meaning

Input metadata
    editing preference
```

Keep those distinct.

---

# 18. UI/input metadata must be renderer-neutral

Never put this into core Entity metadata:

```ts
inputComponent: ReactMarkdownEditor
```

Instead define semantic Input IR.

Possible API:

```ts
Input.text()
Input.textarea()
Input.markdown()
Input.number()
Input.toggle()
Input.select(...)
Input.date()
Input.datetime()
Input.relationOne()
Input.relationMany()
Input.custom(...)
```

These values are descriptions, not rendered components.

Example:

```ts
const Post = PostDomain.pipe(
  EntityUI.configure({
    fields: {
      title: {
        label: "Title",
        input: Input.text({
          placeholder: "Post title",
        }),
      },

      body: {
        label: "Body",
        input: Input.markdown(),
      },

      published: {
        label: "Published",
        input: Input.toggle(),
      },
    },

    relations: {
      author: {
        label: "Author",
        input: Input.relationOne(),
      },

      tags: {
        label: "Tags",
        input: Input.relationMany(),
      },
    },
  }),
)
```

All keys are statically constrained by the Entity.

A typo like:

```ts
titel: ...
```

should be a type error.

---

# 19. UI metadata must remain optional

This should work:

```ts
const Project = Entity.define(
  "Project",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)
```

without importing any UI package.

The system should still be able to derive a boring default form.

Explicit presentation metadata merely improves it.

This keeps Entity useful to:

```text
Remote
Drizzle
agents
CLI tooling
serialization
tests
docs
non-UI applications
```

---

# 20. Input inference should use a resolver

Do not require every Field to specify an Input manually.

Create a central resolver.

Conceptually:

```ts
Input.resolve(member, context, registry)
```

Resolution order:

```text
1. explicit Input override
2. explicit semantic metadata
3. relation cardinality
4. obvious Effect Schema shape
5. registered application-specific strategy
6. fallback / diagnostic
```

Built-in examples:

```text
Schema.Boolean
    -> toggle

Schema.Number
    -> number

string
    -> text

literal union
    -> select

Relation.one
    -> relation-one picker

Relation.many
    -> relation-many picker
```

Explicit metadata can override:

```text
Schema.String + Semantic.Markdown
    -> markdown

Schema.String + Semantic.Code
    -> code editor
```

Unknown complicated structures should not silently guess too much.

They may resolve to:

```text
custom required
```

or a deliberately boring JSON editor in generic admin tooling.

---

# 21. Reuse Mixins capabilities for renderer compatibility

Input IR should eventually describe the capability required from a rendered control.

For example:

```text
Input.text
    requires TextInput

Input.toggle
    requires Interactive

Input.relationMany
    requires Collection + Interactive
```

These should reuse or align with `foldkit-mixins` capabilities rather than inventing an unrelated UI capability graph.

Then:

```text
semantic Input IR
        │
        ▼
Foldkit Input Registry
        │
        ▼
normal Foldkit component / SlotView
        │
        ▼
Mixins Style + Behavior
```

This means generated admin/CMS controls are automatically:

* styleable;
* behavior-extensible;
* accessible through slot contracts;
* compatible with an application's existing design system.

The CMS renderer should not become a second component framework.

---

# 22. Separate Input from Display

Editing and presentation are different.

A field may use:

```ts
input: Input.toggle()
```

while displaying as:

```ts
display: Display.badge({
  true: "Published",
  false: "Draft",
})
```

Possible display IR:

```ts
Display.text()
Display.date()
Display.number()
Display.badge(...)
Display.markdown()
Display.link()
Display.relation()
Display.collection()
Display.custom(...)
```

These can use the same registry/interpreter concept as Input.

---

# 23. Form generation needs its own layer

Create:

```text
foldkit-form
```

The Form layer should not own server data.

It owns:

```text
draft values
touched/dirty state
validation state
submission status if needed
field descriptions
input resolution
```

All actual application state remains a Foldkit Model/Submodel.

Do not import the atom model from `effect-atom-jsx`.

The useful idea from that project is schema/capability derivation, not hidden reactive state.

---

# 24. Do not conflate raw draft values with valid domain values

This is subtle and important.

While editing a number, a user may temporarily type:

```text
"-"
```

That is not a valid `number`.

Likewise a partially typed date or JSON value may be temporarily invalid.

Therefore Form state cannot simply claim:

```ts
values: Post
```

throughout editing.

A control should conceptually have:

```ts
InputSpec<Value, Draft>
```

where:

```text
Value
    validated domain value

Draft
    representation the editor manipulates
```

For example:

```text
number
    Value = number
    Draft = string

date
    Value = Date
    Draft = string
```

The Input adapter knows how to:

```text
Value -> Draft
Draft -> Value
```

and the Entity Field Schema still validates the resulting `Value`.

This avoids polluting the canonical Entity with UI-specific encoded forms.

---

# 25. Form validation pipeline

Recommended validation flow:

```text
user edits Draft
       │
       ▼
Input adapter parses Draft
       │
       ├── parse failure -> field error
       │
       ▼
candidate Value
       │
       ▼
Field / operation Effect Schema decode
       │
       ├── validation failure -> field/form error
       │
       ▼
valid operation input
```

On submission, always run the authoritative whole-input Effect Schema.

Incremental per-field validation is UX assistance, not an alternative validator.

---

# 26. Forms should ultimately derive from operation input, not Entity alone

This is another important architectural decision.

An Entity describes valid stored/domain data.

That does **not** mean every field is:

* creatable;
* updateable;
* writable by this caller;
* writable by this operation.

For example:

```text
id
createdAt
updatedAt
commentCount
ownerId
audit fields
server-calculated values
```

may all exist while not being editable.

Therefore:

> **Entity metadata may suggest controls, but an operation contract determines what a form may actually submit.**

This matches existing Remote well because `MutationDescriptor` already has:

```ts
Input
Output
```

as Effect Schemas.

---

# 27. Do not make Entity imply CRUD

Avoid APIs like:

```ts
CMS.fromEntity(Post)
```

that silently invent:

```text
list
get
create
update
delete
```

This would violate Remote's explicit contract model.

Instead, eventually introduce a management **Resource** descriptor.

Conceptually:

```ts
const Posts = Admin.resource(Post, {
  list: {
    query: PostsQuery,
    selection: PostRow,
  },

  create: {
    mutation: CreatePost,
    form: CreatePostForm,
  },

  edit: {
    mutation: UpdatePost,
    form: EditPostForm,
  },

  delete: {
    mutation: DeletePost,
  },
})
```

A Resource says:

> these capabilities are intentionally exposed for this management experience.

Entity alone says nothing about them.

---

# 28. `Resource` should initially live in Admin, not Entity core

Do not prematurely create a universal operation abstraction.

Start with:

```text
foldkit-admin
```

and let its Resource explicitly understand existing Remote Query/Mutation contracts.

If several non-Remote packages later need the same abstraction, extract it then.

This obeys Foldkit Plus's own rule:

> add a primitive only when it simplifies several consumers.

---

# 29. Relation pickers also require explicit data access

Knowing:

```ts
Post.relations.author -> Author
```

is not enough to build a usable author selector.

The UI also needs:

```text
How do I search/list Authors?
What fields identify them to humans?
What selection should be displayed?
What authorization applies?
```

That information belongs to the Resource layer.

For example:

```ts
const Authors = Admin.resource(Author, {
  list: {
    query: SearchAuthors,
    selection: AuthorOption,
  },
})
```

Then the Post author control can resolve the target Resource and use that query.

This avoids an ORM-like hidden:

```text
SELECT * FROM authors
```

being generated merely because a relationship exists.

---

# 30. Entity presentation metadata can define human identity

Generic admin tools need a way to render:

```text
Author:u17
```

as:

```text
Grace Hopper
```

Add optional presentation metadata such as:

```ts
EntityUI.describe({
  label: "Author",
  pluralLabel: "Authors",
  titleField: "name",
})
```

The key should be statically constrained:

```ts
titleField: "naem"
```

must fail.

This is presentation metadata, not Entity identity.

---

# 31. Drizzle becomes a true persistence interpreter

Current `remote-drizzle` has a very good “declare once” motivation, but currently the thing being declared once is largely the Drizzle binding itself.

Invert that relationship.

New model:

```text
Entity
    semantic declaration

Drizzle.bind(Entity, table)
    persistence interpretation
```

Example:

```ts
const PostDb = Drizzle.bind(Post, posts, {
  relations: {
    author: {
      field: posts.authorId,
    },

    comments: {
      foreignKey: comments.postId,
    },

    tags: {
      through: postTags,
      localColumn: postTags.postId,
      foreignColumn: postTags.tagId,
    },
  },
})
```

Notice what disappeared:

```ts
one(Author, ...)
many(Comment, ...)
manyToMany(Tag, ...)
```

The target and cardinality are already known from:

```ts
Post.relations
```

Drizzle configuration now answers only:

> how is this semantic relation represented in this database?

That is exactly the adapter's job.

---

# 32. Drizzle scalar mapping should be inferred by name

For:

```ts
Post.fields.id
Post.fields.title
Post.fields.published
```

and:

```ts
posts.id
posts.title
posts.published
```

the binding should infer mappings automatically.

Allow overrides:

```ts
Drizzle.bind(Post, posts, {
  fields: {
    title: posts.postTitle,
  },
})
```

Definition-time checks should verify schema compatibility where possible.

This preserves the current package's main benefit:

> no per-screen SQL mapping.

---

# 33. Drizzle relations should validate the semantic descriptor

Given:

```ts
Post.relations.author
```

declared as:

```text
one Author
```

this should be valid:

```ts
author: {
  field: posts.authorId,
}
```

For:

```ts
Post.relations.comments
```

declared as:

```text
many Comment
```

this should be valid:

```ts
comments: {
  foreignKey: comments.postId,
}
```

A nonsensical binding should fail at definition/type-check time where feasible.

The Drizzle adapter may additionally validate:

* nullable SQL FK versus optional Relation;
* column type compatibility;
* through-table mappings;
* uniqueness if a one-to-one inverse requires it;
* missing bindings for relations the Source claims to expose.

---

# 34. Referential actions belong to persistence

Things like:

```text
ON DELETE CASCADE
SET NULL
RESTRICT
database foreign key
join table
```

do not belong in foundational Relation.

They belong in:

```text
Drizzle binding
database migration/schema
possibly operation policy
```

This is one place where Gen2's relation model is more database-aware than Foldkit Entity should be.

Borrow its first-class relation idea, but not all of its persistence policy.

---

# 35. Remote should consume `foldkit-entity`

Refactor:

```text
foldkit-remote
```

to depend on:

```text
foldkit-entity
```

instead of owning the canonical Entity declaration itself.

Remote then interprets:

```text
Field
Relation
Derived
Selection
```

into:

```text
normalized store keys
wire refs
requirements
connection requirements
RemoteData
```

---

# 36. Remove relation discovery through Schema AST annotations

Current Remote asks roughly:

```text
Is this schema field annotated as a relation?
What target entity was annotated?
Is it an array?
Is it nullable?
```

With explicit Relation descriptors, Remote can simply read:

```ts
member._tag === "Relation"

member.cardinality

member.optional

member.target()
```

This is substantially cleaner.

The old annotations can remain temporarily as a backward-compatibility adapter.

They should not remain the new semantic source of truth.

---

# 37. Remote wire representation remains Remote's concern

A semantic relation might be:

```ts
Post.relations.author
```

Remote can compile that to its existing normalized ref representation:

```text
"Author:u1"
```

Drizzle does not need Entity core to know that encoding.

Entity does not need to know that encoding.

This is the interpreter boundary working properly.

---

# 38. Remote selections become simpler

Instead of:

```text
look at Schema field
walk annotations
discover relation
determine target/cardinality
```

selection compilation becomes:

```text
look up Entity member
switch member._tag

Field
    use member.schema

Derived
    use member.schema

Relation
    inspect member.target/cardinality
    compile nested selection
```

This should eliminate a meaningful amount of fragile type/runtime machinery.

---

# 39. Keep Remote mutation ownership exactly where it is

Do not move mutation execution into Entity.

Current Remote mutation semantics are correct:

```text
Mutation descriptor
    declares Input/Output schemas

Data.mutate
    updates Remote state + returns Command

RemoteClient
    performs I/O

result
    comes back as Message

Remote reducer
    reconciles cache
```

Entity can help describe mutation fields, but cannot become a mutation authority.

This is especially important given Foldkit's rule:

```text
writes -> Messages -> update
```

---

# 40. Surface remains the consumer-facing feature boundary

Do not make Entity replace Surface.

Example eventual flow:

```text
Entity
    Post semantics

Selection
    PostEditorData

Remote
    produces Projection<PostEditorData>

Surface
    exposes exactly that projection
    + Save/Cancel/etc Messages

Form
    owns draft Submodel

SurfaceView
    binds projection/messages to rendered slots

Mixins
    styles and decorates controls
```

Each primitive still has one job.

---

# 41. Entity/Remote helpers may produce Surface Projections

A useful bridge package or helper could eventually provide:

```ts
Data.get(PostEditorSelection, postId)
```

which already returns the current Remote-backed Surface `Projection`.

No new state mechanism is necessary.

Editor/admin generation can compose those projections exactly like handwritten features do.

---

# 42. Generated admin UI must compile to ordinary Foldkit

A generated editor should not create a hidden runtime.

Conceptually:

```text
Admin Resource
      │
      ▼
Surface
+
Form Submodel
+
Messages
+
Subscriptions/Commands
+
SlotViews
      │
      ▼
ordinary Foldkit application
```

This is what “seamlessly built into Foldkit Plus” should mean.

The output of the abstraction is made of normal Foldkit concepts.

---

# 43. Suggested package layout

Long-term:

```text
packages/
  metadata/
  entity/
  form/
  admin/

  surface/
  mixins/
  mixins-ui/
  mixins-surface/

  remote/
  remote-server/
  remote-drizzle/

  sync/
  durable/
  ...
```

Potential later package:

```text
cms/
```

but only once actual CMS-specific concepts appear.

Do not name generic entity/forms functionality `cms`.

---

# 44. Dependency direction

Target dependency graph:

```text
foldkit-metadata
       ▲
       │
foldkit-entity
       ▲
       │
 ┌─────┼──────────────┐
 │     │              │
 │     │              │
 ▼     ▼              ▼
remote form       future adapters
 │     │
 │     ▼
 │   admin
 │     ▲
 ▼     │
remote-drizzle
```

And independently:

```text
surface
mixins
mixins-surface
```

are consumed where needed.

Critically, never:

```text
entity -> remote
entity -> drizzle
entity -> admin
```

---

# 45. Proposed core API

An end-state domain definition should feel roughly like this:

```ts
import { Schema } from "effect"
import {
  Entity,
  Relation,
  Derived,
} from "foldkit-entity"

export const Author = Entity.define(
  "Author",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String.pipe(
      Schema.minLength(1),
    ),
  }),
)

export const Tag = Entity.define(
  "Tag",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)

export const Post = Entity.define(
  "Post",
  Schema.Struct({
    id: Schema.String,

    title: Schema.String.pipe(
      Schema.minLength(1),
      Schema.maxLength(200),
    ),

    body: Schema.String,

    published: Schema.Boolean,

    createdAt: Schema.Date,
  }),
).pipe(
  Entity.relations({
    author: Relation.one(() => Author),

    tags: Relation.many(() => Tag),

    comments: Relation.many(() => Comment),
  }),

  Entity.derived({
    commentCount: Derived.make(Schema.Number),
  }),
)
```

Then:

```ts
Post.schema
Post.fields.title
Post.relations.author
Post.relations.tags
Post.derived.commentCount
Post.members
```

are all inspectable typed values.

---

# 46. Presentation is attached independently

Example:

```ts
export const CmsPost = Post.pipe(
  EntityUI.describe({
    label: "Post",
    pluralLabel: "Posts",
    titleField: "title",
  }),

  EntityUI.configure({
    fields: {
      title: {
        label: "Title",
        input: Input.text(),
      },

      body: {
        label: "Body",
        input: Input.markdown(),
      },

      published: {
        label: "Published",
        input: Input.toggle(),
        display: Display.badge({
          true: "Published",
          false: "Draft",
        }),
      },

      createdAt: {
        label: "Created",
        display: Display.date(),
      },
    },

    relations: {
      author: {
        label: "Author",
        input: Input.relationOne(),
      },

      tags: {
        label: "Tags",
        input: Input.relationMany(),
      },
    },
  }),
)
```

`CmsPost.identity === Post.identity`.

The metadata changed.

The Entity did not become a different domain entity.

---

# 47. Drizzle is bound independently

```ts
const PostDb = Drizzle.bind(Post, posts, {
  relations: {
    author: {
      field: posts.authorId,
    },

    comments: {
      foreignKey: comments.postId,
    },

    tags: {
      through: postTags,
      localColumn: postTags.postId,
      foreignColumn: postTags.tagId,
    },
  },

  derived: {
    commentCount: Drizzle.count(
      Post.relations.comments,
    ),
  },
})
```

No domain target duplication.

---

# 48. Selection is reusable

```ts
const AuthorOption = Author.select({
  id: true,
  name: true,
})

const PostRow = Post.select({
  id: true,
  title: true,
  published: true,
  author: AuthorOption,
  commentCount: true,
})
```

This value can later be consumed by:

```text
Remote
Admin tables
relation pickers
agents
documentation
static analysis
```

without re-declaring the shape.

---

# 49. Admin Resource is explicit

```ts
const PostsAdmin = Admin.resource(CmsPost, {
  list: {
    query: PostsQuery,
    selection: PostRow,
  },

  edit: {
    selection: PostEditorData,
    mutation: UpdatePost,
    form: PostEditForm,
  },

  create: {
    mutation: CreatePost,
    form: CreatePostForm,
  },

  delete: {
    mutation: DeletePost,
  },
})
```

Then:

```ts
Admin.list(PostsAdmin)
Admin.create(PostsAdmin)
Admin.edit(PostsAdmin)
Admin.detail(PostsAdmin)
```

can derive conventional Surfaces/views.

No declared capability means no generated screen.

---

# 50. What a future CMS package actually adds

Once the above exists, `foldkit-cms` should be surprisingly small.

CMS-specific concepts could include:

```text
draft/published lifecycle
slug handling
revision history
scheduled publishing
media fields
content preview
content collections
SEO metadata
authoring workflows
```

Those are genuinely CMS semantics.

Basic:

```text
schema
relation
input
form
table
CRUD operation binding
```

are not CMS-specific and belong lower in the stack.

---

# 51. First implementation milestone: do NOT build CMS yet

The first implementation should prove the architecture through the foundational seam.

## PR 1 — generic metadata extraction

Create:

```text
packages/metadata
```

Move the generic implementation out of Surface.

Update Surface to use it.

Preserve:

```ts
Metadata.key(...)
```

through re-export if needed.

### Acceptance

All existing Surface tests pass unchanged or nearly unchanged.

No behavior change.

---

# 52. PR 2 — `foldkit-entity`

> **Status:** built as [`packages/entity`](../../packages/entity/README.md);
> PR 1 is [`packages/metadata`](../../packages/metadata/README.md). Departures:
>
> - **Relations are declared in one step, not per Entity.** `Post` relating to
>   `Comment` while `Comment` relates to the piped `Post`, as §7 and §45 write
>   it, fails with TS7022: each constant's inferred type contains the other's.
>   A thunk defers evaluation, not inference. So there is no `Entity.relations`
>   pipe step and no thunk (§9). `Entity.relate({ Author, Post, Comment }, {
>   Post: { comments: Relation.many(Comment) }, Comment: { post:
>   Relation.one(Post) } })` takes definitions that already exist and returns
>   them related. `target()` yields the related Entity, typed recursively
>   (`Related`), so PR 3's nested selection can follow relations through a
>   cycle. Owner-local cardinality (§8) and identity (§10) are unchanged, and
>   a target outside the call is now a definition-time error.
> - Metadata attaches with `Entity.annotate(metadata)` and
>   `Entity.annotateMembers({ key: metadata })`.
> - Field schemas are typed `Schema.Constraint`, which is what
>   `Schema.Struct.Fields` holds in Effect 4, not `Schema.Top`.
> - `Entity.same(a, b)` compares identity tokens. A collision is a type error
>   at the pipe step as well as a definition-time `Error`.

Implement:

```text
Entity
EntityIdentity
EntityField
Relation
Derived
EntityMember
Metadata attachment
```

Initially support:

```ts
Entity.define(name, Schema.Struct(...))

Entity.relations({...})

Entity.derived({...})
```

Generate Field refs.

Add stable identity propagation through pipe decorators.

### Runtime invariants

Reject:

* field/relation collision;
* field/derived collision;
* relation/derived collision;
* invalid duplicate relation declaration;
* invalid target resolution if detectable.

### Type tests

Verify:

```text
field keys remain literal
field decoded types remain exact
relation target type remains exact
relation cardinality remains literal
derived types remain exact
decorated Entity preserves identity/type
unknown metadata key/value mismatches fail
```

---

# 53. PR 3 — Entity Selection

> **Status:** built as `Entity.select(entity, spec)` in
> [`packages/entity`](../../packages/entity/README.md). Only the standalone form
> exists, not `entity.select`. A nested selection is a Selection value (§48),
> never an inline object, so "wrong relation cardinality shape" reduces to
> rejecting `[Selection]`. `true` on a relation yields `EntityRef` (§15) with a
> `string` id (§73).

Move or recreate the storage-neutral portion of current Remote Selection.

Implement:

```ts
Entity.select(entity, {...})
```

and/or:

```ts
entity.select({...})
```

Selection knows how to produce an assembled output schema.

Support:

```text
Field -> true

Derived -> true

Relation -> true or nested Entity Selection
```

No query windows yet.

No Remote requirements yet.

### Tests

Compile-time:

```text
unknown member rejected
nested selection on scalar rejected
wrong target entity rejected
wrong relation cardinality shape rejected
```

Runtime:

```text
nested schema assembled correctly
optional one produces nullability
many produces arrays
derived schema included
```

---

# 54. PR 4 — adapt Remote to `foldkit-entity`

> **Status:** first slice built, in the other direction from the one written
> below. Instead of Remote's registry and planner learning `EntityMember`,
> `Entity.from(entity)` and `Selection.from(selection)` in `foldkit-remote`
> compile a foundational Entity and Selection into Remote's existing descriptor
> and Selection (relations become ref codecs, derived members become fields).
> The store, planner, wire, `remote-server`, and `remote-drizzle` are untouched,
> and `Entity.make` / `Entity.ref` keep working beside it, so there is no flag
> day (§59).
>
> `Remote.make` / `Remote.define` then took foundational Entities directly,
> and `Data.get`, `Data.live`, `Remote.select`, and a query's `select` took
> Entity Selections, normalizing through the two compile steps. Client code
> imports nothing of Remote's own `Entity` or `Selection`.
>
> Remote's descriptor stays: it is the normalized wire schema (relations as ref
> codecs), a real layer that the store, the server, and `remote-drizzle`'s
> table-derived `entity()` share, not a second way to declare a domain. It is
> the kernel path; `foldkit-entity` is the documented one.
>
> Paginated relations are built as `Entity.page` (§14): a page is a view concept
> (first N, has-next) as neutral as `many` is an array, and cursors stay with
> the interpreter. One limit is Remote's own and older than this: a relation
> field of one entity is stored whole or as one window, so the same relation
> read both ways at once by two views is not supported.

Change Remote's entity registry to consume foundational Entities.

Refactor Selection requirement compilation to inspect explicit `EntityMember` values instead of Schema annotations.

Keep:

```text
Remote.Model
Data.get
Data.live
Data.query
Data.mutate
RemoteClient
RemoteServer
```

semantics unchanged.

### Transitional support

Keep current APIs working where practical:

```ts
Entity.make(...)
Entity.ref(...)
Entity.refTo(...)
```

through a compatibility adapter.

Mark the schema-annotation relation path deprecated.

New code should use:

```ts
Entity.relations(...)
```

---

# 55. PR 5 — refactor `remote-drizzle`

> **Status:** built as `bind(entities, storage)` in `foldkit-remote-drizzle`,
> beside `entity(name, table, …)` rather than replacing it. It takes a whole
> `Entity.relate` result in one step, for the reason relations do (§52): a
> relation's target binding may be declared after its owner, so bindings can
> now form a cycle. Storage is `{ field }`, `{ foreignKey, localKey? }`, or
> `{ through, localColumn, foreignColumn }` as §31 writes it; fields map by
> name with `fields` overrides (§32); a derived member is `{ relation, where? }`,
> a count, the one kind the package computes (§11 writes it
> `Drizzle.count(Post.relations.comments)`). The result is the existing
> `EntityBinding` over `Entity.from`'s descriptor, so the query compiler is
> unchanged. Checked at definition: missing column, missing storage, storage of
> the wrong cardinality, a count over a `one`, and a required `one` over a
> nullable column. Not checked: column type against field schema, and
> uniqueness for a one-to-one inverse (§33).

Introduce:

```ts
Drizzle.bind(Entity, table, config)
```

Keep old:

```ts
entity(name, table, config)
```

as compatibility sugar temporarily.

New Drizzle binding must:

* derive scalar column mappings;
* implement semantic Relations;
* implement Derived members where configured;
* compile Entity selections/Remote requirements;
* continue producing normalized Remote patches;
* keep authorization in RemoteServer;
* keep DB connection ownership in Effect Layer.

### Critical design rule

`Drizzle.bind` may implement members.

It may not invent semantic Relations.

---

# 56. PR 6 — renderer-neutral Input/Display metadata

> **Decided, not built.** Three things this section and §74 leave open:
>
> - **Labels and descriptions are Schema annotations, not new metadata.** Effect
>   Schema already carries `title` and `description`, they already reach JSON
>   Schema (so agents get them too), and §16 makes Schema the one truth. A field
>   is labelled with `Schema.String.annotate({ title: 'Title' })`; a relation or
>   a derived member, which has no field schema of its own to annotate, takes
>   the same two values through Entity metadata.
> - **No `foldkit-entity-ui` package.** What is left after labels is a control
>   preference, and only a form reads it, so the `Input` key belongs to
>   `foldkit-form` (the interpreter owns its key, §5), where it is now built
>   as `Input.of(control)` with the resolver `Input.resolve`. `Display` waits for the
>   package that renders tables; nothing consumes it yet.
> - **The resolver order in §20 stands**, with Schema annotations as step 2's
>   source for anything Schema can already say.

Implement either:

```text
packages/entity-ui
```

or initially:

```text
packages/form/src/presentation.ts
```

if avoiding another package.

Provide:

```ts
EntityUI.describe
EntityUI.configure

Input.*
Display.*
```

Do **not** implement complex Form state yet.

Prove:

```text
Schema/semantic metadata -> Input resolver
Input IR -> Foldkit UI control registry
```

---

# 57. PR 7 — `foldkit-form`

> **Status:** built headless as [`packages/form`](../../packages/form/README.md):
> `Form.make(name, Entity.input(...), { inputs? })` returns the Bundle, its
> Message constructors, `controls` (key, control, label, required, member), and
> `canSubmit`. The decisions it was built on:
>
> - **A form is built from a `Schema.Struct` and an `Entity.input` reading of
>   it (§72), not from a Remote mutation.** A Foldkit form's result is a
>   Message. What the application does with it (a Remote mutation, a Sync
>   operation, a plain `update`) is the application's, so the form must not
>   depend on Remote, and `MutationDescriptor` does not need to keep its input
>   fields. The struct is declared once and handed to both; the submit site
>   type-checks that the form's value is the operation's input.
> - **State is Foldkit core's `fieldValidation`**, not a new draft/touched
>   model: each key is a `Field<Draft>` (`NotValidated` / `Validating` / `Valid`
>   / `Invalid`), and rules come from the member's schema through
>   `Rule.fromSchema`. `Draft` is what the control holds (§24): a string for
>   text and for a number being typed, a boolean for a toggle, an id or ids for
>   a relation.
> - **It is a `foldkit-bundle` Bundle**, since a form is a Submodel placed once
>   or per key, with `Submitted { value }` as its out Message.
>
> What building it settled:
>
> - **A key is validated against the input's schema for that key, not the
>   Entity's.** The operation decides validity and may be stricter (§26).
> - **`required` is derived, not declared.** An empty draft submits whatever the
>   schema admits for it (the key left out, `null`, the empty value), and a key
>   is required exactly when none is admitted.
> - **`Entity.input`'s fit check ignores `null`** as well as `undefined`: an
>   input sends `null` to clear a key whether or not the member admits it, and
>   the first real form needed that.
> - **No submitting state.** The operation's status belongs to whoever runs it.
> - **Touched/dirty are not tracked separately.** `NotValidated` versus the
>   other states is the touched distinction core already makes.
>
> The view is a companion, [`packages/mixins-form`](../../packages/mixins-form/README.md),
> as §21 asks: each control is drawn as plain HTML through a Mixins slot per
> control kind (`text`, `toggle`, `select`, …) with the capability that kind has,
> so a generated form is styled and extended like any other SlotView and
> `foldkit-form` takes no view dependency. Fields and the form are two slot
> contracts, because a field's Style reads that field (`input.invalid`). It joins
> the form's Bundle through a new `Bundle.withView`, since `mapView` cannot
> change a bundle's view inputs. Relation picker choices arrive as view inputs
> (§29): the form names the target, the application lists it.
>
> Async validation is built as `checks`: an injected Effect per key, so the form
> still knows nothing of Remote. It uses core's `Validating` state, runs after
> the schema passes, drops stale answers, and a submit waits for it.
>
> Not built: nested input, picker search or paging, and
> `Form.from` sugar, which `Entity.input`'s self-mapping made unnecessary.

Implement a Form descriptor and Foldkit Submodel.

Core APIs might resemble:

```ts
const EditPostForm = Form.define({
  Input: UpdatePost.Input,

  fields: {
    title: Form.field(Post.fields.title),
    body: Form.field(Post.fields.body),
    author: Form.relation(Post.relations.author),
  },
})
```

Then sugar can derive defaults:

```ts
const EditPostForm = Form.from({
  entity: CmsPost,
  Input: UpdatePost.Input,
})
```

Only fields actually represented by `Input` are editable.

Implement:

```text
draft state
dirty/touched
validation errors
submit decoding
reset
field Messages
```

using ordinary Foldkit state/update/Submodel concepts.

---

# 58. PR 8 — `foldkit-admin`

> **Status:** an editor and a list are built as [`packages/admin`](../../packages/admin/README.md):
> `Admin.editor(name, { form, mutation })` then `.at({ data, model })`, covering
> `edit` and `create`; and `Admin.list(name, { query, selection })` then
> `.at({ data, input })`; `Admin.detail` and `Admin.remover` complete the five
> capabilities this section lists.
>
> - **Delete needed Remote to be able to say "gone".** A mutation's outcome could
>   patch entities and change connections, but not delete. `deleted` on the
>   outcome tombstones, and since a tombstone already hides an entity from every
>   connection and relation, the server names no list and the remover knows
>   nothing of lists either.
> - **An editor whose entity is gone says `NotFound`**, even after a save that
>   landed: found when deleting the post open in the editor left it on `Saved`.
>
> - **A list holds no state, so it is not a Bundle.** Its pages are Remote's and
>   its input (a search term, filters) is the application's Model. It contributes
>   an ActiveSurface, the page as `RemoteData`, the Command for the next page,
>   and `columns` labelled as a form labels the same members.
> - **§29's picker data is a list with a `choice`.** The form names the target
>   and stops; the application declares the query that lists it, the server
>   authorizes it, and `Admin.options(form, lists)` hands each picker the list
>   over its target, matched by Entity. No read happens because a relation
>   exists, and a picker with no list is an error when the page is wired.
> - **Drawn and run in a browser.** [`examples/entity`](../../examples/entity)
>   draws the list from its own columns and the editor through
>   `foldkit-mixins-form` (`Admin.editorView` lifts the form's view), is tested on
>   the real runtime in jsdom over SQLite, and has a browser mode over an HTTP
>   transport. So §42 holds: the generated pieces are ordinary Foldkit and draw
>   like any other.
> - **Still no `Admin.resource`.** The two links a Resource was meant to carry
>   turned out to need no container: a list feeds a picker through
>   `Admin.options`, and a row opens in an editor through the editor's own
>   `open(row.id)`. [`examples/entity`](../../examples/entity) wires a list, an
>   editor, and a picker without one.
>
> - **No `Admin.resource` yet.** With one capability a Resource descriptor would
>   be a wrapper nothing else reads (§28: add a primitive when several consumers
>   need it). It earns its place when a list needs to find the editor, and a
>   relation picker the list (§29).
> - **Two steps, because two scopes.** `Admin.editor` makes what the parent's
>   Model and Message are built from (the Bundle). `.at` needs the parent: a
>   child Submodel cannot see Remote's store or start a mutation, so `onOut`,
>   the active Surface, `sync`, and `status` are made once the domain and the
>   editor's `ModelRef` exist.
> - **`edit: { selection }` is derived** (`Entity.selectFor`), as §72 notes.
> - **It generates the ordinary things this section lists**: a Bundle, an
>   `ActiveSurface` that `Data.subscriptions` takes like any Surface, Update
>   Steps, and a Command from `Data.mutate`. No runtime, no store. `status` is
>   read from Remote's mutation state and the loaded value, never stored.
> - **Found while building it, and fixed in Remote:** a read the server answers
>   without a requested id now tombstones it, so opening an id that never existed
>   is `NotFound` instead of `Loading` for good; and a failed mutation's error is
>   kept in the Model beside its id, read with `Data.mutation(model, requestId)`,
>   which the editor's `status` and `saveError` now use.

Only after the lower-level pieces feel good.

Implement explicit Resource descriptors around existing Remote operations.

Begin with:

```text
list
detail
create
edit
delete
```

but only when each capability is explicitly configured.

Generate ordinary:

```text
Surface
Submodel
SlotView
Messages
Commands
Subscriptions
```

rather than adding a runtime.

---

# 59. Migration strategy for current `foldkit-remote`

Current:

```ts
const User = Entity.make(
  "User",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)

const Project = Entity.make(
  "Project",
  Schema.Struct({
    id: Schema.String,
    owner: Entity.ref(User),
  }),
)
```

New:

```ts
const User = Entity.define(
  "User",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)

const Project = Entity.define(
  "Project",
  Schema.Struct({
    id: Schema.String,
  }),
).pipe(
  Entity.relations({
    owner: Relation.one(() => User),
  }),
)
```

Provide enough compatibility that current applications do not need a flag-day migration.

---

# 60. Migration strategy for current `remote-drizzle`

Current:

```ts
const Project = entity("Project", projects, {
  relations: {
    owner: one(User, {
      field: projects.ownerId,
    }),
  },
})
```

New:

```ts
const Project = Entity.define(
  "Project",
  ProjectSchema,
).pipe(
  Entity.relations({
    owner: Relation.one(() => User),
  }),
)

const ProjectDb = Drizzle.bind(
  Project,
  projects,
  {
    relations: {
      owner: {
        field: projects.ownerId,
      },
    },
  },
)
```

Eventually a convenience API may support schema derivation from Drizzle:

```ts
const Project = Drizzle.entity(
  "Project",
  projects,
)
```

but that should compile into the foundational Entity model rather than define a separate kind of Entity.

---

# 61. Drizzle-derived Entity can remain as convenience

The “single declaration” property of current `remote-drizzle` is valuable.

Do not lose it.

Allow:

```ts
const Project = Drizzle.entity(
  "Project",
  projects,
)
```

as shorthand for:

```text
derive Effect Struct from table
        +
Entity.define(...)
        +
Drizzle.bind(...)
```

But the resulting Entity must be a normal `foldkit-entity` Entity.

The conceptual dependency remains:

```text
Drizzle adapter -> Entity
```

not:

```text
Entity semantics belong to Drizzle
```

---

# 62. Introspection should be a first-class requirement

Every descriptor should have a deterministic inspectable representation.

Examples:

```ts
Entity.inspect(Post)

Selection.inspect(PostRow)

Form.inspect(EditPostForm)

Admin.inspect(PostsAdmin)
```

Output must contain data, not live functions, wherever possible.

Lazy targets can summarize by Entity name/identity.

Metadata keys should supply their existing `summarize` behavior.

This enables:

```text
DevTools
docs
architecture manifests
agent context
CI drift tests
debugging
code generation
```

and is one of the strongest themes shared by Foldkit Plus and Gen2.

---

# 63. Diagnostics should be stable

Use the same philosophy as Mixins.

Failures should emit stable codes such as:

```text
entity:member-collision

entity:relation-target-missing

entity:selection-wrong-target

entity-ui:incompatible-input

form:unmapped-input-field

drizzle:relation-cardinality-mismatch

drizzle:missing-relation-binding

admin:missing-option-source
```

Do not throw arbitrary prose-only errors.

This pays off later in:

```text
tests
editor tooling
DevTools
documentation
AI assistance
```

---

# 64. Important rejected direction: relations inside the Struct

Do not make the final core API:

```ts
Entity.define("Post", {
  id: PostId,
  title: Schema.String,
  author: Entity.one(Author),
  comments: Entity.many(Comment),
})
```

It is attractive syntactically.

Architecturally it conflates:

```text
intrinsic entity value
navigation graph
```

and recreates the current problem.

It also raises awkward questions:

```text
Is comments actually present in every Post value?
Is it loaded?
Is it an array of refs?
Is it a paginated result?
Does it serialize?
Is it part of create/update validation?
```

The answer varies by consumer.

Therefore relations belong beside Fields, not inside the canonical value schema.

---

# 65. Important rejected direction: UI component metadata in Entity core

Avoid:

```ts
title: {
  schema: Schema.String,
  component: TextInput,
}
```

That couples domain declaration to one renderer.

Prefer:

```text
Field
    domain schema

EntityUI metadata
    semantic Input IR

renderer registry
    concrete Foldkit component

Mixins
    local styling/behavior customization
```

---

# 66. Important rejected direction: automatically generating CRUD

Do not derive:

```text
POST /posts
PUT /posts/:id
DELETE /posts/:id
```

from:

```ts
Entity.define("Post", ...)
```

Existence of an Entity does not imply authority to perform those operations.

Remote's explicit Query/Mutation descriptors are a better foundation.

---

# 67. Important rejected direction: second form/reactivity runtime

Do not import Effect Atom's state architecture.

Foldkit already has:

```text
Model
Message
update
Submodel
Command
Subscription
Mount
```

The Form abstraction must compile into that model.

Borrow capability matching and schema-first derivation only.

---

# 68. Important rejected direction: duplicate validation metadata

Do not maintain:

```ts
schema: Schema.String.pipe(Schema.minLength(4))

validation: {
  minLength: 4,
}
```

unless the second representation is mechanically derived for presentation.

The Schema is authoritative.

---

# 69. Important rejected direction: a giant universal `Resource`

Do not immediately invent a generic abstraction spanning:

```text
Remote
Sync
Drizzle
HTTP
forms
permissions
routing
CMS
agents
```

Start with Admin consuming Remote's existing operation descriptors.

Extract a more general Resource contract only after another real interpreter requires it.

---

# 70. Testing philosophy

This architecture needs unusually strong type tests because much of its value is static composition.

Every package should have both:

```text
runtime tests
*.test-d.ts type tests
```

Essential type tests include:

### Entity

```text
correct Field value type
wrong field key rejected
stable literal Entity name
Relation target type retained
Relation cardinality retained
metadata doesn't erase Entity type
```

### Selection

```text
scalar cannot accept nested Selection
Relation cannot accept Selection for wrong Entity
many relation becomes array
optional one becomes nullable
Derived is read-only/selectable
```

### UI

```text
Text Input rejected for number-only control where incompatible
RelationOne rejected on many relation
RelationMany rejected on one relation
unknown field configuration rejected
```

### Drizzle

```text
one relation requires appropriate singular binding
many relation requires foreign-side mapping
unknown semantic relation rejected
missing target column rejected
```

### Admin

```text
edit form Input must agree with mutation Input
resource cannot expose undeclared mutation
relation picker target Resource must target correct Entity
```

---

# 71. End-to-end example of the intended architecture

Domain:

```ts
const Author = Entity.define(
  "Author",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)

const Post = Entity.define(
  "Post",
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.pipe(
      Schema.minLength(1),
    ),
    body: Schema.String,
    published: Schema.Boolean,
  }),
).pipe(
  Entity.relations({
    author: Relation.one(() => Author),
  }),
)
```

Presentation:

```ts
const CmsPost = Post.pipe(
  EntityUI.describe({
    label: "Post",
    pluralLabel: "Posts",
    titleField: "title",
  }),

  EntityUI.configure({
    fields: {
      body: {
        input: Input.markdown(),
      },

      published: {
        input: Input.toggle(),
      },
    },
  }),
)
```

Persistence:

```ts
const PostDb = Drizzle.bind(
  Post,
  posts,
  {
    relations: {
      author: {
        field: posts.authorId,
      },
    },
  },
)
```

Read contract:

```ts
const AuthorOption = Author.select({
  id: true,
  name: true,
})

const PostEditorData = Post.select({
  id: true,
  title: true,
  body: true,
  published: true,
  author: AuthorOption,
})
```

Mutation:

```ts
const UpdatePost = Mutation.make(
  "UpdatePost",
  {
    Input: {
      id: Schema.String,
      title: Schema.String,
      body: Schema.String,
      published: Schema.Boolean,
      authorId: Schema.String,
    },

    Output: {
      id: Schema.String,
    },
  },
)
```

Form:

```ts
const EditPostForm = Form.from({
  entity: CmsPost,
  Input: UpdatePost.Input,
  mapping: {
    title: Post.fields.title,
    body: Post.fields.body,
    published: Post.fields.published,
    authorId: Post.relations.author,
  },
})
```

Admin:

```ts
const Posts = Admin.resource(
  CmsPost,
  {
    list: {
      query: PostsQuery,
      selection: PostRow,
    },

    edit: {
      selection: PostEditorData,
      mutation: UpdatePost,
      form: EditPostForm,
    },
  },
)
```

Running feature:

```text
Admin Resource
      │
      ▼
generated Surface
      │
      ├── Remote Projection
      ├── Form Submodel
      └── Save/Cancel Messages
      │
      ▼
SurfaceView / SlotView
      │
      ▼
Input registry
      │
      ▼
ordinary Foldkit UI controls
      │
      ▼
Mixins Style / Behavior
```

There is still:

```text
one application Model
one Message flow
one update function
one explicit effect taxonomy
```

The abstractions merely make conventional structure derivable.

---

# 72. One remaining design problem worth prototyping carefully

> **Status:** spiked as `Entity.input(entity, struct, mapping?)` in
> `foldkit-entity`, marked experimental. Tried against a rename, a partial
> update, a create with relations, and a publish with a flag and a reason. What
> those shapes needed:
>
> - **Self-mapping by field name, checked by value.** Most keys name a field.
>   Requiring `title: Post.fields.title` for each was noise, so a key maps itself
>   when it names a field *and* its value fits the field's type; the mapping
>   lists only the rest. This is a name match on the Entity's own keys, not the
>   `authorId` convention this section rules out.
> - **`Relation.input(relation)` with no second argument.** With string ids
>   (§73) the id is the only thing a relation can take as input. The expected
>   shape follows the relation: an id, `id | null` for an optional `one`, an
>   array of ids for a `many`.
> - **`Entity.unmapped`.** Real inputs carry keys about the operation (a reason,
>   a notify flag). Without an explicit value for those, "every key is accounted
>   for" cannot be checked.
> - **An explicit entry wins over self-mapping**, for a key whose name collides
>   with a field it does not write.
> - **Remote erases the struct.** `Mutation.make` keeps `Input` as
>   `Schema.Codec<Input>`, so `Entity.input` cannot read a mutation's keys. The
>   application declares the `Schema.Struct` once and passes it to both. If forms
>   should start from a mutation, `MutationDescriptor` needs to keep its fields.
>
> Later, from the first edit screen: `Entity.selectFor(input)` and
> `Entity.valuesFor(input, value)`. What an edit loads, and how the loaded value
> becomes input values, both follow from the reading (a relation is loaded as a
> ref and read back as an id), so §49's `edit: { selection }` need not be
> written for the common case.
>
> Not explored: nested input (a create that embeds a new Author), and whether
> the result should carry per-key metadata of its own for a form to read.

The hardest unresolved API is the mapping between an operation's input schema and Entity members.

Example:

```ts
UpdatePost.Input
```

might contain:

```text
title
body
authorId
```

while the Entity graph contains:

```text
fields.title
fields.body
relations.author
```

The first two map trivially by name.

`authorId -> relations.author` does not.

Do **not** hide this mismatch with string conventions.

For the first implementation, allow an explicit typed mapping:

```ts
mapping: {
  title: Post.fields.title,
  body: Post.fields.body,
  authorId: Relation.input(
    Post.relations.author,
    "id",
  ),
}
```

or equivalent.

Once several examples exist, a cleaner operation-input projection may emerge.

Do not over-design it before those examples.

This is probably the most important thing to spike before finalizing `foldkit-form`.

---

# 73. Another unresolved detail: typed IDs

Current Remote essentially normalizes IDs as strings.

A richer Entity system could eventually support:

```ts
Entity<"Post", PostId>
EntityRef<"Post", PostId>
```

with an explicit identity field/schema.

That is attractive, especially for relationships.

But it should not block the first refactor.

Recommended initial scope:

```text
EntityRef.id = string
```

preserving current Remote semantics.

After Entity/Relation extraction is stable, consider:

```ts
Entity.identify(Post.fields.id)
```

and typed ID encoding.

---

# 74. Another unresolved detail: where Input/Display package lives

There are two reasonable initial layouts.

### Cleaner conceptual separation

```text
foldkit-entity-ui
foldkit-form
```

where:

```text
entity-ui
    Input/Display metadata + resolver

form
    editing state + validation + Submodel
```

### Fewer packages initially

```text
foldkit-form
  presentation/
  input/
  display/
  form/
```

and split `entity-ui` later if another consumer needs it.

Given Foldkit Plus already has many packages, I would initially choose the second unless admin/table rendering needs Display before Form exists.

Do not let package-count purity dominate the architecture.

---

# 75. Concrete first PR recommendation

Start with the seam that everything else depends on.

The first meaningful implementation PR should contain only:

```text
1. foldkit-metadata extraction

2. foldkit-entity
   - Entity
   - EntityIdentity
   - generated Field refs
   - Relation.one
   - Relation.many
   - lazy targets
   - metadata
   - member collision checks

3. tests

4. no Remote behavior changes yet
```

Then a second PR introduces Entity Selection and adapts Remote.

This gives a clean review boundary.

---

# 76. Success criteria for the architecture

The design is successful if, at the end, all of these are true.

**A domain object is declared once:** its fields, validation and logical relationships are not separately restated in Remote, Drizzle and admin code.

**Effect Schema remains authoritative:** no second validation/type system exists.

**Persistence is replaceable:** the same Entity can be bound to Drizzle, memory, an HTTP service or something else without changing its semantic declaration.

**Presentation is replaceable:** the same Entity can drive a Foldkit admin UI, a CLI editor, an agent schema or docs without containing renderer-specific components.

**Remote stays explicit:** Entity declaration alone performs no I/O and creates no hidden CRUD endpoints.

**Foldkit state ownership stays intact:** generated forms/admin experiences ultimately become Models, Messages, Submodels, Commands, Subscriptions and Views.

**Relations become inspectable:** consumers can reason about entity topology without decoding Effect Schema annotations or inspecting Drizzle definitions.

**CMS becomes mostly derivation:** conventional editing/list/detail experiences require little bespoke code because the needed facts already exist in reusable descriptors.

**Escape hatches remain:** unusual forms, custom views, custom queries, custom inputs and custom mutation flows can drop down to ordinary Foldkit without fighting the framework.

---

# 77. Final architectural model

The end result should feel like this:

```text
                    ┌────────────────┐
                    │ Effect Schema  │
                    │ valid values   │
                    └───────┬────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │ foldkit-entity │
                    │                │
                    │ Fields         │
                    │ Relations      │
                    │ Derived        │
                    │ Selection      │
                    │ Metadata       │
                    └───────┬────────┘
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
          ▼                 ▼                  ▼
    ┌───────────┐     ┌──────────┐       other targets
    │  Remote   │     │   Form   │
    └─────┬─────┘     └────┬─────┘
          │                │
          ▼                ▼
 ┌───────────────┐    ┌──────────┐
 │ Remote Server │    │  Admin   │
 └──────┬────────┘    └────┬─────┘
        │                  │
        ▼                  ▼
 ┌───────────────┐    Surface/View
 │    Drizzle    │         │
 └───────────────┘         ▼
                       Mixins/UI
```

And the conceptual rule remains simple:

> **Schema defines valid values. Entity defines domain meaning. Relations define topology. Interpreters decide how those facts are stored, transported, edited and rendered. Foldkit remains the runtime.**

That is the design direction I would implement.
