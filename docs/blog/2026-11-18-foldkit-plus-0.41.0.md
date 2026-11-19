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

Copied components and restated rules have the same root: when one fact lives
in several places, nobody can check that the copies agree, so they drift.
0.41 is the release where Foldkit Plus says each such fact once, for
components and for the records an application keeps, and then checks it. You
do not need to know Foldkit to read on: the examples are functions that
return HTML, or plain declarations.

**If you only read one thing:** building interfaces, read
[One table, three variations](#one-table-three-variations); modelling data,
read [Describe your records once](#describe-your-records-once); upgrading
from 0.40, read [Upgrading from 0.40](#upgrading-from-040).

## Part one: components without generated or copied code

### Why not generate, copy, or add a flag

A generator or a copy command gives you something real on day one. The
component is in your repository, you can read every line, and you can change
anything, today, without asking anyone. That feels like control, and for a
prototype it is.

The cost arrives later, in three ways. Fixes stop reaching you: when the
library corrects a focus bug or a screen-reader label, your copy keeps the
old one until someone notices and merges by hand. Every variation is an edit:
the dense table, the striped one and the one with checkboxes are three
divergent files, or one file with branches you now maintain. And copies
drift: two projects, or two teams in one, end up with two tables that look
alike and behave differently. A generator changes none of that. It writes
the same copy faster, and the copy stops receiving fixes the moment it is
written.

The usual alternative is options: `<Table striped hoverHighlight
selectable>`. You keep receiving fixes, but you meet two other limits. The
variation you need is not an option, so you wait or you fork. And a flag such
as `hoverHighlight: true` means the highlight's code is in the bundle whether
or not a page sets it, because the library cannot know which pages will.

So in 0.41 an argument to a component is one of three things: **plain data**
(a caption, the rows), **a look** written as data with named choices, which
you can extend from outside, or **a feature you import and pass**, which a
page that never imports it never ships. The usual objection to a library, "I
cannot change it", is what the three variations below answer.

| | Copied or generated source | An option that is a flag | A value you pass |
| --- | --- | --- | --- |
| Gets the library's fixes | No, you merge them by hand | Yes | Yes |
| A variation the library lacks | Edit your copy | Wait, or fork | Add it from outside |
| Code on a page that does not use a feature | Only what you copied | Shipped anyway | None |

Copying is still the right tool for something structurally unlike any of our
components, and for that, part one ends with how to build one from the same
parts the library uses.

### One table, three variations

Here is a whole striped table of invoices:

```ts standalone
import type { HtmlBuilder } from 'foldkit/html'
import { Recipes, Table } from 'foldkit-mixins-ui'

const invoices = [
  { id: 'INV-001', status: 'Paid', amount: '$250.00' },
  { id: 'INV-002', status: 'Pending', amount: '$150.00' },
]

const Striped = Recipes.Table.style({ rows: 'striped' })

// `never`: this table sends no events back to the page.
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

Three names are worth knowing. `Table.view` draws the table from the
arguments it is given. `h` is Foldkit's HTML builder, which every function
that draws is handed. And `Recipes.Table` is the table's shipped look,
written as data with named choices; the package calls such a look a
*recipe*, and `rows: 'striped'` is one choice on it. (`.style` arrived in
0.42, a day after this release; on 0.41 write
`Style.forSlots(TableSlots)(Recipes.Table({ rows: 'striped' }))`.) The markup
is a real `<table>` with a `<caption>`, and `rowHeader` makes the invoice
number the row's `<th scope="row">`, which is what a screen reader names a
row by.

**A look the package does not have.** Say your tables need a heavy rule under
each row. You do not fork the recipe; you give it one more choice with `add`,
and every choice it already had still works. `Style.self`, from
`foldkit-mixins`, our styling package, wraps ordinary CSS declarations as a
piece of a look (a real application would use a theme token, not a colour):

```ts
import { Style } from 'foldkit-mixins'

const Ruled = Recipes.Table.add({
  rows: { ruled: { row: Style.self({ borderBlockEnd: '2px solid rebeccapurple' }) } },
}).style({ rows: 'ruled', density: 'compact' })
```

`add` refuses a choice the recipe already has, both as a type error and when
the module loads, so it cannot quietly replace a shipped look.

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

About fifty components have a `configure`. Components that remember
something between events, such as whether a listbox is open, come with that
memory packaged as a *Bundle*: you name the field of your page's state it
lives in, and the package writes the wiring. Each example on the
[table's page](https://foldkit-plus.pages.dev/components/table) is the whole
module that draws it.

### What it saves: 27.8 kB off every breadcrumb page

A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, compressed
with brotli. In 0.40 a breadcrumb could fold its middle steps into a menu, so
it imported our Menu component for every trail, folded or not. In 0.41 the
fold is a value you pass (`max` is how many steps stay visible):

```diff
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
```

A minified page of just a trail is 68.4 kB; with the menu passed it is
96.2 kB, and
[a test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts)
fails if the menu reaches a plain trail page again. Table's highlight and
checkboxes, each chart kind, the card group's highlight and the image
cropper's zoom slider became values the same way.

The second saving is freezing styles: the styling package's build plugin
runs your style modules at build time and ships only the class names they
produced. Our design-system example went from 220.7 kB to 184.2 kB, held by
its [size budget](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts).

### Build your own component from the same parts

When configuring is not enough, you build a component from the same parts
the library uses, and in 0.41 each part says what it owes and is checked.
Two problems show the idea.

**Two handlers for one key.** A search field wants Escape to clear it, the
dialog around it wants Escape to close, and your application wants Enter to
submit. In 0.40 a second behaviour listening for keys on the same element
conflicted, even when the two wanted different keys. Now `Behaviors.Keys` is
the one owner, and each key is a named *route*: which presses it takes and
what a press means, or a refusal that lets the press go on. Two routes for
the same key throw when defined, naming both. The search field's parts
(`SearchSlots`) and events (`Message`) are declared out of sight below:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behaviors, Capability, Event, Slot, Slots } from 'foldkit-mixins'
const Message = defineMessageUnion({ ChangedQuery: { value: Schema.String }, Submitted: {} })
type Message = typeof Message.Type
type Search = { readonly query: string }
const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.Input, Event.KeyDown] }),
})
const { Keys } = Behaviors
-->
```ts
// Escape clears; with nothing to clear it declines, so the dialog around it closes.
const clearOnEscape = Keys.route<Search, Message>('ClearOnEscape', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.ChangedQuery({ value: '' }))),
})
const submitOnEnter = Keys.route<Search, Message>('Submit', {
  on: [Keys.chord('Enter')],
  handle: () => Option.some(Message.Submitted()),
})

export const searchKeys = Keys.behavior(SearchSlots)<Search, Message>({ slot: 'input', routes: [clearOnEscape, submitOnEnter] })
```

The shipped components that take keys (Command, SearchField, Tabs, Menubar
and others) accept your routes beside their own the same way.

**Focus that falls to the page.** Delete the focused row of a list, or clear
a field with its own focused clear button, and the browser drops focus onto
the page; a keyboard user is back at the top. `FocusRecovery`, in
`foldkit-primitives` (our package of building blocks: keyboard navigation,
focus, drag and drop), moves focus along a fallback you declare per part, in
the same moment the focused part goes, and never moves focus the user
already took elsewhere. Here a removed row hands focus to the next row, else
the previous one, else the search input, and the clear button hands it to
the input (the list's parts are declared out of sight again):

<!-- docs-check standalone
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
const RecoverySlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  clear: Slot.make({ capability: Capability.Interactive }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const RecoveryView = SlotView.over(RecoverySlots)<{ readonly rows: ReadonlyArray<{ readonly id: string }> }, never>()
-->
```ts
import { FocusRecovery } from 'foldkit-primitives/interaction'

export const Recovers = FocusRecovery.behavior(RecoveryView)({
  owner: 'root',
  parts: { input: [], clear: [{ part: 'input' }], row: ['next', 'previous', { part: 'input' }] },
})
```

The rest of this work, each item in its README:

- **Keyboard reordering:** `Reorder` moves an item with Space, the arrows and
  Escape, so a list is no longer reorderable by mouse alone.
- **Leaving rows made inert:** `Presence.behavior` stops a row that is
  animating out from taking a click or a Tab press.
- **Focus return for dialogs:** `FocusReturn` gives a closing dialog a
  fallback when the button that opened it is gone.
- **Accessibility obligations and conformance:** a pattern names what it owes
  (navigation, an accessible name, a state attribute), and a component that
  leaves a duty unmet is refused when assembled; `Conformance` scenarios then
  drive the rendered component in Chromium and read its accessibility tree.
  The first is declared support and the second is tested behaviour; neither
  is a claim of WCAG conformance.
- **Inspection:** `SlotView.describe` returns an assembled component as plain
  data, its parts and what each attachment needs and provides.
- **Agent parts:** `Agent.part`, in `foldkit-agent` (our package for letting
  an AI agent act through an application's named events), names which control
  is which capability.
- **New building blocks:** `InlineEdit`, `SpatialNavigation`, `SwipeActions`
  and `Repeat`.

The library uses these parts itself: an audit of its core behaviours fixed
about sixty across the components, each behind a test that failed first
([#558](https://github.com/doeixd/foldkit-plus/issues/558)). The new
[Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery) shows
each part, several running live.

![The top of the Primitives gallery: its heading, a search box, the Media family with three primitives listed (MediaQuery, Breakpoints, platformFromUA) and, below them, the live PrefersDark example reading that the system asks for a light colour scheme.](/blog/2026-11-18-foldkit-plus-0-41/primitives-gallery.png "The Primitives gallery: the Media family and its live PrefersDark example")

## Part two: domain-driven design with Foldkit Plus

Software copies itself in a second place, and it hurts more there. Take one
rule from a bank: "an open account is never overdrawn." In a typical web
application it is written four times. It is a constraint in the database. It
is a check in the server's request handler. It is validation in the
withdrawal form. And it is the condition that greys out the Withdraw button.
Four people write those at four different times, and one day the button lets
you try what the server refuses, or the form refuses what the database would
have taken.

Foldkit Plus lets you describe your records and the rules about them once,
as plain data in a module that imports no database and no network client,
and every party reads that one description: the database adapter, the
server, the form and the page. If you know the term, this is domain-driven
design: the business's records and rules come first, and storage and screens
follow. This part uses one bank account throughout.

### Describe your records once

#### Records and rules

`foldkit-entity`, our package for describing an application's records, calls
the description of one kind of record an *Entity*. Each field's type is a
*Schema* from Effect, the TypeScript library Foldkit is built on; a Schema
describes a value's shape and checks it. A named condition on a record, such
as "is open", is a *state*, declared with `Entity.refine`. A rule is written
as an *expression*, built with `Expr` and kept as a value instead of code
that runs. A rule every stored record must keep, whoever writes it, is an
*invariant*, and one about how a record may change is a *transition*.

The code in this part is written in the forms on the main branch today. A
few arrived after 0.41: `Mutation.update` in 0.42, and `in:`,
`Entity.transition`, `Expr.implies`, `input`, `decrement` and a `when` over
the row in the next release. 0.41's longer forms are in
[the domain guide as it stood at 0.41](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/docs/entity.md).

```ts standalone
import { Schema } from 'effect'
import { Entity, Expr, Laws, Operators } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

// One kind of record and its fields, much like a table definition.
const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.Number,
    withdrawnToday: Schema.Number,
  }),
)

// Two named states of an account.
const Open = Entity.refine(Account, 'Open', { status: 'open' })
const Closed = Entity.refine(Account, 'Closed', { status: 'closed' })

// The rules belong to the Entity. `after` is the account as a write leaves it; `before`, as it was.
Account.pipe(
  Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
    message: 'An open account is never overdrawn',
    in: Open,
  }),
  Entity.invariant('withinDailyLimit', ({ after }) => Expr.lte(after.withdrawnToday, 500), {
    message: 'An open account withdraws at most 500 a day',
    in: Open,
  }),
  Entity.transition(
    'aClosedAccountStaysClosed',
    ({ before, after }) => Expr.implies(Expr.eq(before.status, 'closed'), Expr.eq(after.status, 'closed')),
    { message: 'A closed account stays closed' },
  ),
)
```

`in: Open` says a rule binds only open accounts, so a closed account with a
negative balance breaks nothing.

#### One rule, every reader

Because a rule is a value, each party reads it in its own terms. On the
server, `foldkit-remote-drizzle`, our adapter for the Drizzle SQL toolkit,
turns the two rules that read one row into SQL `CHECK` constraints for the
accounts table. For this account its `checkConstraints` function writes, for
SQLite (the state `in: Open` names becomes the `status = 'open'` part):

```text
constraint "accounts_neverOverdrawn" check (((not ("accounts"."status" = 'open') or "accounts"."balance" >= 0)) is true)
constraint "accounts_withinDailyLimit" check (((not ("accounts"."status" = 'open') or "accounts"."withdrawn_today" <= 500)) is true)
```

The transition compares the account before and after a write, which a
`CHECK` cannot see, so the adapter reports it as enforced only by the
server's writer instead of pretending. (`is true` is there because SQL lets
a row through when a condition is unknown, and an invariant does not.) The
same rules are compiled into the statement that saves an account, judged by
a form before anything is sent, with each `message` shown beside its field,
and judged by the page before it sends a write. The Drizzle
adapter's
[README](https://foldkit-plus.pages.dev/remote/guides/remote-drizzle)
shows how the constraints reach a migration.

When a rule reads a record the page does not hold, the page's reader says
*unknown*, with the reason, and leaves the answer to the server rather than
guess; a shared suite of test cases holds every reader to one answer. A value
other records decide, such as a count, is a *derived value*, declared rather
than stored. New in 0.41 is one guide that teaches all this as a language:
[Expressions](https://foldkit-plus.pages.dev/entity/guides/expressions).

#### States, and the writes between them

An account is open, then closed. Before 0.41 such states had no names: each
write restated "is open" as a condition of its own, and which states existed
was known only by reading every write. A *declared write* is a change the
server accepts, described as data instead of as a request handler, so the
page and the server read the same description; `foldkit-remote`, our package
for server data, declares one with `Mutation`, and a write can say which
state it starts from and which it leaves:

```ts
// An amount is never negative.
const Amount = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))

// A new account starts open and empty; its input is its id and owner.
const OpenAccount = Mutation.insert('OpenAccount', Account, {
  set: { ownerId: Schema.String, status: Schema.Literal('open'), balance: Schema.Literal(0), withdrawnToday: Schema.Literal(0) },
  becomes: Open,
})

// Close takes an open account and must leave it closed.
const CloseAccount = Mutation.update('CloseAccount', Account, {
  set: { status: Schema.Literal('closed') },
  from: Open,
  becomes: Closed,
})

// A deposit and a withdrawal take an amount, which is not a field of the account.
const DepositMoney = Mutation.update('DepositMoney', Account, {
  input: { amount: Amount },
  from: Open,
  increment: { balance: 'amount' },
})
const WithdrawMoney = Mutation.update('WithdrawMoney', Account, {
  input: { amount: Amount },
  from: Open,
  decrement: { balance: 'amount' },
  increment: { withdrawnToday: 'amount' },
  // Only when the account holds the amount.
  when: ({ row, input }) => Expr.lte(input.amount, row.balance),
})
```

Because each write is data, three things follow with no handler to write.
The server's writer turns `CloseAccount` into one `UPDATE … WHERE` holding
the account's id, the starting state and every rule over the account it
would leave, so closing an account that is already closed is refused as
`Unmet`. `becomes: Closed` is checked where the write is declared, by trying
every account it could start from. And the page shows a write's result while
the request is out, then replaces it with the server's answer.

#### Checking every write before it runs

Declaring rules does not prove the writes keep them. Before 0.41 nothing
told you. On the example shop in this repository, a script that tried every
rule against every state found a write that could take an archived product
back to draft, and that no declared write ever archived anything: the one
archived product in the demo had been put there by raw SQL
([#536](https://github.com/doeixd/foldkit-plus/issues/536)).

`Laws.check`, new in 0.41, does that reading for you. It reads only the
declarations, needs no database, and reports for every write and rule
whether the write can break it, and what the writes do to the states. Given
the kernel's operators (it needs them to read the arithmetic in a
`decrement`), this is what it prints for the account above, run on the main
branch at commit `c0fd9b69d`:

```ts
export const report = Laws.show(
  Laws.check({ writes: [OpenAccount, DepositMoney, WithdrawMoney, CloseAccount], operators: Operators.kernel }),
)
```

```text
Account
  Open -> Closed   CloseAccount   holds
  Closed                          terminal

OpenAccount     x neverOverdrawn              kept: 1 row enumerated
OpenAccount     x withinDailyLimit            kept: 1 row enumerated
OpenAccount     x aClosedAccountStaysClosed   kept: a create has no row before
DepositMoney    x neverOverdrawn              kept: proved from the bounds on balance, for every row and input within them
DepositMoney    x withinDailyLimit            kept: writes no member it reads
DepositMoney    x aClosedAccountStaysClosed   kept: 1 row enumerated
WithdrawMoney   x neverOverdrawn              undecided: it rests on comparing amount with balance, which intervals alone cannot use
WithdrawMoney   x withinDailyLimit            refused: An open account withdraws at most 500 a day
    before   status: "open", withdrawnToday: 500, balance: 1
    input    amount: 1
    after    status: "open", withdrawnToday: 501, balance: 0
WithdrawMoney   x aClosedAccountStaysClosed   kept: 2 rows enumerated
CloseAccount    x neverOverdrawn              kept: holds whatever balance holds, over 1 row enumerated
CloseAccount    x withinDailyLimit            kept: holds whatever withdrawnToday holds, over 1 row enumerated
CloseAccount    x aClosedAccountStaysClosed   kept: 1 row enumerated

1 entity, 2 states, 4 writes, 3 rules: 12 pairs, 10 kept, 1 refused, 1 undecided
```

Read it from the top. Closing takes every open account to closed, and
nothing leaves `Closed`, so it is *terminal*: findings to read, not failures.
A deposit cannot overdraw an account, proved from the bounds: the balance is
at least zero before, the amount is never negative, so their sum is at least
zero after. It cannot break the daily limit either, because it writes no
member (a field or relation) the rule reads. Closing breaks neither number
rule, because once an account is closed they no longer bind it.

The refusal is a real bug in the example as written. The withdrawal checks
the balance but not the day's total, and the report shows the account that
proves it: 500 already withdrawn today, a balance of 1, a withdrawal of 1,
and the day ends at 501. The fix is one more condition on the write:

```diff
-  when: ({ row, input }) => Expr.lte(input.amount, row.balance),
+  when: ({ row, input }) =>
+    Expr.and(Expr.lte(input.amount, row.balance), Expr.lte(Expr.add(row.withdrawnToday, input.amount), 500)),
```

With it, the refusal is gone, and the line reads:

```text
WithdrawMoney   x withinDailyLimit            undecided: it rests on comparing amount with balance and withdrawnToday with amount, which intervals alone cannot use
```

What is left undecided is the kind of question intervals cannot answer: the
withdrawal is safe because the amount is compared with the balance, a
relation between two numbers rather than a bound on one. A solver settles
that kind of question, and putting one behind the checker is what we are
building next ([#600](https://github.com/doeixd/foldkit-plus/issues/600)).
`Laws.check` itself is new in 0.41; the bounds, the witness rows and the
totals line above arrived after it and ship in the next release.

Until then, the evidence for such a rule is a test, and 0.41 ships two in
`foldkit-remote/testing`. `Scenario` writes a test case as data (the
accounts that exist, who asks, the time, the write and what must come of it)
and runs it through each backend you give it. `Walk.run` sends seeded random
sequences of events through an application and checks a rule after every
step, and requires a generator for every kind of event, so a new one cannot
be forgotten. `npx foldkit-plus laws <module>` prints the report above for a
module of yours.

The same idea reached the other places state lives. A document shared across
devices with `foldkit-sync`, our package for offline edits that agree across
devices, now declares *laws* judged on the result of every operation. And
`Data.can` tells a page, from what it holds, whether a write would be
refused, so the Withdraw button on a closed account is grey before it is
pressed. The [domain guide](https://foldkit-plus.pages.dev/entity/guides/domain)
follows one domain from its declarations to the server and the page, and
the [Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) maps
each kind of rule to the declaration that holds it.

### Guard: who may read and change what

Permissions in most applications are a handful of checks, one wherever a
record is read or written, each with its own idea of who is asking. Miss one
and you have a hole; let two disagree and the page offers what the server
refuses. `foldkit-guard`, our permissions package, declares who may do what
once, in the same expressions, and enforces it on every path the server
reads or writes by. It does not sign anyone in: who is asking comes from
your authentication, and `foldkit-auth`, our package that turns a Yielded
Auth sign-in session into the person a server answers as, is one way to
provide it.

A rule about the person and the record ("is the owner") is an expression,
so SQL and the page can both read it. A rule about the person alone ("is an
admin") is declared by name and its body is given only on the server, so it
never ships to the browser:

```ts
import { Guards, May } from 'foldkit-guard'

// Who is asking, as the server knows them.
const User = Schema.Struct({ id: Schema.String })

// `unguarded: 'deny'` refuses anything no rule here allows.
const Bank = Guards.declare(
  'Bank',
  User,
  guard => ({ isOwner: guard.row(Account, user => Expr.eq(Account.fields.ownerId, user.id)) }),
  { key: user => user.id, unguarded: 'deny' },
)

// Attaching rules returns a new, guarded handle on the Entity: pass this one everywhere from now on.
const Owned = Account.pipe(Guards.attach(Bank, { row: { Read: [Bank.isOwner], Write: [Bank.isOwner] } }), Guards.may)
```

`Guards.may` asks the server to send, with each account, what its reader may
do with it. **On the server**, the Drizzle adapter compiles the Read rule
into every query of the table, so a reader never receives an account they
may not see: not by id, not in a list, not in a count, and one they may not
read answers exactly as a missing one does. Every write is checked again in
the statement that saves it:

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

// The server's half: a body for each rule about the person alone (none here).
const Policy = Bank.implement({})

// The Read rule as a condition the Drizzle binding adds to every query of its table.
export const visible = GuardDrizzle.visible(Policy, [Owned])
```

**On the page**, the same rule decides which controls to show. `row` below is
an account the page read with `may` selected:

<!-- docs-check
import type { Selected } from 'foldkit-entity'
declare const row: Selected<typeof Card>
-->
```ts
const Card = Entity.select(Owned, { balance: true, may: true })

// Show Withdraw when the server said this reader may update the account.
export const showWithdraw = May.can(row.may, 'Update')
```

That is a hint, never the check: a button shown by mistake still meets the
server's refusal. Guard and the page's `may` have shipped since 0.17.0.

**What 0.41 changed.** We read the Guard README claim by claim against the
code, and one claim mattered to every user: some rules cannot be decided
from one record ("may edit if you belong to the household this account is
in" reads another record). The server leaves such an answer out, and the
page read the missing answer as a refusal, so the edit form `foldkit-crud`
builds locked every field of a record its reader was allowed to edit
([#571](https://github.com/doeixd/foldkit-plus/issues/571)). Now
`May.answer` returns yes, no or none, `May.refused` is true only for a
definite no, and the form stays editable until the server decides. Two
smaller gaps closed at the same time: a seam that judges one record at a
time now refuses at set-up a rule that reads others, and every seam refuses
an unguarded handle on a guarded Entity instead of serving it unguarded.

To see Guard working, open [Chirp](https://foldkit-chirp-demo.pages.dev/), a
small Twitter-like demo whose server runs in your browser: switch person,
and Edit and Delete appear only on the posts the rules let that person
change.

<!-- image: https://foldkit-chirp-demo.pages.dev/ signed in as ada, a post of hers with Edit and Delete visible, and a post of another person without them -->

The same audit found server failure text reaching the browser in five
places, from a driver's error message to the wording of a refusal that told
a reader more than they could see. The rule that fixes all of them: a
failure on the server's own side reaches the caller as "Internal error" and
an *incident* id, which `RemoteData.incident` gives the page to show; the
cause goes to the server's diagnostics under the same id; and words meant
for the user are said on purpose, with `RemoteServer.tell`. A write's answer
is also cut to what its caller may read.

### A second authority: an event-sourced server

Everything so far assumed the server keeps rows in a SQL database. Some
teams keep their facts another way. In an *event-sourced* system the server
does not update a row in place: it records each thing that happened as an
event ("money deposited"), and the rows a reader sees are built by folding
those events together. The history is the record, and other parts of the
system can react to it.

`foldkit-remote-domain`, first published in 0.41 at 0.1.0 and marked
experimental, puts such a server behind `foldkit-remote`. The server it
supports is built with Alchemy Domain (`@alchemy.run/domain`), which
describes itself as "a domain-driven design framework for Effect, part of
Alchemy". Its README puts the core in one line: *commands* ask for a change,
the *aggregate* decides it, and *events* record what happened. A *view*
folds events into the rows a reader sees, and an *Api* lists what clients
may send and read.

The page does not change. It keeps the same declared reads and writes, the
same predictions while a write is out and the same refusals; only the
authority that answers is different, which is what we mean by a second
authority. The adapter is a client on the page's side, built from the Api's
own typed client, and owns no row (a Remote server in front, or Alchemy's
own Foldkit adapter, would each have made two owners of one thing). Here is
the bank account on Alchemy's side, written with Alchemy's classes, then our
two bindings. It is a slimmer record than part two's: just the balance the
view folds, and a revision.

```ts standalone
import * as Domain from '@alchemy.run/domain'
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'

// Alchemy's code: an event, a command, the aggregate that decides it, a view, and the Api.
class MoneyDeposited extends Domain.Event('MoneyDeposited', { amount: Schema.Int, revision: Schema.Int }) {}
class DepositMoney extends Domain.Command('DepositMoney', {
  target: Schema.String,
  input: { amount: Schema.Int },
  events: [MoneyDeposited],
}) {}
const State = Schema.Struct({ balance: Schema.Int, revision: Schema.Int })
const evolve = {
  MoneyDeposited: (state: typeof State.Type, event: MoneyDeposited) => ({
    balance: state.balance + event.amount,
    revision: event.revision,
  }),
}
class Account extends Domain.Aggregate('Account', {
  id: Schema.String,
  state: State,
  initial: { balance: 0, revision: 0 },
  commands: [DepositMoney],
  decide: {
    DepositMoney: (state, command) => [new MoneyDeposited({ amount: command.amount, revision: state.revision + 1 })],
  },
  evolve,
}) {}
class Balance extends Domain.View('Balance', { from: [Account], key: Account, state: State, initial: { balance: 0, revision: 0 }, evolve }) {}
class Bank extends Domain.Model('Bank', { aggregates: [Account], views: [Balance] }) {}
class BankApi extends Domain.Api('BankApi', { model: Bank, commands: ['DepositMoney'], views: ['Balance'] }) {}

// Ours: the record the page reads, and the write it sends.
const AccountBalance = Entity.define(
  'AccountBalance',
  Schema.Struct({ id: Schema.String, balance: Schema.Number, revision: Schema.Number }),
)
const Deposit = Mutation.make('Deposit', { Input: { id: Schema.String, amount: Schema.Number }, Output: {} })

// Read balances from Alchemy's view, ordered by its revision; send Deposit as its command.
export const reads = DomainRemote.view(AccountBalance, BankApi, 'Balance', { revision: 'revision' })
// With no `written`, a deposit answers no row until the view has caught up.
export const deposits = DomainRemote.command(Deposit, BankApi, 'DepositMoney', {
  entity: AccountBalance,
  target: input => input.id,
  input: input => ({ amount: input.amount }),
})
```

The bindings are declarations and do no I/O. When made, they check that the
view holds every field the record declares and that the names match the
Api's own, and the
[package page](https://foldkit-plus.pages.dev/remote/guides/remote-domain)
shows the one call that connects them to a running Api.

**The problem 0.41 had to solve.** In an event-sourced server a command
commits at once, but the view is updated afterwards. A test of Alchemy's
behaviour that we keep shows a plain read straight after a commit answering
the state from before it
([`behaviour.test.ts`](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/remote-domain/test/domain/behaviour.test.ts),
case P4), so without help the page would show your deposit and then take it
away. So in 0.41 every row on Remote's wire can carry a *revision*, a number
each change moves, and a copy older than the one the page holds is ignored.
A write whose effect the server cannot read back yet answers with a
*read-after token* (here, the command's receipt), and the page reads again
at that token until the view has caught up, asking less and less often.
Both work for every server, not only this one; this is where they are
needed every time.

A command can also be *lowered* from a declared write (`Lower.write`), so
the rules are stated once and run inside the aggregate, or sent with no
declared write at all (`Imported.mutation`), which the page then cannot
predict. `examples/writes-domain` runs one write scenario through three
backends (SQLite, a server in memory and a Domain model) and expects the
same outcome from each.

**Its limits today**, from its README: it pins Alchemy Domain at exactly
`2.0.0-beta.86` and breaks when Domain's behaviour does; lists are a paged
query read forward, the only relations are ones that point at a single
record, and a live read with relations is refused; and it has run on
Domain's in-memory host and over a local HTTP server only, with no deploy,
no Durable Object hosting and no WebSocket protocol. Start with the guide
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

### What is new, and what was there

Most of part two was already in Foldkit Plus before this release:

| | First shipped |
| --- | --- |
| Entities, relations and derived values | 0.7.0 |
| Expressions in queries, compiled to SQL | 0.8.0 |
| Declared writes, and permission rules (Guard) | 0.17.0 |
| Invariants | 0.33.0 |
| Conditions over related records, the asking user and the time; the page's own reader | 0.36.0 |
| Named states and checked transitions, `Laws.check` and its command, `Scenario`, `Walk`, document laws, `Data.can`, "unknown is not no", incident ids, row revisions, the Alchemy adapter, the Expressions guide | 0.41.0 |

## Part three: what else changed

### Upgrading from 0.40

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

### Also in 0.41

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
- **Fixes**: an input mask that scrambled typed digits, a server-data state
  that could not survive a development reload, scroll restored on reload,
  and a write sent twice from two tabs.

Everything, entry by entry, is in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

## See it, try it

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

![The widget showcase in a dark scheme: a Toolbar with Bold, Italic, Strikethrough and Link, a Mute toggle, a left, center and right toggle group, an accordion with Billing, Team and API keys, and a Delete project button.](/blog/2026-11-18-foldkit-plus-0-41/widgets-dark.png "The widget demo in a dark scheme")

Next we are giving dialogs and popovers the same one-call drawing the table
has, and teaching the checker to decide number rules
([#600](https://github.com/doeixd/foldkit-plus/issues/600)).

To try it, install the widget package and the packages it builds on:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

then draw the table from [One table, three variations](#one-table-three-variations),
or start the data side from one record with
[One domain declaration](https://foldkit-plus.pages.dev/entity/guides/domain).
