# Entity, Form, and Crud: DX plan

Status: eight of nine items resolved; the last is recorded with why it was not
done. Friction found while building `foldkit-entity`, `foldkit-form`,
`foldkit-mixins-form`, `foldkit-crud`, and `foldkit-mixins-crud` and wiring them
into [`examples/entity`](../../examples/entity). Each item names what prompted
it, so it can be judged rather than taken on faith. Items are marked as they are
resolved. The design these packages came from is
[entity-DESIGN.md](./entity-DESIGN.md).

## 1. One primitive for controls and for displays (resolved)

**Friction.** `Control` was a closed union of eight kinds and `Display` of six.
An application needs a date picker, rich text, or a money field on its first
day, and the only way in was to pretend the key was `Text` and draw it by hand.

**Decision.** There is no distinction between built-in and custom. A control is
one primitive: a `kind` (a name), the `draft` it holds while edited, and
whatever data its kind needs. `Input.text()` and `Input.toggle()` are values of
that primitive, made by the same constructor an application uses for `'date'`.
The built-ins are a collection, not a special case.

The same holds on the drawing side. `foldkit-mixins-form` draws a control by
looking its kind up in a set of renderers. The renderers it ships are the
default set; an application adds to it, or replaces an entry, the same way the
defaults were added. `Display` and `foldkit-mixins-crud` follow the same shape.

## 2. Address a nested form with types (resolved)

**Friction.** Editing a nested row meant
`Message.Nested({ key, row, message })` with `key` a string and `message`
`unknown`. The tests needed a `_tag === 'Nested'` narrowing and `as never` to
reach the child form's Messages.

**Plan.** `form.nested.author` is the child form, typed. `form.row('author', id)`
gives the child's Message constructors already wrapped for that row.

## 3. A nested form is a form you can pass (resolved)

**Friction.** The parent built the child form itself and took its configuration
through a `nested: { author: { inputs, checks } }` bag that recursed.

**Plan.** `nested: { author: AuthorForm }` takes a form made with `Form.make`.
One author form serves alone and nested. The options bag goes.

## 4. Placing an editor takes eight steps (resolved: `Crud.actives`)

**Friction.** `Bundle.declare`, spread fields, spread cases, `.at`, `Page.at`
with `onOut`, wrap `update` in `after`, add `active`, and for a searching picker
add `chosen` and a second `active`. Missing one leaves an editor that never
loads and says nothing.

**Plan.** `Crud.actives(...)` collects every requirement of the pieces given, so
none is forgotten. The explicit pieces stay; this is what most pages call.

## 5. Sorting is written three times (resolved: `Sort`, `sortTerms`)

**Friction.** The example wrote `'title' | 'title-desc'` toggling in the Model,
in the view's `sort` input, and in the server's `orderBy`.

**Plan.** `Sort.make(['title', 'created'])` in `foldkit-crud`: the schema of the
state, `toggle`, and the map a drawn table takes. `foldkit-remote-drizzle` turns
the same state into order terms from a map of columns the server chose.

## 6. Two places typed ids stop short (resolved)

- `Data.get(selection, id)` takes any string, so an `AuthorId` reads a Post.
  **Plan.** For an Entity Selection, `id` is `IdOf` its Entity.
- `Crud.remover` needs `input: (id: PostId) => ({ id })` written out.
  **Plan.** `id: 'id'` names the input key; the type and the function follow.

## 7. Inputs repeat the Entity (resolved)

- `title: Blog.Post.fields.title.schema` for every reused field.
  **Plan.** `Entity.fields(Post, 'id', 'title')`, spread into the struct.
- `authorId: Relation.input(Post.relations.author)`.
  **Plan.** `authorId: 'author'` names the member. Nothing is inferred from the
  input key's own name, so it stays explicit; the long form stays too.

## 8. A form's options do not pipe (resolved)

**Friction.** Entities pipe (`derived`, `annotate`); `Form.make` takes one bag,
so a library cannot hand over a partly configured form.

**Plan.** Pipe steps that return a new form: `Form.inputs`, `Form.checks`,
`Form.messages`, `Form.nested`. The bag stays as the short form.

## 9. Smaller

- **Three bags of words** (`FormMessages`, the form view's labels, `ViewWords`).
  **Resolved, not as planned.** The first attempt, one object holding functions,
  crashed a placed form: Foldkit admits no function nested in `h.submodel`'s view
  inputs. Words are now text with blanks (`'{label} is required'`), the three
  shapes share no key, and one object `satisfies` all of them.
- **A relation is stored whole or as one window**, never both, in Remote.
  **Not done, and not a small fix.** "Key the stored value by its window" was
  the plan; reading the read path showed why it is not one change:
  - the wire carries one window per field per request, and a batch's answers are
    merged by entity and field name, so a whole list and a page of it collide
    before they reach the store;
  - a cursor page merges onto the stored page by field name, and live changes,
    optimistic patches, staleness, retention, persistence, and the inspector all
    address a relation by that one name.

  It is a protocol and store change to a published package, with pinned tests on
  each of those paths, and deserves its own design: answers that say which
  request they answer, a storage key of field plus base window, and a rule for
  what a write to the whole relation does to its pages (mark them stale). Until
  then the limit is documented where it bites: `foldkit-remote`'s README and
  `Entity.page`.
- **A picker that searches is a `select` under a search box**, not a combobox.
  Recorded, not planned: it is the accessible floor, and a combobox is a renderer
  an application can now add (item 1).
