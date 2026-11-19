---
title: Composition over copy and paste: Foldkit Plus 0.41
description: Why Foldkit Plus components need no code generation, how to do domain-driven design with it, and what else changed in 0.41.
date: 2026-11-18
author: Claude
tags: [release, mixins-ui, entity, guard, remote-domain, bundle-size]
---

# Composition over copy and paste: Foldkit Plus 0.41

A popular way to ship UI components today is to copy them. You run a
command, it writes `table.tsx` into your repository, and from then on the
table is yours. That is a fast start. A year later it is a file you maintain:
the library's fixes no longer reach your copy, each variation you needed (a
denser table, one whose rows highlight under the pointer, one with
checkboxes) is an edit to code you did not write, and two projects' copies
have drifted apart.

Foldkit Plus takes the other road. It is a set of open-source packages for
[Foldkit](https://foldkit.dev/), a TypeScript framework for web applications
in which the whole page's state lives in one object and changes only in
response to named events. One of those packages, `foldkit-mixins-ui`, holds
about ninety styled, accessible components: buttons, fields, menus, dialogs,
tables, charts. In release 0.41 you get each variation of a component by
calling the package with different arguments, and your page ships the code
for the arguments you pass and nothing more.

![Three table examples side by side: Basic, a four-row invoice table; Following highlight, the same table with the second row shaded; Configure once, three small tables stacked, one roomy, one dense and one in the style picked above.](/blog/2026-11-18-foldkit-plus-0-41/table-three-ways.png "Three of the Table examples on the components page: Basic, Following highlight and Configure once")

You do not need to know Foldkit to read this post: the examples are
functions that return HTML, or plain declarations.

The thread through the whole release is *write it once*. The first half of
this post is about the interface: a component's variations come from one
package you call, not from copies. The second half is about data: the
records an application keeps and the rules about them are described once,
and the database, the server, the forms and the page all read that one
description instead of each restating it. 0.41 is a large release (377
changelog entries), so a short tour of the rest follows.

**If you only read one thing:** building interfaces, read
[One table, three variations](#one-table-three-variations); modelling data,
read [Describe your records once](#describe-your-records-once); upgrading
from 0.40, read [Upgrading from 0.40](#upgrading-from-040).

In this post:

- [Why not copy, and why not a flag](#why-not-copy-and-why-not-a-flag)
- [One table, three variations](#one-table-three-variations)
- [What it saves: 27.8 kB off every breadcrumb page](#what-it-saves-278-kb-off-every-breadcrumb-page)
- [Part two: the data](#part-two-the-data)
- [Describe your records once](#describe-your-records-once)
- [Guard: who may read and change what](#guard-who-may-read-and-change-what)
- [A second authority: an event-sourced server](#a-second-authority-an-event-sourced-server)
- [Around the data: server reads, offline edits, forms](#around-the-data-server-reads-offline-edits-forms)
- [A tour of the rest of 0.41](#a-tour-of-the-rest-of-041)
- [Upgrading from 0.40](#upgrading-from-040)
- [A colour bug only Chrome 157 had](#a-colour-bug-only-chrome-157-had)
- [See it, try it](#see-it-try-it)

## Why not copy, and why not a flag

Copying is honest about one thing: a component library cannot foresee every
variation, so it hands you the source. The price is that you now own it, and
everything the library learns afterwards (an accessibility fix, a browser
bug) stops at your copy.

The usual alternative is options: `<Table striped hoverHighlight
selectable>`. You keep receiving fixes, but you meet two other limits. The
variation you need is not an option, and you wait or you fork. And a flag
such as `hoverHighlight: true` means the highlight's code has to be in the
bundle whether or not a page sets it, because the library cannot know in
advance which pages will.

We wanted the fixes of options without either limit. So in 0.41 an argument
to a component is one of three things:

- **plain data**, such as a caption, the rows, or the text of a button;
- **a look**, written as data with named choices, which you can extend from
  outside with a choice the package does not have;
- **a feature you import and pass**, such as the table's hover highlight.
  A page that never imports it never ships it.

| | Copied source | An option that is a flag | A value you pass |
| --- | --- | --- | --- |
| Gets the library's fixes | No, you merge them by hand | Yes | Yes |
| A variation the library lacks | Edit your copy | Wait, or fork | Add it from outside |
| Code on a page that does not use a feature | Only what you copied | Shipped anyway | None |

Copying is still the right tool when you want something structurally unlike
any of our components. For that we ship the building blocks the components
are made from (keyboard navigation, focus handling, drag and drop), so you
can assemble your own without starting from nothing.

## One table, three variations

Here is a whole table. A few names need a word first. `Table.view` draws the
table from the arguments it is given. `h` is Foldkit's HTML builder, passed
to every function that draws (`HtmlBuilder` is its type). `Recipes.Table` is
the table's shipped look, written as data with named choices; the package
calls such a look a *recipe*, and `rows: 'striped'` is one choice on it.
`Style.forSlots(TableSlots)` turns that look into CSS classes for the table's
named parts, which the package calls *slots* (the table, its rows, its
cells); `TableSlots` is the list of those names.

```ts standalone
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'

const invoices = [
  { id: 'INV-001', status: 'Paid', amount: '$250.00' },
  { id: 'INV-002', status: 'Pending', amount: '$150.00' },
]

const Striped = Style.forSlots(TableSlots)(Recipes.Table({ rows: 'striped' }))

export const invoiceTable = (h: HtmlBuilder<never>) =>
  Table.view(
    {
      caption: 'Recent invoices',
      columns: [
        { header: 'Invoice', rowHeader: true, value: row => row.id },
        { header: 'Amount', numeric: true, value: row => row.amount },
      ],
      rows: invoices,
      style: Striped,
    },
    h,
  )
```

Most of those lines are your data: the rows and which column shows what. The
library's part is the two lines that pick a look; since 0.42, released the
day after this one, `Recipes.Table.style({ rows: 'striped' })` does it in one
call. The markup is a real `<table>` with a `<caption>`; `numeric` aligns a
column of figures, and `rowHeader` makes the invoice number the row's
`<th scope="row">`, which is what a screen reader names a row by.

**A look the package does not have.** Say your tables need a heavy rule under
each row. You do not fork the recipe; you give it one more choice with `add`,
and every choice it already had still works. `Style.self` wraps ordinary CSS
declarations, written as an object, as a piece of a look:

```ts
const Tables = Recipes.Table.add({
  rows: { ruled: { row: Style.self({ borderBlockEnd: '2px solid rebeccapurple' }) } },
})
const Ruled = Style.forSlots(TableSlots)(Tables({ rows: 'ruled', density: 'compact' }))
```

`add` refuses a choice the recipe already has, both as a type error and when
the module loads, so it cannot quietly replace a shipped look; changing one is
`.extend`'s job.

**A feature you pass.** The hover highlight is one soft shape behind the
rows that glides to the row under the pointer. It is a value, `Table.fluid`,
in a file of its own:

```ts
export const highlightedTable = (h: HtmlBuilder<never>) =>
  Table.view(
    {
      columns: [{ header: 'Invoice', rowHeader: true, value: row => row.id }],
      rows: invoices,
      style: Ruled,
      fluid: Table.fluid,
    },
    h,
  )
```

A page that never writes `Table.fluid` never downloads the highlight's code.

![An invoice table with four rows. The second row, INV-002, Pending, $150.00, has a rounded grey highlight behind it where the pointer is.](/blog/2026-11-18-foldkit-plus-0-41/table-highlight.png "The Following highlight example, the pointer over the second row")

**The same table, configured once.** An application usually wants every
table to look alike. `Table.configure` takes the arguments that never change
and gives back a `view` that needs only what differs:

```ts
const AppTable = Table.configure({ base: { style: Striped, fluid: Table.fluid } })

export const ordersTable = (h: HtmlBuilder<never>) =>
  AppTable.view({ columns: [{ header: 'Order', value: row => row.id }], rows: invoices }, h)
```

It can also hold named presets (`presets: { dense: { … } }`, then
`preset: 'dense'` at a call), and a misspelt preset name is a type error.
About fifty components have a `configure`. Each of these examples, written out
as a whole module, is on the
[table's page](https://foldkit-plus.pages.dev/components/table); the code
shown there is the code that draws it.

**Components that remember something.** A listbox has to remember whether it
is open and which row the arrow keys are on. In 0.40 you wired that memory
into your application's state by hand. In 0.41 about forty such components
come with it packaged, as a *Bundle*: you name the field of your state it
lives in, and the package writes the wiring. Writing it by hand still works
and adds nothing to the page; the first Bundle costs about 6 kB (compressed
with brotli), shared by every later one. The
[README shows both ways](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/README.md#state-fold-it-by-hand-or-place-a-bundle),
and the [Listbox page](https://foldkit-plus.pages.dev/components/listbox)
runs it.

## What it saves: 27.8 kB off every breadcrumb page

A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, compressed.
That comes from the flag rule above. In 0.40 a breadcrumb could fold its middle steps into a menu, so the breadcrumb
imported our Menu component for every trail, folded or not. In 0.41 the fold
is a value you pass (`max` is how many steps stay visible):

```diff
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
```

A minified page of just a trail is now 68.4 kB of JavaScript compressed with
brotli; the same page with the menu passed is 96.2 kB. Every trail page used
to carry that difference. Table's highlight and checkboxes, each chart kind,
the avatar's image-service support, the card group's highlight and the image
cropper's zoom slider went the same way.

The second change is to freeze styles. A recipe is code holding every choice
it offers, and a bundler cannot tell which choices you picked. The build
plugin of `foldkit-mixins`, our styling package, can run your style modules
at build time and ship only the class names they produced
([how](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins/README.md#style-modules-shipped-as-data)).
On a page that draws one styled button, that took the JavaScript from
114.1 kB to 91.8 kB. Our design-system example, which draws most of the
catalogue, went from 220.7 kB to 184.2 kB. The new component APIs in this
post are all built so they can be frozen.

We also measured an idea that did not pay: splitting each recipe into a file
per choice. Narrowing the button's recipe by hand to the one look the page
used saved 136 bytes, so we kept recipes whole.

The breadcrumb figure is held by
[a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts)
that fails if the menu reaches a plain trail page again, and the
design-system figure by its
[size budget](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts).
The one-button figure was measured once, with Vite 8 on 2026-11-17, and no
test holds it.

## Part two: the data

Software copies itself in a second place, and it hurts more there. Take one
rule: "a product never has more stock reserved than it holds." In a typical
web application it is written four times. It is a constraint or a `WHERE`
clause in the database. It is a check in the server's request handler. It is
validation in the form. And it is the condition that greys out the Reserve
button. Four people write those at four different times, and one day the
button lets you try what the server refuses, or the form refuses what the
database would have taken.

The rest of this half is about writing that rule once. Foldkit Plus lets you
describe your records and the rules about them one time, as plain data in a
module that imports no database and no network client, and every party
reads that one description: the database adapter, the server, the form and
the page. If you know the term, this is domain-driven design: the business's
records and rules come first, and storage and screens follow from them. Much
of it has been in Foldkit Plus for several releases, and the sections say
where. What 0.41 adds is named states, a checker that judges every write
before it runs, a guide that teaches the whole language in one place, safer
permissions, and a second kind of server.

## Describe your records once

### Records, and how they point at each other

The description starts with the records. `foldkit-entity`, our package for
describing an application's records, calls the description of one kind of
record an *Entity*: its fields and its relations to other records. Each
field's type is a *Schema* from Effect, the TypeScript library Foldkit is
built on; a Schema describes a value's shape and checks a value against it.

```ts standalone
import { Schema } from 'effect'
import { Derived, Entity, Expr, Laws, Query, Relation, evaluate } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

// One kind of record and its fields, much like a table definition.
const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)
const ReviewFields = Entity.define('Review', Schema.Struct({ id: Schema.String, stars: Schema.Number }))

// How records point at each other: a review belongs to one product.
const Catalog = Entity.relate(
  { Product: ProductFields, Review: ReviewFields },
  { Review: { product: Relation.one(ProductFields) } },
)
```

A relation says "a review belongs to one product", not "there is a
`product_id` column". How it is stored is the server's business, decided
later, in one place.

### One condition, three readers

Rules and questions are written as *expressions*: a condition such as "stock
is greater than zero", built with `Expr` and kept as a value instead of code
that runs. A *query* built from them says which records a list holds. Because
both are values, different parties can answer the same one:

```ts
// "Products in stock", as a value. Expr.gt is "greater than"; building it runs nothing.
const InStock = Query.from(Catalog.Product).pipe(Query.where(Expr.gt(Catalog.Product.fields.stock, 0)))

// evaluate answers it over rows you hand it.
evaluate(InStock, {}, [
  { id: 'a', ownerId: 'ada', name: 'Lamp', status: 'draft', stock: 2, reserved: 0 },
  { id: 'b', ownerId: 'ada', name: 'Desk', status: 'published', stock: 0, reserved: 0 },
]) // [{ id: 'a', … }]
```

`evaluate` is the reference reader: a pure function over rows you give it.
On the server, `foldkit-remote-drizzle`, our adapter for the Drizzle SQL
toolkit, compiles the same `InStock` value into the `WHERE` clause of a
query for SQLite, Cloudflare D1 or Postgres. And the page, which already
holds some rows, judges them by it to place a new row in a list before the
server has answered.

The interesting part is what a reader does when it cannot decide. The
example project `examples/entity` asks the same questions of all three
readers and prints what each said. Here is one, trimmed, exactly as its test
expects it:

```text
ByAuthorName: posts by an author's name
  FROM Post
  WHERE contains(Post.author.name, $name)
  ORDER BY Post.title ASC
  SQLite: p2, p1
  evaluate, every post: refused, it does not run path
  Judge, every row held: p2, p1
  Judge, a page holding Ada and one comment: p1 in, p2 in, p3 unknown (Author a2 is not held), p4 unknown (Author a3 is not held)
```

The condition reads another record, the post's author. SQL answers it with a
subquery. `evaluate`, which is handed one table's rows, refuses and says why,
rather than answer wrongly. `Judge`, the reader a page uses, answers for the
posts whose author it holds and says *unknown*, with the reason, for the
rest; the page then leaves that list for the server to answer instead of
guessing. A shared suite of test cases (`foldkit-entity/conformance`) holds
every reader to one answer, with mixed case, nulls, accents and `%` signs in
the data on purpose. The
[test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/entity/test/language.test.ts)
pins the whole trace.

New in 0.41 is a guide that teaches this as one language, from values and
nulls to related records and what a page can know:
[Expressions](https://foldkit-plus.pages.dev/entity/guides/expressions).

### What is always true: derived values and invariants

Two declarations keep a record honest. A *derived value* is one that other
records decide, such as a product's number of reviews: it is declared, not
stored, so it cannot drift from what it counts. An *invariant* is a rule
every stored record must keep, whoever writes it.

```ts
const Product = Catalog.Product.pipe(
  // Not stored: every reader counts the reviews, so it cannot disagree with them.
  Entity.derived({ reviewCount: Derived.count(Catalog.Review.relations.product) }),
  // What every stored product must hold.
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

// The reference reader of an invariant: Valid, Invalid or Undecided, for a record you hand it.
Entity.judge(Product, {
  after: { id: 'p1', ownerId: 'ada', name: 'Lamp', status: 'draft', stock: 3, reserved: 5 },
})._tag // 'Invalid'
```

That one declaration is read four ways. The server's writer compiles it into
the statement that saves a product. `checkConstraints`, in the Drizzle
adapter, turns it into SQL `CHECK` constraints for the table. A form shows
its `message` beside the field `path` names before anything is sent. And the
page checks a write against it before sending. In 0.41 an invariant belongs
to the Entity itself, so every handle on the Entity judges it; before, a
handle taken before the invariant was added could store a record that broke
it.

### States, and the writes between them

A record usually moves through states: a product is a draft, then
published. New in 0.41, a state is named once, on the Entity, with
`Entity.refine`. A *declared write* is a change the server accepts, described
as data instead of as a request handler, so that the page and the server read
the same description. `foldkit-remote`, our package for server data,
declares one with `Mutation`, and a write can say which state it starts from
and which it leaves:

```ts
// Two named states of a product.
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

// Two writes. The input of each is the product's id and the fields under `set`.
const Publish = Mutation.update('Publish', Product, {
  set: { status: Schema.Literal('published') },
  from: Draft,
  becomes: Published,
})
const Reserve = Mutation.update('Reserve', Product, { set: { reserved: Schema.Number } })
```

`Mutation.update` declares a write in one call since 0.42, the release after
this one. In 0.41 the same write is three nested calls,
`Mutation.write(Write.update(Entity.input(…)))`, which
[the domain guide](https://foldkit-plus.pages.dev/entity/guides/domain) shows
written out.

Because the write is data, three things follow with no handler to write.
The server's writer turns `Publish` into one `UPDATE … WHERE` that holds the
product's id, the starting state and every invariant over the record it
would leave, so a product that is not a draft is refused as `Unmet` and one
that would break the stock rule as `Invalid`. `becomes: Published` is checked
where the write is declared, by trying every record it could start from; a
claim that cannot be checked that way (one about numbers) becomes a
condition the writer checks when it saves. And the page shows the write's
result while the request is out, then replaces it with the server's answer.

### Checking every write before it runs

Declaring rules does not prove the writes keep them. `Laws.check`, new in
0.41, reads only the declarations, needs no database, and reports for each
write and each invariant whether the write can break it, and what the writes
do to the states:

```ts
export const report = Laws.show(Laws.check({ writes: [Publish, Reserve] }))
```

```text
Product
  Draft -> Published   Publish   holds
  Draft                          unreached
  Published                      terminal

Publish   x reservedWithinStock   kept: writes no member it reads
Reserve   x reservedWithinStock   undecided: reserved is set to any value its input holds
```

Read it top to bottom. `Publish` takes every draft to published. Nothing
creates a draft, so `Draft` is *unreached*, and nothing leaves `Published`,
so it is *terminal*: findings to read, not failures. `Publish` cannot break
the stock rule, because it writes nothing the rule reads. `Reserve` can: it
sets `reserved` to whatever it is given, so the report says *undecided*
instead of calling it safe, and the writer must refuse a bad value when it
saves. The same report, for the domain guide's example, is pinned by
[a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/writes/test/domainGuide.test.ts);
keep yours beside your code, as `examples/writes` keeps its `LAWS.md`, and a
new write shows up as a difference to read in review.

`npx foldkit-plus laws <module>` prints the same report for a module of
yours from a terminal. Two testing tools in `foldkit-remote/testing`, both
new, go further:

- **`Scenario`** writes a test case as data: the records that exist, who
  asks, the time, the write, and what must come of it (accepted, or refused
  for a named reason). It runs the case through each backend you give it and
  reports every mismatch by backend and step. Given a `Laws.check` report, it
  refuses to run a scenario that expects what the report already disproved.
- **`Walk.run`** sends seeded random sequences of events through an
  application and checks a rule after every step. It requires a generator
  for every kind of event, so a new kind cannot be forgotten.

What is new, and what was already there:

| | First shipped |
| --- | --- |
| Entities, relations and derived values | 0.7.0 |
| Expressions in queries, compiled to SQL | 0.8.0 |
| Declared writes, and permission rules (Guard, below) | 0.17.0 |
| Invariants | 0.33.0 |
| Conditions over related records, the asking user and the time; the page's `Judge`; counted derived values | 0.36.0 |
| Named states and checked transitions, `Laws.check` and its command, `Scenario`, `Walk`, `Data.can`, the Expressions guide | 0.41.0 |

The [domain guide](https://foldkit-plus.pages.dev/entity/guides/domain)
follows one small domain from these declarations to the server and the page,
and the [Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) is
the map from a kind of rule to the declaration that holds it.

## Guard: who may read and change what

Permissions in most applications are a handful of checks, one wherever a
record is read or written, each with its own idea of who is asking. Miss one
and you have a hole; make two disagree and the page offers what the server
refuses. `foldkit-guard`, our permissions package, declares who may do what
once, in the same shared module, in the same expressions, and enforces it on
every path the server reads or writes by.

It does not sign anyone in. Who is asking comes from your authentication;
`foldkit-auth`, our package that turns a Yielded Auth sign-in session into the
person a server answers as, is one way to provide it. Guard decides what that
person may do.

A permission rule comes in two kinds. A rule about the person alone ("is an
admin") is declared by name, and its body is given only on the server, so it
never ships to the browser. A rule about the person and the record ("is the
owner") is an expression, so SQL and the page can both read it:

```ts
import { Guards, May } from 'foldkit-guard'

// Who is asking, as the server knows them.
const User = Schema.Struct({ id: Schema.String })

const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    // An expression over the record, with the person's fields as inputs.
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

// Only the owner may read or change a product. `Guards.may` asks the server to
// send, with each row, what its reader may do with it.
const Owned = Product.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
  Guards.may,
)
```

**On the server**, every path that reads or writes a product runs these
rules. The Drizzle adapter compiles a Read rule into every query of the
table, so a reader never receives a row they may not see: not by id, not in a
list, not as the target of a relation, not in a count. A row they may not
read answers exactly as a missing one does, so its existence does not leak,
and a field with a Read rule of its own is left out, or replaced by a value
you choose. Every write is checked again in the statement that saves it. The
server side is two calls:

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

// The server's half: a body for each rule about the person alone (there are none here).
const Policy = Shop.implement({})

// The Read rules as conditions the Drizzle binding adds to every query of its table.
export const visible = GuardDrizzle.visible(Policy, [Owned])
```

**On the page**, the same rule decides which controls to show. `row` below is
a product the page read with `may` selected:

<!-- docs-check
import type { Selected } from 'foldkit-entity'
declare const row: Selected<typeof Card>
-->
```ts
const Card = Entity.select(Owned, { name: true, may: true })

// Show Edit when the server said this reader may update the row.
export const showEdit = May.can(row.may, 'Update')
```

That is a hint, never the check: a button shown by mistake still meets the
server's refusal. For a product the page has just created and the server has
not answered yet, `foldkit-remote` works out `may` from the same rules where
it can, and leaves it unknown where only the server could say (an admin's
rule, whose body the page does not have). `Data.can(model, Publish, input)`,
new in 0.41, goes further: from what the page holds, it says whether a write
would be refused, with the server's reason, or that it cannot tell yet
because the page lacks a record or a field.

**What 0.41 changed.** Some rules cannot be decided from one record: "may
edit if you belong to the project this note is in" reads another record.
Before 0.41 the page read that undecided answer as a no, so an editor could
lock a field the server would have let you change. Now `May.answer` returns
yes, no or none, `May.refused` is true only for a definite no, and a form
stays editable until the server says otherwise. On the server side, 0.41
closes two gaps:

- Rules travel on the handle `Guards.attach` returns. Every place that
  enforces them now refuses, when it is set up, another handle on the same
  Entity that carries no rules; before, it served that handle unguarded, and
  with `unguarded: 'allow'` anyone could write through it.
- A server that keeps rows in memory, and the check of a single write,
  judge one record at a time, so they now refuse at set-up a rule that reads
  other records, instead of failing every request later.

Guard itself first shipped in 0.17.0, with the page's `may`. To see it, open
[Chirp](https://foldkit-chirp-demo.pages.dev/), a small Twitter-like demo
whose server runs in your browser: switch person, and Edit and Delete appear
only on the posts the rules let that person change. The
[Guard reference](https://foldkit-plus.pages.dev/guard) covers every seam,
and [Auth and Guard](https://foldkit-plus.pages.dev/auth/guides/versus-guard)
follows a sign-in through to a guarded row.

## A second authority: an event-sourced server

Everything so far assumed the server keeps rows in a SQL database, as most
applications do. Some teams keep their facts another way. In an
*event-sourced* system the server does not update a row in place: it records
each thing that happened as an event, and the rows a reader sees are built by
folding those events together. The history is the record.

`foldkit-remote-domain`, first published in 0.41 at 0.1.0 and marked
experimental, puts such a server behind `foldkit-remote`. The server it
supports is built with Alchemy Domain (`@alchemy.run/domain`), which
describes itself as "a domain-driven design framework for Effect, part of
Alchemy". Its README puts the core in one line: *commands* ask for a change,
the *aggregate* decides it, and *events* record what happened. A *view* folds
events into the rows a reader sees, and an *Api* lists what clients may send
and read.

Why put it behind Foldkit Plus? Because the page does not need to change.
It keeps the same declared queries and writes, the same predictions while a
write is out, and the same refusals; only the authority that answers is
different. That is what we mean by a second authority: the Domain model
decides each command and who may read each row, Remote keeps the page's
copy, and the adapter between them translates and owns nothing.

Here is the page's side of one binding. The Domain side, written with
Alchemy's own classes, defines a `Note` aggregate with a `Rename` command, a
`NoteRow` view and a `NotesApi`; its full text is in the
[package's page](https://foldkit-plus.pages.dev/remote/guides/remote-domain).

<!-- docs-check standalone
import * as Domain from '@alchemy.run/domain'
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'

class Renamed extends Domain.Event('Renamed', { name: Schema.String, revision: Schema.Int }) {}
class Rename extends Domain.Command('Rename', {
  target: Schema.String,
  input: { name: Schema.String },
  events: [Renamed],
}) {}
class Note extends Domain.Aggregate('Note', {
  id: Schema.String,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  commands: [Rename],
  decide: {
    Rename: (state, command) => [new Renamed({ name: command.name, revision: state.revision + 1 })],
  },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}
class NoteRow extends Domain.View('NoteRow', {
  from: [Note],
  key: Note,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}
class Notes extends Domain.Model('Notes', { aggregates: [Note], views: [NoteRow] }) {}
class NotesApi extends Domain.Api('NotesApi', {
  model: Notes,
  commands: ['Rename'],
  views: ['NoteRow'],
}) {}
-->
```ts
// The record the page reads, and a write it sends (here, one with no declared effect).
const NoteEntity = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)
const RenameNote = Mutation.make('RenameNote', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})

// Read Note records from the NoteRow view, ordered by its revision field.
const NoteReads = DomainRemote.view(NoteEntity, NotesApi, 'NoteRow', { revision: 'revision' })

// Send RenameNote as the Rename command; `written` is what the write set, for
// when the view has not caught up yet.
const RenameBinding = DomainRemote.command(RenameNote, NotesApi, 'Rename', {
  entity: NoteEntity,
  target: input => input.id,
  input: input => ({ name: input.name }),
  written: (_reply, input) => ({ name: input.name }),
})

// The one call that does anything: a server client for Remote, over the Api.
export const client = DomainRemote.layer(NotesApi, {
  views: [NoteReads],
  commands: [RenameBinding],
  principal: Effect.succeed(Option.some('ada')),
  denied: () => 'Unauthenticated',
})
```

The two bindings are declarations and do no I/O; they check, when they are
made, that the view holds every field the Entity declares and that names
match the Api's own. `DomainRemote.layer` is what the page's Remote reads
and writes through.

**The problem 0.41 had to solve.** A view is updated after the command
commits, so a read made straight after your own write can come back from
before it, and the page would show your edit and then take it away. So every
row now carries a *revision*, a number every event of its stream moves, and
a write answers with a *read-after token*, the command's receipt; Remote
ignores any copy of a row older than the one it holds, and reads again at
the token until the view has caught up. Both are part of Remote's wire for
every server in 0.41, not only this one.

A command meets a declared write in one of three ways. `Lower.write` turns a
declared write into the aggregate's own decision, so the rules are stated
once. `DomainRemote.command`, as above, binds a command you wrote yourself.
`Imported.mutation` sends a command nobody declared a write for, which the
page then cannot predict. `Fixture.make` hosts a model in memory for tests,
and `pageReader` reads it during a server render.

**Its limits today**, from its README:

- It pins Alchemy Domain and `alchemy` at exactly `2.0.0-beta.86`, and breaks
  when Domain's behaviour does; a behaviour test fails when a release changes
  what the adapter relies on.
- Lists are a paged Domain query, read forward; relations are `one`
  relations only, and a live read with relations is refused.
- It has run on Domain's in-memory host and over a local HTTP server only:
  no deploy, no Durable Object hosting, no WebSocket protocol.

`examples/writes-domain` runs one write scenario through three backends
(SQLite, a server in memory and a Domain model) and expects the same outcome
from each. Start with the guide
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains),
which follows one reservation all the way round.

## Around the data: server reads, offline edits, forms

The sections above lean on a few neighbours. Each changed in 0.41 in ways
worth knowing.

**`foldkit-remote`, server data in the page.** A page reads a query because
a screen shows it, not because code remembered to fetch. A write is shown at
once: the value on screen is the stored row plus the pending write, worked out
when it is read and dropped when the server answers, so there is nothing to
undo when the server says no. New in 0.41 beside revisions: `RemoteData.all`
joins several reads into one value with one loading state, `reaches(write,
query)` says which lists a write can change, and the page's state now
encodes as JSON, so Foldkit's development reload no longer throws on it
([Remote](https://foldkit-plus.pages.dev/remote)).

**Failures that say less.** A server used to send the browser the message of
whatever failed on its side, a database error or the name of a hidden field
included. In 0.41 the caller reads "Internal error" and an incident id, the
cause goes to the server's diagnostics under the same id, and
`RemoteData.incident` gives a page the id to show. Words meant for the user
are said on purpose, with `RemoteServer.tell`; `RemoteServer.report` logs a
failure no request is waiting on, such as a scheduled job's, the same way.

**`foldkit-sync`, offline edits that agree across devices.** Sync keeps each
edit on the device until the server's ordered log has it, and replays edits
so every device agrees. New in 0.41, a shared document takes *laws*, rules
the server's log judges after every operation and refuses as invalid; the
device judges them first as a hint. A handler's words for a device are
thrown as `ExchangeRefused`, and anything else reads as a failure with an
incident id. To see it, open the [registry demo](https://foldkit-registry-demo.pages.dev/):
two devices over one product table; press *Go offline* in one, edit a few
cells, and press *Go online* to watch them arrive in the other
([Sync](https://foldkit-plus.pages.dev/sync)).

**`foldkit-form` and `foldkit-crud`.** A form is built from a write's input,
so its fields and their checks come from the declaration; in 0.41 it also
judges the Entity's invariants over the record it edits, and shows a broken
one beside the field it names. `foldkit-crud` assembles list, detail and edit
screens from a form, a Remote write and the Entity; its editor now leaves a
field editable where the permission answer was undecided, and a list reads
live updates only when you pass Remote's live read
([Form](https://foldkit-plus.pages.dev/form),
[Crud](https://foldkit-plus.pages.dev/crud)).

## A tour of the rest of 0.41

### Building blocks for keys, focus and drags

`foldkit-primitives` holds the building blocks the components are made from,
each usable on its own. New in 0.41: `InlineEdit` (a value edited in place,
started by Enter, F2, a double click or typing), `SpatialNavigation` (arrow
keys move to the nearest item on a board or a canvas), `Reorder` (moving an
item in a list or tree with the keyboard, beside the mouse), `SwipeActions`
(actions behind a row, with a keyboard way in) and `FocusRecovery` (where
focus goes when the focused element disappears). Drag and drop gains
scrolling at the edges, a lasso on empty space and drops between items. The
site's new [Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery)
shows each one, several running live.

![The top of the Primitives gallery: its heading, a search box, the Media family with three primitives listed (MediaQuery, Breakpoints, platformFromUA) and, below them, the live PrefersDark example reading that the system asks for a light colour scheme.](/blog/2026-11-18-foldkit-plus-0-41/primitives-gallery.png "The Primitives gallery: the Media family and its live PrefersDark example")

### Two new components: FileUpload and CodeBlock

**FileUpload** is a field of files with a status each. Drop, pick and paste
all arrive the same way, a refused file says why, files upload a few at a
time with previews, and a failed one can be retried. Reach for it for a
profile picture or a batch of attachments
([page](https://foldkit-plus.pages.dev/components/file-upload)).

![Two FileUpload examples. In the first, contract.pdf shows Uploaded and photo.png is part way through with a blue progress bar. In the second, scan.tiff is refused with the message that it is over 5.0 MB while invoice.pdf is kept in the list.](/blog/2026-11-18-foldkit-plus-0-41/file-upload-states.png "Two FileUpload examples: one file sent and the next uploading, and a file over the size limit refused")

**CodeBlock** can now mark whole lines as added, removed or highlighted,
fold a long block behind an "expand" button, and make each line number a
button, which is what a code review or a tutorial wants
([page](https://foldkit-plus.pages.dev/components/code-block)).

![Two CodeBlock examples. In the first, a diff in profile.ts: one removed line shaded red and two added lines shaded green. In the second, items.ts shows four numbered lines fading out above a "Show all 14 lines" button.](/blog/2026-11-18-foldkit-plus-0-41/code-block-diff-collapsed.png "CodeBlock marking added and removed lines, and folding a long block behind a button")

### The page builder, rich text and the data grid

The drag-and-drop page builder shows what you are carrying, gives the
selected block a handle big enough for a finger, and drops between blocks
instead of at the page's end
([page](https://foldkit-plus.pages.dev/composition/guides/mixins-builder)).
The rich text editor gains a standard formatting toolbar that tucks the tools
it has no room for into a "More" menu on a phone, and can keep Markdown text
in a form field while you edit formatted text
([page](https://foldkit-plus.pages.dev/richtext)). The data grid copies a
selection as an HTML table beside the plain text, so it pastes into a
document as a table, and can scroll to a row for a "go to row" control
([page](https://foldkit-plus.pages.dev/data-grid)).

### Selected text in your theme's colour

When you select text, the highlight now takes your theme's accent colour, in
light and dark schemes, instead of the browser's default. The default theme
also now casts soft shadows and rounds corners a little more. Both are
settings you can turn back.

Everything else, entry by entry, is in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

## Upgrading from 0.40

Most of the breaking changes are renames, and a rename is a type error where
you used the old name, so the TypeScript compiler gives you the list.
[Upgrading to 0.41](../upgrading-0.41.md)
covers every package, with a before and after for each change. Four changes
compile either way, so check them by eye:

1. **The default theme** casts shadows, rounds corners more and deepens the
   accent; the guide has the five settings that bring 0.40's look back.
2. **A card group** draws its pointer highlight only when you pass
   `fluid: Card.fluid`.
3. **An image cropper** draws its zoom slider only when you pass
   `zoom: ImageCropper.zoomSlider()`.
4. **A color picker's eyedropper** is off unless you pass `eyedropper`.

On the data side the compiler catches most of it too, with three changes to
read in the guide: a write's condition may no longer read who is asking or
the time (that is a permission rule's job), a list ordered by text needs its
collation declared, and a server's own failures now reach the caller as an
incident id rather than their message.

## A colour bug only Chrome 157 had

The day before the release, selected rows in our demos turned pink, in
Chrome and Edge 157 only. OKLCH and OKLab are two CSS colour spaces; OKLCH
describes a colour by its lightness, chroma (how colourful it is) and hue.
Our theme derives pale tints of the accent colour with CSS relative colour
syntax, `oklch(from <mix> l c h)`, which reads those three values from a
mixed colour and writes them back. Chrome 157 reads no hue from
a colour with very little chroma unless it was written in OKLCH, and our pale
blue tint had a chroma of 0.017: its hue came back as 0, a pinkish red.

The fix writes the tint in OKLab instead, scaling its two colour axes (`a`
and `b`) together, so there is no hue to lose. Firefox, WebKit and earlier
Chromium paint it exactly as before. If you derive tints with relative colour
syntax, look at them in Chrome 157.

## See it, try it

See it first:

- [The table's page](https://foldkit-plus.pages.dev/components/table), and
  the [component pages](https://foldkit-plus.pages.dev/components) for the
  other ninety.
- [The widgets demo](https://foldkit-widgets-demo.pages.dev/), a small
  application that uses many of them together.
- [Chirp](https://foldkit-chirp-demo.pages.dev/), for a described domain,
  declared writes and permissions in one small application.
- [The registry demo](https://foldkit-registry-demo.pages.dev/), for offline
  edits across two devices.
- [The Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery),
  for the building blocks.

![The widget showcase in a dark scheme: a Toolbar with Bold, Italic, Strikethrough and Link, a Mute toggle, a left, center and right toggle group, an accordion with Billing, Team and API keys, and a Delete project button.](/blog/2026-11-18-foldkit-plus-0-41/widgets-dark.png "The widget demo in a dark scheme")

Then try it. Install the widget package and the packages it builds on:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

and draw the table from [One table, three variations](#one-table-three-variations).
[The widget package's guide](https://foldkit-plus.pages.dev/mixins/guides/mixins-ui)
starts from a single button, and
[One domain declaration](https://foldkit-plus.pages.dev/entity/guides/domain)
starts the data side from one record.

Next we are giving dialogs and popovers the same one-call drawing the table
has, since a dialog example is still fifty lines today.
