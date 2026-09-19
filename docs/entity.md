# One domain declaration

A blog has Posts, Authors, and Comments. In a Foldkit Plus application that fact
tends to get written down several times: once as the entities the Remote client
caches, once as the tables the server reads, once as the fields a form edits,
once as the columns an admin table shows. Each copy can drift from the others.

`foldkit-entity` is the one place to say it. Everything else interprets that
declaration and adds only what it alone knows.

## Who owns what

| Fact | Owner |
| --- | --- |
| A Post has a title, one Author, many Comments, a comment count | `foldkit-entity` |
| Whether a title is valid | the Effect `Schema` of that field |
| Relations arrive as refs; the store follows them | `foldkit-remote` |
| `author` is the `author_id` column; `title` is stored as `headline` | `foldkit-remote-drizzle` (`bind`) |
| What editing a post may change | the operation's input struct, not the Entity |
| What the user is typing, and whether it is valid yet | `foldkit-form`, in the parent's Model |
| Which elements draw a form | `foldkit-mixins-form` |
| Which id is open, which save is in flight | `foldkit-crud`, reading Remote |

An Entity implies nothing about operations. There is no generated CRUD: a list
exists because someone declared a query, an editor because someone declared a
form and a mutation. A relation existing is not a licence to read a table.

## The shape of it

```text
                        domain module
     Entity.define · Entity.relate · Entity.select · input structs
              (imports neither Remote nor Drizzle)
                 |                              |
                 v                              v
   client                                   server
   Remote.make({ entities })                bind(entities, { tables })
   Data.get(Selection, id)                  source(binding) · query(...)
   Form.make(Entity.input(...))             RemoteServer.mutation(...)
   Crud.editor · Crud.list
```

Three rules keep the copies from coming back:

- **Relations are declared in one step**, with `Entity.relate`, over Entities that
  already exist. Entities point at each other, and TypeScript cannot infer two
  constants that are each typed in terms of the other.
- **A Selection carries its schema and fetches nothing.** Remote compiles it into
  the requirement graph it plans from; a test can decode against it directly.
- **An operation's input is read against the Entity, not derived from it.**
  `Entity.input` says what each key of the struct means (`authorId` is the
  `author` relation). From that reading follow the form's controls, what an edit
  screen loads (`Entity.selectFor`), and how a loaded value fills the form
  (`Entity.valuesFor`).

## Where to start

1. Read the [`foldkit-entity` README](../packages/entity/README.md): declare,
   relate, select.
2. Run [`examples/entity`](../examples/entity). It reads one declaration from the
   client through the server into SQLite, then lists, edits, and saves through a
   form, as a trace and in a browser.
3. Then the interpreter you need:
   [Remote](../packages/remote/README.md#entities-declared-with-foldkit-entity),
   [Drizzle `bind`](../packages/remote-drizzle/README.md#binding-a-foldkit-entity-domain),
   [`foldkit-form`](../packages/form/README.md),
   [`foldkit-mixins-form`](../packages/mixins-form/README.md),
   [`foldkit-crud`](../packages/crud/README.md).

## When not to use it

A Remote application with two entities and no forms is simpler with Remote's own
`Entity.make` and `Entity.ref`, which still work and can share a domain with
Entities declared here. Reach for `foldkit-entity` when the same domain is about
to be written down a second time.

The design, and the order it was built in, is in
[entity-DESIGN.md](./design/entity-DESIGN.md).
