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

## What this release is about

Copying source and restating rules have the same root. When a fact lives in
several places (a component's markup in every project that copied it, a rule
about a record in the database, the server, the form and the button), nobody
can check that the copies agree, so they drift. 0.41 is the release where
Foldkit Plus says each such fact once and then checks it: before it ships,
before it runs, or in a test that fails when it stops being true.

- A page carries only the code for the features it names, and build tests
  fail if an unused one creeps back in.
- A component you build yourself declares what its keyboard, focus and
  accessibility owe, and the assembly refuses one that leaves a duty unmet.
- A write that claims to take a draft to published is checked where it is
  declared, and a checker reports every write that could break a rule,
  without a database.
- A permission the page cannot decide reads as "unknown", not "no", and a
  server's own failure reaches the browser as an incident id, never as its
  message.

Most of those checks found real problems on the way in, and this post tells
those stories. It has three parts, in the order the description promises:
components without generated or copied code, domain-driven design with
Foldkit Plus, and what else changed.

**If you only read one thing:** building interfaces, read
[One table, three variations](#one-table-three-variations) and
[Build your own component from the same parts](#build-your-own-component-from-the-same-parts);
modelling data, read [Describe your records once](#describe-your-records-once);
upgrading from 0.40, read [Upgrading from 0.40](#upgrading-from-040).

## Part one: components without generated or copied code

The first part is about the interface: how a component's variations come
from calls instead of copies, what that saves a page, and how you build a
component of your own from the same parts.

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

We also rejected generating code. A generator writes the same copy, only
faster, and the copy still stops receiving fixes the day it is written.
Copying is still the right tool when you want something structurally unlike
any of our components; for that, the second half of part one shows how to
build one from the same parts the library uses.

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

Most of those lines are your data. The library's part is the two lines that
pick a look; since 0.42, released the day after this one,
`Recipes.Table.style({ rows: 'striped' })` does it in one call. The markup is
a real `<table>` with a `<caption>`; `numeric` aligns a column of figures,
and `rowHeader` makes the invoice number the row's `<th scope="row">`, which
is what a screen reader names a row by.

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
in a file of its own, so a page that never writes it never downloads it:

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

![An invoice table with four rows. The second row, INV-002, Pending, $150.00, has a rounded grey highlight behind it where the pointer is.](/blog/2026-11-18-foldkit-plus-0-41/table-highlight.png "The Following highlight example, the pointer over the second row")

**The same table, configured once.** An application usually wants every
table to look alike. `Table.configure` takes the arguments that never change
and gives back a `view` that needs only what differs:

```ts
const AppTable = Table.configure({ base: { style: Striped, fluid: Table.fluid } })

export const ordersTable = (h: HtmlBuilder<never>) =>
  AppTable.view({ columns: [{ header: 'Order', value: row => row.id }], rows: invoices }, h)
```

It can hold named presets too, and a misspelt preset name is a type error.
About fifty components have a `configure`. Components that remember
something between events, such as whether a listbox is open, come with that
memory packaged as a *Bundle*: you name the field of your page's state it
lives in, and the package writes the wiring (about forty components have
one; writing the wiring by hand still works and adds nothing to the page).
Each example on the
[table's page](https://foldkit-plus.pages.dev/components/table) is the whole
module that draws it, and the
[README](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/README.md#one-factory-for-each-part)
shows each part with code.

## What it saves: 27.8 kB off every breadcrumb page

A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, compressed
with brotli. In 0.40 a breadcrumb could fold its middle steps into a menu, so
it imported our Menu component for every trail, folded or not. In 0.41 the
fold is a value you pass (`max` is how many steps stay visible):

```diff
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
```

A minified page of just a trail is 68.4 kB; with the menu passed it is
96.2 kB. Table's highlight and checkboxes, each chart kind, the avatar's
image-service support, the card group's highlight and the image cropper's
zoom slider became values the same way.

The second saving is freezing styles. A recipe is code holding every choice
it offers, and a bundler cannot tell which ones you picked. The build plugin
of `foldkit-mixins`, our styling package, runs your style modules at build
time and ships only the class names they produced
([how](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins/README.md#style-modules-shipped-as-data)).
Our design-system example, which draws most of the catalogue, went from
220.7 kB to 184.2 kB; the domains-plus demo's start-up script went from
217.5 kB to 191.6 kB
([#420](https://github.com/doeixd/foldkit-plus/issues/420)). We also measured
an idea that did not pay: narrowing one button's recipe by hand to the single
look a page used saved 136 bytes, so recipes stay whole.

The breadcrumb figure is held by
[a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts)
that fails if the menu reaches a plain trail page again, and the
design-system figure by its
[size budget](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts).
The 136-byte figure was measured once and no test holds it.

## Build your own component from the same parts

Configuring a shipped component covers most screens. For the rest, 0.41
makes the parts the library is built from good enough to build with
yourself, and each part now says what it owes and is checked. Five problems
drove it, and each is easy to recognise from your own code.

**Two handlers for one key.** A search field wants Escape to clear it, the
dialog around it wants Escape to close, and your application wants Enter to
submit. In 0.40 a part of a component could have one owner for its key
presses, so attaching a second behaviour that also listened for keys
conflicted, even when the two wanted different keys
([#554](https://github.com/doeixd/foldkit-plus/issues/554)). Now
`Behaviors.Keys`, from `foldkit-mixins`, is that one owner, and each key a
part handles is a named *route*. A route says which presses it takes and
what a press means, or declines so the press goes on to the page. Two routes
for the same key throw when the behaviour is defined, naming both, rather
than racing at run time:

```ts standalone
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behaviors, Capability, Event, Slot, Slots } from 'foldkit-mixins'

// The named events this search field can send.
const Message = defineMessageUnion({ ChangedQuery: { value: Schema.String }, Submitted: {} })
type Message = typeof Message.Type
type Search = { readonly query: string }

// Its parts: a container, and a text input that handles key presses.
const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.Input, Event.KeyDown] }),
})
const { Keys } = Behaviors

// Escape clears; with nothing to clear it declines, so the dialog around it closes.
const clearOnEscape = Keys.route<Search, Message>('ClearOnEscape', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.ChangedQuery({ value: '' }))),
})
const submitOnEnter = Keys.route<Search, Message>('Submit', {
  on: [Keys.chord('Enter')],
  handle: () => Option.some(Message.Submitted()),
})

// One owner for the input's key presses, built from both routes.
export const searchKeys = Keys.behavior(SearchSlots)<Search, Message>({
  slot: 'input',
  routes: [clearOnEscape, submitOnEnter],
})
```

The shipped components that take keys (Command, SearchField, Tabs, Menubar,
TagsInput and others) now accept your routes beside their own the same way,
and each exports a `conflict` check, so a settings screen can test a key
rebinding before applying it.

**Focus that falls to the page.** Delete the focused row of a list, or clear
a field with its own focused clear button, and the browser drops focus onto
the page; a keyboard user is back at the top. `FocusRecovery`, in
`foldkit-primitives` (our package of building blocks: keyboard navigation,
focus, drag and drop), moves focus to a fallback you declare (the next row,
the previous one, the list) in the same moment the focused part goes, and
never moves focus the user already took elsewhere. A row that animates out
is the other half: it is still drawn, but must not take a click or a Tab
press. `Presence` already tracked that a row was leaving; in 0.41
`Presence.behavior` makes a leaving row inert, so focus leaves it in the
frame it turns inert and the removal afterwards moves nothing
([#553](https://github.com/doeixd/foldkit-plus/issues/553),
[#555](https://github.com/doeixd/foldkit-plus/issues/555)). An audit of the
library's core behaviours also found the dialog case: remove the button that
opened a dialog while the dialog is open, and closing it had nowhere to
return focus to. `FocusReturn` gives it a fallback
([#558](https://github.com/doeixd/foldkit-plus/issues/558)).

**A list only a mouse can reorder.** The same audit rated this one high: a
list you can reorder only by dragging cannot be reordered with a keyboard, a
switch device or a screen reader. `Reorder` adds the keyboard path beside the
pointer drag: Space or Enter picks an item up and puts it down, the arrows
move it, and Escape puts it back.

**Accessibility you can only claim.** A component that listens for key
presses has not thereby made its arrow keys move between options, and one
that writes `aria-selected` has not thereby kept it true
([#552](https://github.com/doeixd/foldkit-plus/issues/552)). Now an
accessibility pattern names its *obligations* (navigation, a focus strategy,
activation, a state attribute, an accessible name), and every one must be
met by something you attached, by the element itself or by native HTML. A
component assembled with a duty nobody meets is a type error where the list
is literal, and a run-time error otherwise. Declarations are not proof, so
`Conformance`, from `foldkit-mixins/testing`, is the other half: scenarios
for a listbox, a checkbox, a tree, a dialog and tabs that drive the rendered
component in Chromium and read roles and names from its accessibility tree,
not from our own metadata. The first is declared support and the second is
tested behaviour; neither is a claim of WCAG conformance.

**A component you cannot see inside.** `SlotView.describe` returns an
assembled component as plain data: its parts, and each thing attached to
them with what it needs and provides, so documentation and a debugging panel
read the same answer. And `Agent.part`, in `foldkit-agent` (our package for
letting an AI agent act on an application through its named events), names
which control on screen is which capability, so an agent finds "the Save
button" through the application's own rules rather than by scraping the page.

All of this is used in the library itself. The audit's catalogue review fixed
about sixty behaviours across the components, each behind a test that failed
first ([#558](https://github.com/doeixd/foldkit-plus/issues/558)), and the
`examples/authoring` project builds a search field, a reorderable list, a
listbox and an editor an agent can save from these parts alone. New building
blocks arrived with it: `InlineEdit`, `SpatialNavigation` (arrow keys move to
the nearest item on a board), `SwipeActions` and `Repeat`. The site's new
[Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery) shows
each building block, several running live.

![The top of the Primitives gallery: its heading, a search box, the Media family with three primitives listed (MediaQuery, Breakpoints, platformFromUA) and, below them, the live PrefersDark example reading that the system asks for a light colour scheme.](/blog/2026-11-18-foldkit-plus-0-41/primitives-gallery.png "The Primitives gallery: the Media family and its live PrefersDark example")

## Part two: domain-driven design with Foldkit Plus

Software copies itself in a second place, and it hurts more there. Take one
rule: "a product never has more stock reserved than it holds." In a typical
web application it is written four times. It is a constraint or a `WHERE`
clause in the database. It is a check in the server's request handler. It is
validation in the form. And it is the condition that greys out the Reserve
button. Four people write those at four different times, and one day the
button lets you try what the server refuses, or the form refuses what the
database would have taken.

Foldkit Plus lets you describe your records and the rules about them once,
as plain data in a module that imports no database and no network client,
and every party reads that one description: the database adapter, the
server, the form and the page. If you know the term, this is domain-driven
design: the business's records and rules come first, and storage and screens
follow from them. Much of it has been in Foldkit Plus for several releases;
the table at the end of the next section says what is new.

## Describe your records once

### Records, and how they point at each other

`foldkit-entity`, our package for describing an application's records, calls
the description of one kind of record an *Entity*: its fields and its
relations to other records. Each field's type is a *Schema* from Effect, the
TypeScript library Foldkit is built on; a Schema describes a value's shape
and checks a value against it.

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
`product_id` column": how it is stored is decided later, in one place, by
the server.

### One condition, three readers

Rules and questions are written as *expressions*: a condition such as "stock
is greater than zero", built with `Expr` and kept as a value instead of code
that runs. A *query* built from them says which records a list holds.
Because both are values, different parties can answer the same one:

```ts
// "Products in stock", as a value. Expr.gt is "greater than"; building it runs nothing.
const InStock = Query.from(Catalog.Product).pipe(Query.where(Expr.gt(Catalog.Product.fields.stock, 0)))

// evaluate answers it over rows you hand it.
evaluate(InStock, {}, [
  { id: 'a', ownerId: 'ada', name: 'Lamp', status: 'draft', stock: 2, reserved: 0 },
  { id: 'b', ownerId: 'ada', name: 'Desk', status: 'published', stock: 0, reserved: 0 },
]) // [{ id: 'a', … }]
```

`evaluate` is the reference reader, a pure function. On the server,
`foldkit-remote-drizzle`, our adapter for the Drizzle SQL toolkit, compiles
the same `InStock` value into the `WHERE` clause of a query for SQLite,
Cloudflare D1 or Postgres. And the page, which already holds some rows,
judges them by it to place a new row in a list before the server answers.

What matters most is what a reader does when it cannot decide. The example
project `examples/entity` asks the same questions of all three readers and
prints what each said. Here is one, trimmed, exactly as
[its test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/entity/test/language.test.ts)
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
subquery. `evaluate`, handed one table's rows, refuses and says why rather
than answer wrongly. `Judge`, the reader a page uses, answers for the posts
whose author it holds and says *unknown*, with the reason, for the rest; the
page then leaves that list for the server to answer instead of guessing. A
shared suite of test cases holds every reader to one answer, with mixed
case, nulls, accents and `%` signs in the data on purpose. New in 0.41 is a
guide that teaches all of this as one language:
[Expressions](https://foldkit-plus.pages.dev/entity/guides/expressions).

### What is always true: derived values and invariants

A *derived value* is one other records decide, such as a product's number of
reviews: declared, not stored, so it cannot drift from what it counts. An
*invariant* is a rule every stored record must keep, whoever writes it.

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

That one declaration is read four ways: the server's writer compiles it into
the statement that saves a product, the Drizzle adapter's `checkConstraints`
turns it into SQL `CHECK` constraints, a form shows its `message` beside the
field `path` names, and the page checks a write against it before sending.

0.41 fixed a quiet hole here. An invariant used to be attached to one handle
on an Entity, so a form built from a handle taken before the invariant was
added judged none of the rules: the same record was `Invalid` through one
handle and `Valid` through the other, and the page sent a write that only the
server could refuse ([#539](https://github.com/doeixd/foldkit-plus/issues/539)). Now an
invariant belongs to the Entity itself, so every handle judges it. And a
form now judges invariants over the whole record it edits, not only the
fields it shows: a sales rep's discount form used to accept a 20% discount
that needed a manager's approval stored on another field, and learn of the
rule only when Save failed
([#542](https://github.com/doeixd/foldkit-plus/issues/542)).

### States, and the writes between them

A record usually moves through states: a product is a draft, then
published. Before 0.41 those states had no names. The example shop's
Publish write restated "is a draft" as a condition of its own, and the rule
"an archived product is not published" lived in a code comment, so which
states existed, and which writes joined them, was known only by reading
every write ([#535](https://github.com/doeixd/foldkit-plus/issues/535)).

Now a state is named once, on the Entity, with `Entity.refine`. A *declared
write* is a change the server accepts, described as data instead of as a
request handler, so the page and the server read the same description.
`foldkit-remote`, our package for server data, declares one with `Mutation`,
and a write can say which state it starts from and which it leaves:

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

`Mutation.update` declares a write in one call since 0.42; in 0.41 the same
write is three nested calls, which
[the domain guide](https://foldkit-plus.pages.dev/entity/guides/domain)
shows written out.

Because the write is data, three things follow with no handler to write.
The server's writer turns `Publish` into one `UPDATE … WHERE` holding the
product's id, the starting state and every invariant over the record it
would leave, so a product that is not a draft is refused as `Unmet` and one
that would break the stock rule as `Invalid`. `becomes: Published` is
checked where the write is declared, by trying every record it could start
from. And the page shows the write's result while the request is out, then
replaces it with the server's answer.

### Checking every write before it runs

Declaring rules does not prove the writes keep them. Running every rule
against every state by hand on the example shop found that its Revert write,
which sets a product back to draft with no condition, would also land on an
archived product, and that no declared write ever archived anything: the one
archived product in the demo was put there by raw SQL
([#536](https://github.com/doeixd/foldkit-plus/issues/536)). Nothing in 0.40
would have told you.

`Laws.check`, new in 0.41, does that reading for you. It reads only the
declarations, needs no database, and reports for each write and invariant
whether the write can break it, and what the writes do to the states:

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

`Publish` takes every draft to published. Nothing creates a draft, so
`Draft` is *unreached*, and nothing leaves `Published`, so it is *terminal*:
findings to read, not failures. `Publish` cannot break the stock rule,
because it writes nothing the rule reads. `Reserve` can, so the report says
*undecided* rather than calling it safe, and the writer must refuse a bad
value when it saves. The same report for the domain guide's example is
pinned by [a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/writes/test/domainGuide.test.ts);
`npx foldkit-plus laws <module>` prints it for a module of yours.

Where reading declarations cannot decide (a rule over numbers, like
`Reserve`), the evidence has to be a test, and 0.41 ships two in
`foldkit-remote/testing`. `Scenario` writes a test case as data (the records
that exist, who asks, the time, the write and what must come of it) and runs
it through each backend you give it, reporting every mismatch by backend and
step. `Walk.run` sends seeded random sequences of events through an
application and checks a rule after every step, and requires a generator for
every kind of event, so a new one cannot be forgotten. Neither proves
anything beyond its cases, and the guide says so.

The same idea reached the other places state lives. A document shared across
devices with `foldkit-sync`, our package for offline edits that agree across
devices, used to express a cap such as "a list holds at most 100 todos" as a
rule on one kind of edit; add a second edit that grows the list and the list
could reach 101, and nothing failed
([#534](https://github.com/doeixd/foldkit-plus/issues/534)). Now a document
declares *laws* judged on the result of every operation, whichever edit
caused it. And `Data.can` tells a page, from what it holds, whether a write
would be refused, so a Publish button on an archived product is grey before
it is pressed, not refused after
([#533](https://github.com/doeixd/foldkit-plus/issues/533)).

| | First shipped |
| --- | --- |
| Entities, relations and derived values | 0.7.0 |
| Expressions in queries, compiled to SQL | 0.8.0 |
| Declared writes, and permission rules (Guard, below) | 0.17.0 |
| Invariants | 0.33.0 |
| Conditions over related records, the asking user and the time; the page's `Judge`; counted derived values | 0.36.0 |
| Named states and checked transitions, `Laws.check` and its command, `Scenario`, `Walk`, document laws, `Data.can`, the Expressions guide | 0.41.0 |

The [domain guide](https://foldkit-plus.pages.dev/entity/guides/domain)
follows one small domain from these declarations to the server and the page,
and the [Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) maps
each kind of rule to the declaration that holds it.

## Guard: who may read and change what

Permissions in most applications are a handful of checks, one wherever a
record is read or written, each with its own idea of who is asking. Miss one
and you have a hole; let two disagree and the page offers what the server
refuses. `foldkit-guard`, our permissions package, declares who may do what
once, in the same shared module and the same expressions, and enforces it on
every path the server reads or writes by.

It does not sign anyone in. Who is asking comes from your authentication;
`foldkit-auth`, our package that turns a Yielded Auth sign-in session into
the person a server answers as, is one way to provide it.

A rule about the person alone ("is an admin") is declared by name, and its
body is given only on the server, so it never ships to the browser. A rule
about the person and the record ("is the owner") is an expression, so SQL
and the page can both read it:

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

**On the server**, the Drizzle adapter compiles a Read rule into every query
of the table, so a reader never receives a row they may not see: not by id,
not in a list, not as the target of a relation, not in a count. A row they
may not read answers exactly as a missing one does, so its existence does
not leak. Every write is checked again in the statement that saves it:

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

// The server's half: a body for each rule about the person alone (none here).
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
server's refusal. Guard and the page's `may` have shipped since 0.17.0.

**What 0.41 changed came out of an audit.** We read the Guard README claim by
claim against the code, and two claims did not hold.

- *Unknown is not no.* Some rules cannot be decided from one record: "may
  edit if you belong to the project this note is in" reads another record.
  The server leaves such an answer out, and the page read the missing answer
  as a refusal, so the edit form `foldkit-crud` builds locked every field of
  a record its reader was allowed to edit
  ([#571](https://github.com/doeixd/foldkit-plus/issues/571)). Now
  `May.answer` returns yes, no or none, `May.refused` is true only for a
  definite no, and the form stays editable until the server decides.
- *Rules a seam cannot judge.* A server keeping rows in memory, and the check
  of a single write, judge one record at a time; given a rule that reads
  another record, they failed every request with an internal error message
  ([#570](https://github.com/doeixd/foldkit-plus/issues/570)). They now
  refuse such a rule when they are set up.

A third gap was in how rules travel. They live on the handle `Guards.attach`
returns, and a server given another handle on the same Entity used to serve
it unguarded; with `unguarded: 'allow'`, anyone could write through it. Every
place that enforces rules now refuses that handle at set-up, naming the one
to pass.

To see Guard working, open [Chirp](https://foldkit-chirp-demo.pages.dev/), a
small Twitter-like demo whose server runs in your browser: switch person,
and Edit and Delete appear only on the posts the rules let that person
change. The [Guard reference](https://foldkit-plus.pages.dev/guard) covers
every seam.

## Answers that cannot go backwards, failures that say less

The Guard audit did not stop there. Fixing #570 showed that a server kept in
memory copied the message of anything thrown inside it into the error the
browser received, such as an internal sentence naming a query the server
could not run ([#573](https://github.com/doeixd/foldkit-plus/issues/573)).
Following that thread turned up the rest of the family: Sync's transport sent
a database driver's failure text to the device
([#575](https://github.com/doeixd/foldkit-plus/issues/575)); the CMS stored a
failed statement's text where every author could read it; a person allowed
to update a CMS entry but not read it could learn its type and state from
the wording of a refusal
([#577](https://github.com/doeixd/foldkit-plus/issues/577)); and a write's
answer returned the rows it touched to a caller who was not allowed to read
them ([#578](https://github.com/doeixd/foldkit-plus/issues/578)).

The fix is one rule across every server package. A failure on the server's
own side reaches the caller as "Internal error" and an *incident* id; the
cause goes to the server's diagnostics under the same id, and
`RemoteData.incident` gives the page the id to show, so a user can quote it.
Words meant for the user are said on purpose, with `RemoteServer.tell`, and
Sync's equivalent, `ExchangeRefused`. A write's answer is cut to what its
caller may read of each row. Each is held by tests, such as
`packages/remote-server/test/internalFailure.test.ts` and
`mutationAnswer.test.ts`, and a client that matched on an old error message
reads the incident instead.

The second change is about time. A slow read can arrive after a write that
started later, and a page that applied it would show the write and then take
it back. In 0.41 every row on Remote's wire can carry a *revision*, a number
each change moves, and a copy older than the one the page holds is ignored. A
write whose effect the server cannot read back yet answers with a
*read-after token*, and the page reads again at that token until the server
has caught up. Rows that are still behind keep what the page holds and are
asked for again, after a second, then less and less often. That second half
exists for the server in the next section, where it is not a rare race but
the normal case.

## A second authority: an event-sourced server

Everything so far assumed the server keeps rows in a SQL database. Some teams
keep their facts another way. In an *event-sourced* system the server does
not update a row in place: it records each thing that happened as an event,
and the rows a reader sees are built by folding those events together. The
history is the record, and other parts of the system can react to it.

`foldkit-remote-domain`, first published in 0.41 at 0.1.0 and marked
experimental, puts such a server behind `foldkit-remote`. The server it
supports is built with Alchemy Domain (`@alchemy.run/domain`), which
describes itself as "a domain-driven design framework for Effect, part of
Alchemy". Its README puts the core in one line: *commands* ask for a change,
the *aggregate* decides it, and *events* record what happened. A *view*
folds events into the rows a reader sees, and an *Api* lists what clients
may send and read.

**Why behind Remote.** The page does not change. It keeps the same declared
queries and writes, the same predictions while a write is out, and the same
refusals; only the authority that answers is different, which is what we
mean by a second authority. Two other designs were considered and rejected.
Putting our own Remote server in front of the Domain model would check every
call's permissions twice, once in each. And Alchemy's own Foldkit adapter,
which copies Domain state into fields of the page's state, would give one row
two owners beside Remote's copy. So the adapter is a client on the page's
side of the wire, built from the Domain Api's own typed client: it
translates, decides nothing and owns no row.

Here is the page's side of one binding. The Domain side, written with
Alchemy's own classes, defines a `Note` aggregate with a `Rename` command, a
`NoteRow` view and a `NotesApi`; its full text is on the
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

The two bindings are declarations and do no I/O; they check, when made, that
the view holds every field the Entity declares and that names match the
Api's own.

**Why revisions were needed here.** In an event-sourced server a command
commits at once, but the view is updated afterwards. A test of Alchemy's
behaviour that we keep shows a plain read straight after a commit answering
the state from before it
([`behaviour.test.ts`](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/remote-domain/test/domain/behaviour.test.ts),
case P4), so without help the page would show your edit and then take it
away. The adapter sends the command's receipt to Remote as the read-after
token from the previous section, orders rows by the revision field you name,
and the page waits for the view to catch up.

A command meets a declared write in one of three ways. `Lower.write` turns a
declared write into the aggregate's own decision, so the rules are stated
once. `DomainRemote.command`, as above, binds a command you wrote yourself.
`Imported.mutation` sends a command nobody declared a write for, which the
page then cannot predict. `examples/writes-domain` runs one write scenario
through three backends (SQLite, a server in memory and a Domain model) and
expects the same outcome from each.

**Its limits today**, from its README: it pins Alchemy Domain at exactly
`2.0.0-beta.86` and breaks when Domain's behaviour does; lists are a paged
query read forward, the only relations are ones that point at a single
record, and a live read with relations is refused; and it has run on Domain's in-memory host and over a
local HTTP server only, with no deploy, no Durable Object hosting and no
WebSocket protocol. Showing Domain operations in the contract graph is still
open ([#547](https://github.com/doeixd/foldkit-plus/issues/547)). Start with
the guide
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

## Part three: what else changed

The last part is short: what an upgrade from 0.40 asks of you, the smaller
changes in one list, and where to see it all running.

## Upgrading from 0.40

Most of the breaking changes are renames, and a rename is a type error where
you used the old name, so the TypeScript compiler gives you the list.
[Upgrading to 0.41](../upgrading-0.41.md) covers every package, with a before
and after for each change. Four changes compile either way, so check them by
eye:

1. **The default theme** casts shadows, rounds corners more and deepens the
   accent; the guide has the five settings that bring 0.40's look back.
2. **A card group** draws its pointer highlight only when you pass
   `fluid: Card.fluid`.
3. **An image cropper** draws its zoom slider only when you pass
   `zoom: ImageCropper.zoomSlider()`.
4. **A color picker's eyedropper** is off unless you pass `eyedropper`.

On the data side, a write's condition may no longer read who is asking or
the time (that is a permission rule's job), a list ordered by text needs its
collation declared, and a server's own failures reach the caller as an
incident id.

## Also in 0.41

- **FileUpload**, a field of files with a status each: drop, pick and paste,
  refusals that name their file, previews and retries
  ([page](https://foldkit-plus.pages.dev/components/file-upload)).
- **CodeBlock** marks added, removed and highlighted lines and folds a long
  block behind a button
  ([page](https://foldkit-plus.pages.dev/components/code-block)).
- **The page builder, rich text and the data grid**: finger-sized drag
  handles, a standard formatting toolbar with a "More" menu, and a grid that
  copies a selection as an HTML table
  ([builder](https://foldkit-plus.pages.dev/composition/guides/mixins-builder),
  [rich text](https://foldkit-plus.pages.dev/richtext),
  [grid](https://foldkit-plus.pages.dev/data-grid)).
- **Selected text** takes the theme's accent colour.
- **The website** builds each component page from example modules, and has a
  Primitives gallery.
- **Chrome 157** read no hue from a pale tint written with CSS relative
  colour syntax, so selected rows painted pink. Tints are now written in
  OKLab, which keeps their hue.
- **Fixes**: an input mask that scrambled typed digits
  ([#590](https://github.com/doeixd/foldkit-plus/issues/590)), a server-data
  state that could not survive a development reload
  ([#593](https://github.com/doeixd/foldkit-plus/issues/593)), scroll
  restored on reload ([#594](https://github.com/doeixd/foldkit-plus/issues/594)),
  and a write sent twice from two tabs.

Everything, entry by entry, is in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

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
  edits across two devices: press *Go offline* on one, edit, then *Go
  online*.
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
