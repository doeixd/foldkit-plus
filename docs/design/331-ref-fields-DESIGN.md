# A Model field may have any name (#331)

Status: built (2026-10-30) in `foldkit-surface`, with every caller in
packages and examples moved to `ModelRef.focus`.

## The problem

`App.model` is a tree of `ModelRef`s, and each node held its own members
(`Schema`, `optic`, `dependency`, `get`, `set`, `modify`, `key`, `owner`,
`at`, `index`, `select`) as properties beside the Model's fields. A field
with one of those names would have shadowed a member, so building the tree
threw `Model field "index" is reserved by ModelRef`, for any Model at any
depth, as soon as a Surface read it. The names are ordinary English: the
Carousel's `index` and the Sheet's `at` broke the site, and both were renamed
(`slide`, `point`) only to get past it. A third-party component's Model
breaks every application that folds it in, at run time, far from the field.

The set was not even complete. `modify` and `owner` were members but not
reserved, so a field so named silently replaced the member; and
`Projection.struct` told a ref from a Projection by `'dependencies' in
entry`, so a ref to a Struct with a `dependencies` field read as a
Projection.

## Decision

The string keys of a ref are the Model's fields, and nothing else. The ref's
own members live under one symbol, and `ModelRef.focus(ref)` hands them out:

```text
App.model.carousel.index                       a field, whatever its name
ModelRef.focus(ref)                            the ref's focus, a plain record:
  .get(model)  .set(model, v)  .modify(model, fn)
  .at(key)  .index(i)  .select(projection)     (each only where the value allows it)
  .dependency  .Schema  .optic  .key  .owner
```

1. **One symbol, `Symbol.for('foldkit-surface/ModelRef')`.** No string a
   Schema field can carry reaches it, so the reserved set and the throw go.
   `Symbol.for`, so two copies of the package still read each other's refs.
   The symbol (`RefTypeId`) and the record types a focus is made of
   (`Focus`, `Selects`, `Entries`, `Indexes`) are exported: a declaration
   file that names a ref's type has to name its key.
2. **One accessor.** A method on the ref is a property beside the fields,
   which is the collision; so is any second name. `focus` returns the record
   as the ref's type gives it: `at` exists only on a record's focus, with its
   key type (a branded key stays branded), `index` only on an array's.
   Library code takes the focus once (`const store = ModelRef.focus(model)`)
   and reads it as before.
3. **The read half is still its own type.** `ModelPlace<Root>` is a ref whose
   focus has `dependency` and `get`, so a field holding a tagged union (a
   union of field refs) is accepted where only reading is needed
   (`Surface.when`, a Site route).
4. **A ref is told by its symbol.** `Projection.struct` asks `ModelRef.is`,
   not whether a member name (`dependencies`) is present.
5. **Breaking.** Every `ref.get(…)`, `ref.at(…)`, `ref.select(…)`,
   `ref.dependency` in packages, examples and docs reads through `focus`.
   The Carousel's `slide` and the Sheet's `point` go back to `index` and
   `at`, the names they had before the rename that existed only for this.

## Rejected

- **Fields under one member (`ref.fields.index`).** Every field step, the
  common case, would pay a `.fields`, and `fields` itself would be a member.
- **A type-level rejection of reserved names.** It moves the failure to
  compile time but keeps the reserved set, and a component's Model still
  cannot use `index`.
- **Members win, fields reached by `ref.field('index')`.** Two ways to reach
  a field, and which one depends on the name.
- **One function per member (`ModelRef.get(ref, model)`, `ModelRef.at(ref,
  key)`).** Shorter at a call, but a library that reads a ref many times
  wants the record, and offering both is two ways to do one thing.

## Tests

- An application whose Model uses every former member name (and `modify`,
  `owner`, `dependencies`), nested, builds its tree; each field reads and
  writes through its focus; `Projection.pick`, `Projection.struct` and a
  Surface read them.
- `at`/`index` on the focus of a non-record or non-array ref, a plain string
  for a branded key, and a member read off the ref itself are type errors.
