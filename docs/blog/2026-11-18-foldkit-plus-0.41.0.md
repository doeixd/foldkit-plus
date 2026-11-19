---
title: Composition over copy and paste: Foldkit Plus 0.41
description: Why Foldkit Plus components need no code generation, how to declare domain rules once across SQL, server and UI, and what else changed in 0.41.
date: 2026-11-18
updated: 2026-11-19
author: Claude
tags: [release, mixins-ui, entity, guard, remote-domain, bundle-size]
---

# Composition over copy and paste: Foldkit Plus 0.41

A popular way to ship UI components today is to copy them. You run a
command, it writes `table.tsx` into your repository, and from then on the
table is yours. That is a fast start, but a year later it is a file you
maintain. Fixes from the library no longer reach your copy. Every variation
(a denser table, a hover highlight, checkboxes) becomes an edit to code you
did not write, and two projects' copies drift apart.

Foldkit Plus takes the other road. It is a set of open-source packages for
[Foldkit](https://foldkit.dev/), a TypeScript framework where the page's
state lives in one object and changes only through named events. One package,
`foldkit-mixins-ui`, ships about ninety styled, accessible components:
buttons, fields, menus, dialogs, tables and charts. In 0.41 you choose each
variation by passing arguments, and a page ships only the code for the
arguments it passes.

![Three table examples side by side: Basic, a four-row invoice table; Following highlight, the same table with the second row shaded; Configure once, three small tables stacked, one roomy, one dense and one in the style picked above.](/blog/2026-11-18-foldkit-plus-0-41/table-three-ways.png "Three of the Table examples on the components page: Basic, Following highlight and Configure once")

Business rules suffer the same drift. A rule such as "an open account is
never overdrawn" usually gets copied into SQL constraints, server handlers,
form validation and button state. 0.41 is the release where Foldkit Plus lets
you declare both UI variations and domain rules once, and then checks them.
You do not need to know Foldkit to read on: the examples are functions that
return HTML, or plain declarations.

**If you only read one thing:** building interfaces, read
[One table, three variations](#one-table-three-variations); modelling data,
read [Describe your records once](#describe-your-records-once); upgrading
from 0.40, read [Upgrading from 0.40](#upgrading-from-040).

## Why not generate, copy, or add a flag

A generator or copy command gives you something real on day one. The
component sits in your repository, you can read every line, and you can
change anything without asking anyone. That feels like control, and for a
prototype it is.

The cost arrives later, in three ways. First, fixes stop reaching you: when
the library corrects a focus bug or a screen-reader label, your copy keeps
the old behaviour until someone merges it by hand. Second, every variation is
an edit: a dense table, a striped one and one with checkboxes turn into
divergent files or branches you now maintain. Third, copies drift across
projects until two tables that look alike behave differently.

A generator changes none of that. It writes the same copy faster, and the
copy stops receiving fixes the moment it is written.

The usual alternative is boolean flags: `<Table striped hoverHighlight
selectable>`. You keep receiving fixes, but you meet two other limits. When
the variation you need is missing, you wait or fork. And a flag such as
`hoverHighlight: true` pulls the highlight's code into every bundle, because
the library cannot know which pages will set it.

In 0.41, an argument to a component is one of three things:

- **Plain data**, such as a caption and rows.
- **A look** written as data with named choices, which you can extend from
  outside.
- **A feature value** you import and pass, which a page that never imports
  it never ships.

The usual objection to a component library ("I cannot change it") is what the
three variations below answer.

| | Copied or generated source | An option that is a flag | A value you pass |
| --- | --- | --- | --- |
| Gets the library's fixes | No, you merge them by hand | Yes | Yes |
| A variation the library lacks | Edit your copy | Wait, or fork | Add it from outside |
| Code on a page that does not use a feature | Only what you copied | Shipped anyway | None |

Copying is still right when you need markup structurally unlike any shipped
component. For that case, [Build your own component from the same
parts](#build-your-own-component-from-the-same-parts) shows the building
blocks underneath.

## One table, three variations

Here is a striped table of invoices:

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

Three names matter here. `Table.view` draws a real `<table>` with a
`<caption>`, using `rowHeader` to render the invoice id as `<th scope="row">`
for screen readers and `numeric` to align amounts. `h` is Foldkit's HTML
builder, passed to every view function. `Recipes.Table` is the table's
shipped look, written as data with named choices called a *recipe*
(`.style(...)` shipped in 0.42 the day after 0.41, so installing today runs
this snippet as written).

Where does the CSS come from? `foldkit-mixins`, our styling package, compiles
each recipe into scoped CSS classes and injects them into the page on first
render. For production, the `foldkit-mixins/vite` build plugin extracts those
classes at build time so the browser downloads only class names and CSS, not
the style compiler.

**A look the package does not have.** Say your tables need a heavy rule under
each row. You do not fork the recipe; you add one new choice with `add`,
targeting the table's `row` part (its *slot* for each `<tr>`), and every
shipped choice such as `density: 'compact'` still works. `Style.self` wraps
ordinary CSS declarations (a real app would use a theme token rather than a
literal colour):

```ts
import { Style } from 'foldkit-mixins'

const Ruled = Recipes.Table.add({
  rows: { ruled: { row: Style.self({ borderBlockEnd: '2px solid rebeccapurple' }) } },
}).style({ rows: 'ruled', density: 'compact' })
```

`add` refuses a choice name the recipe already owns, both as a type error and
when the module loads, so it cannot quietly overwrite a shipped look.

**A feature you pass.** The gliding hover highlight pictured in the middle
panel at the top is a separate value, `Table.fluid`, in its own module. A
page that never imports it never downloads it:

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

**The same table, configured once.** An application usually wants every table
to share defaults. `Table.configure` locks in the options that stay constant
and returns a `view` needing only what changes:

```ts
const AppTable = Table.configure({ base: { style: Striped, fluid: Table.fluid } })

export const ordersTable = (h: HtmlBuilder<never>) =>
  AppTable.view({ columns: [{ header: 'Order', value: row => row.id }], rows: invoices }, h)
```

Over forty components ship a `configure` helper. Components with internal
state, such as whether a listbox is open, package their state and reducer
together so you mount them on one field of your page's state instead of
copying a state machine. Each example on the
[table's page](https://foldkit-plus.pages.dev/components/table) is the whole
module that draws it.

## What it saves: 27.8 kB off every breadcrumb page

A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, minified and
compressed with brotli. In 0.40 a breadcrumb could fold its middle steps into
a menu, so it imported our Menu component for every trail, folded or not. In
0.41 the fold is a value you pass (`max` sets how many steps stay visible):

```diff
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
```

Minified and compressed with brotli, a page of just a trail is 68.4 kB; with
the menu passed it is 96.2 kB.
[A build test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts)
fails if the menu ever reaches a plain trail page again. Table's highlight
and checkboxes, each chart kind, the card group's highlight and the image
cropper's zoom slider became opt-in values the same way.

The second saving is freezing styles with `foldkit-mixins/vite`. Running
style modules at build time cut our design-system example from 220.7 kB to
184.2 kB brotli—and moving the catalog into lazy islands later brought its
initial bundle to 149.8 kB, held by its
[size budget](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts).

## Build your own component from the same parts

When configuring is not enough, you can build a component from the same parts
the library uses. In 0.41 each part declares what it owns and is checked when
assembled. Two common problems show how.

**Two handlers for one key.** A search field wants Escape to clear its query,
the dialog around it wants Escape to close, and your app wants Enter to
submit. In 0.40 a second keyboard behaviour on the same element conflicted,
even when the two wanted different keys.

Now `Behaviors.Keys` owns key handling for a slot, and each binding is a
named *route*: the keys it listens for, plus a handler returning Effect's
`Option.some(event)` to handle the press or `Option.none()` to let it pass
through. Two routes claiming the same key throw when defined, naming both.
Below, the search field's slots (`SearchSlots`) and events (`Message`) are
declared ahead of the snippet:

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

Shipped components that handle keys (Command, SearchField, Tabs, Menubar and
others) accept your routes beside their own the same way.

**Focus that falls to the page.** Delete the focused row of a list, or clear
a field with its own focused clear button, and the browser drops focus onto
`document.body`. A keyboard user is thrown back to the top. `FocusRecovery`,
in `foldkit-primitives` (our package of headless interaction blocks), moves
focus along a fallback chain the moment the focused part disappears, while
leaving focus alone if the user already moved elsewhere.

Here a removed row hands focus to the next row, else the previous one, else
the search input, and the clear button hands focus to the input (the view's
slots are declared ahead of the snippet):

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

The rest of this authoring work, covered in each package's README:

- **Keyboard reordering:** `Reorder` moves an item with Space, arrow keys and
  Escape, so lists work without a mouse.
- **Leaving rows made inert:** `Presence.behavior` stops a row animating out
  from taking a click or Tab focus.
- **Focus return for dialogs:** `FocusReturn` gives a closing dialog a
  fallback when the button that opened it is gone.
- **Accessibility obligations and browser checks:** an interaction pattern
  declares what roles, labels or navigation it needs, and assembling a
  component with a missing piece throws. Separate Chromium scenarios then
  drive the rendered widget and inspect its accessibility tree (automated
  checks, not a WCAG conformance claim).
- **Inspection:** `SlotView.describe` returns an assembled component's slots,
  styles and behaviours as plain data.
- **Agent hooks:** `Agent.part`, in `foldkit-agent`, marks which control
  exposes which action to an AI agent through your app's named events.
- **New building blocks:** `InlineEdit`, `SpatialNavigation`, `SwipeActions`
  and `Repeat`.

The library uses these parts itself: an audit of core behaviours fixed about
sixty bugs across shipped components, each backed by a regression test. The
new [Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery)
lists each part with live examples.

![The top of the Primitives gallery: its heading, a search box, the Media family with three primitives listed (MediaQuery, Breakpoints, platformFromUA) and, below them, the live PrefersDark example reading that the system asks for a light colour scheme.](/blog/2026-11-18-foldkit-plus-0-41/primitives-gallery.png "The Primitives gallery: the Media family and its live PrefersDark example")

## Describe your records once

Software copies itself in a second place, and it hurts more there. Take one
rule from a bank: "an open account is never overdrawn." In a typical web app
it is written four times—as a SQL constraint, a check in the server handler,
validation in the withdrawal form, and the condition disabling the Withdraw
button. Four people write those at four times. Eventually the button lets you
try what the server refuses, or the form rejects what the database would have
taken.

Foldkit Plus lets you describe your records and rules once, as plain data
with no database or network imports. The database adapter, the server, the
form and the page all read that one description. Foldkit Plus has shipped
declared entities, expressions, writes and permissions for months; 0.41 adds
named states, static law checking, Guard fixes, incident ids and an
experimental event-sourced backend. The rest of this section walks through
one bank account.

### Records and rules

`foldkit-entity` calls the description of one kind of record an *Entity*.
Each field uses a *Schema* from Effect (the TypeScript library Foldkit builds
on) to describe and validate its shape. A named condition on a record, such
as "is open", is a *state* declared with `Entity.refine`. Rules are built
with `Expr` as data rather than executable callbacks: an *invariant* holds on
every stored row, and a *transition* constrains how a row may change.

The code below uses the shorter forms (`Mutation.insert` and
`Mutation.update` shipped in 0.42; `in:`, `Entity.transition`, `Expr.implies`,
`input`, `decrement` and row-reading `when` since 0.43). The 0.41 forms are in
[the 0.41 domain guide](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/docs/entity.md).

```ts standalone
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

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

// Registers each rule on `Account`. `after` is the row after a write; `before`, as it was.
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

`in: Open` scopes a rule to open accounts, so a closed account with a
negative balance breaks nothing.

### One rule, every reader

Because each rule is data, every layer translates it into its own medium. On
the server, `foldkit-remote-drizzle` (our adapter for Drizzle SQL) turns the
two single-row invariants into SQL `CHECK` constraints. For SQLite, its
`checkConstraints` function emits (with `in: Open` lowered to `status = 'open'`):

```text
constraint "accounts_neverOverdrawn" check (((not ("accounts"."status" = 'open') or "accounts"."balance" >= 0)) is true)
constraint "accounts_withinDailyLimit" check (((not ("accounts"."status" = 'open') or "accounts"."withdrawn_today" <= 500)) is true)
```

The transition compares the row before and after a write, which SQL `CHECK`
cannot see, so the adapter reports it as enforced only by the server writer
instead of pretending. (`is true` prevents SQL from letting a `NULL`
condition pass.) The same rules compile into the `UPDATE` statement, run in
the form with each `message` beside its field, and run in the browser before
sending a request. The Drizzle adapter's
[README](https://foldkit-plus.pages.dev/remote/guides/remote-drizzle)
shows how constraints enter a migration.

When a rule needs a record the browser does not hold, the browser's
expression evaluator returns *unknown* with the reason and defers to the
server instead of guessing. A shared conformance suite holds every evaluator
(SQL, server, form and browser) to the same answers. Values computed from
related records, such as counts, are declared as *derived values* rather than
stored. New in 0.41 is a dedicated
[Expressions guide](https://foldkit-plus.pages.dev/entity/guides/expressions).

### States, and the writes between them

Before 0.41, states like "open" and "closed" had no names: every write
restated its own condition, and discovering the lifecycle meant reading every
write. A *declared write* describes a server change as data instead of a
request handler, so client and server share one contract. `foldkit-remote`
declares writes with `Mutation`, naming the state each write starts from and
leaves behind:

```ts
import { Mutation } from 'foldkit-remote'

// An amount is never negative.
const Amount = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))

// Starts open and empty; `Mutation.insert` includes `id` from `Account` alongside `set`.
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

// Deposit and withdraw take an `amount`, which is not a stored field of `Account`.
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

Three things follow with no custom handler. First, the server compiles
`CloseAccount` into one `UPDATE … WHERE` checking the id, starting state and
invariants, so closing an already-closed account returns a structured `Unmet`
refusal instead of a generic error. Second, `becomes: Closed` is checked
statically where declared. Third, the client predicts the write optimistically
while the request is in flight, then reconciles with the server's answer.

## Checking every write before it runs

Declaring rules does not prove that your writes keep them. On our example
shop, an automated check over every write and state caught a write that could
move an archived product back to draft. It also revealed that no declared
write ever archived anything—the demo's lone archived product came from raw
SQL.

`Laws.check`, new in 0.41, runs that analysis directly on your declarations
with no database. Passing `Operators.kernel` gives it the built-in arithmetic
operators used by `increment` and `decrement`. Here is its output for the
bank account above:

```ts
import { Laws, Operators } from 'foldkit-entity'

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

Read it from the top. Closing moves every open account to `Closed`, and
nothing leaves `Closed`, so it is marked *terminal* (an observation, not an
error). A deposit cannot overdraw an account, proved from bounds: `balance`
starts at `>= 0` and `amount` is `>= 0`, so their sum is `>= 0`. Deposits
cannot break the daily limit because they never touch `withdrawnToday`, and
closing breaks neither number rule because both apply only to open accounts.

The `refused` line is a real bug in `WithdrawMoney` as written. It checks the
balance, not the day's total, and the report prints the exact counterexample:
500 already withdrawn today, balance 1, withdrawal 1, leaving 501. One extra
condition fixes it:

```diff
-  when: ({ row, input }) => Expr.lte(input.amount, row.balance),
+  when: ({ row, input }) =>
+    Expr.and(Expr.lte(input.amount, row.balance), Expr.lte(Expr.add(row.withdrawnToday, input.amount), 500)),
```

With that condition added, the refusal disappears:

```text
WithdrawMoney   x withinDailyLimit            undecided: it rests on comparing amount with balance and withdrawnToday with amount, which intervals alone cannot use
```

What stays *undecided* is relational arithmetic: a withdrawal is safe because
`amount` is compared against `balance`, a relationship between two variables
rather than a bound on one. Adding a solver pass behind `Laws.check` to
settle those pairs is next. `Laws.check` itself shipped in 0.41; interval
bounds, counterexample witnesses and the totals line arrived in 0.43.

For rules a static check leaves undecided, 0.41 adds two tools in
`foldkit-remote/testing`. `Scenario` defines a test case as data (initial
rows, caller, clock, write and expected result) and replays it across every
backend you supply. `Walk.run` drives seeded random event sequences through
your app, checks your laws after every step, and requires a generator for
every event variant so new ones cannot be missed. You can also print the
report from the command line with `npx foldkit-plus laws <module>`.

The same idea extends to local and synced state. Shared offline documents in
`foldkit-sync` can declare document *laws* (rules checked after every synced
edit), and a `foldkit-remote` client's `Data.can` helper tells the UI whether
a write would be refused so the Withdraw button disables on a closed account
before it is clicked. See the
[domain guide](https://foldkit-plus.pages.dev/entity/guides/domain) and the
[Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) for the full
workflow.

## Guard: who may read and change what

Permissions usually end up scattered as one-off checks on every endpoint and
component. Miss one and you have a hole; let two disagree and the UI offers
actions the server rejects. `foldkit-guard` declares who may do what once,
using the same `Expr` language, and enforces it on every query and write.
Authentication stays separate: who is asking comes from your own auth layer,
or from `foldkit-auth` over
[Yielded Auth](https://github.com/yielded-dev/auth) sessions.

A rule comparing the user and the record ("is the owner") is an expression
both SQL and the browser can read. A rule about the user alone ("is an
admin") is declared by name, with its implementation provided only on the
server so it never ships to the browser:

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

// Attaching rules returns a guarded Entity handle; `Write` covers create, update and delete.
const Owned = Account.pipe(Guards.attach(Bank, { row: { Read: [Bank.isOwner], Write: [Bank.isOwner] } }), Guards.may)
```

`Guards.may` asks the server to send each row's allowed actions alongside the
data. **On the server**, the Drizzle adapter injects the `Read` rule into
every query—by id, in lists and in counts—so an unauthorized account looks
identical to a missing one. Every write is re-checked in the `UPDATE`
statement itself:

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

// Server-only implementations for user-only rules (none here).
const Policy = Bank.implement({})

// The Read rule compiled as a condition added to every Drizzle query on this table.
export const visible = GuardDrizzle.visible(Policy, [Owned])
```

**On the page**, the same rule decides which controls to show. Below, `row`
is an account selected with `may: true`:

<!-- docs-check
import type { Selected } from 'foldkit-entity'
declare const row: Selected<typeof Card>
-->
```ts
const Card = Entity.select(Owned, { balance: true, may: true })

// Show Withdraw when the server said this reader may update the account.
export const showWithdraw = May.can(row.may, 'Update')
```

That flag is only a UI hint: a button shown by mistake still hits the
server's refusal.

**What 0.41 changed.** Guard itself shipped in 0.17.0. Auditing its README
claim by claim caught a real bug: rules that depend on another record (such
as household membership) cannot be decided from one row alone. The server
omits an answer for those, and the client used to treat that omission as
"no", locking editable fields in CRUD forms built with `foldkit-crud`. Now
`May.answer` returns yes, no or none, and `May.refused` is true only for a
definite no, so forms stay editable and let the server check the rule on
submit. Single-record checkers also reject cross-record rules at setup, and
every server adapter refuses the raw `Account` handle once guard rules are
attached.

To see Guard live, open [Chirp](https://foldkit-chirp-demo.pages.dev/), a
small Twitter-like demo whose server runs in your browser. Switch users and
watch Edit and Delete follow the rules: in Chirp, admins may edit any post,
while only the author may delete one.

![Chirp signed in as Ada Lovelace: her own post shows both Edit and Delete buttons, while Grace Hopper's post below it shows Edit (because Ada is an admin) and no Delete.](/blog/2026-11-18-foldkit-plus-0-41/chirp-guard.png "Chirp signed in as Ada Lovelace: Edit and Delete on her own post, Edit only on Grace Hopper's")

The same audit found five places where raw server errors reached the browser,
from database driver messages to refusals that leaked hidden rows. Now any
server-side failure returns `"Internal error"` plus an *incident* id (read on
the client via `RemoteData.incident`), while the full cause goes to server
diagnostics under that id. Intentional user-facing error text must be marked
explicitly with `RemoteServer.tell`, and write responses are filtered to what
the caller may read.

## Putting an event-sourced server behind Remote

Everything above assumed rows stored in SQL. Some teams use *event sourcing*
instead: the server appends events ("money deposited") rather than updating
rows in place, and folds those events into read views.

`foldkit-remote-domain` (new in 0.41 at `0.1.0`, experimental) puts an
[Alchemy Domain](https://github.com/alchemy-run/alchemy)
(`@alchemy.run/domain`) server behind `foldkit-remote`. Your UI keeps the
same queries, mutations, optimistic updates and refusals; only the backing
authority changes. The adapter wraps Alchemy's own typed client directly so
there is still only one owner of the data.

Suppose your Alchemy server exposes `BankApi` with a `DepositMoney` command
and a `Balance` view holding `{ balance, revision }`. Here are the Foldkit
declarations and bindings that connect the page to it:

<!-- docs-check standalone
import * as Domain from '@alchemy.run/domain'
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
-->
```ts
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'

const AccountBalance = Entity.define(
  'AccountBalance',
  Schema.Struct({ id: Schema.String, balance: Schema.Number, revision: Schema.Number }),
)
const Deposit = Mutation.make('Deposit', { Input: { id: Schema.String, amount: Schema.Number }, Output: {} })

export const reads = DomainRemote.view(AccountBalance, BankApi, 'Balance', { revision: 'revision' })
export const deposits = DomainRemote.command(Deposit, BankApi, 'DepositMoney', {
  entity: AccountBalance,
  target: input => input.id,
  input: input => ({ amount: input.amount }),
})
```

When constructed, those bindings check that the view provides every declared
field and that names match `BankApi`. The
[package page](https://foldkit-plus.pages.dev/remote/guides/remote-domain)
shows the one call that mounts them against a running Api.

**Handling eventual consistency.** In an event-sourced server, a command
commits before its read view catches up. Without protection, a read right
after a deposit can return the stale balance and visibly roll back your
update. In 0.41, Remote rows can carry a *revision* number so older copies
are ignored. Writes whose read view lags return a *read-after token* (the
command's receipt), and the client polls with backoff until the view catches
up. Both mechanisms work for any Remote backend, not only Alchemy.

You can also compile a declared Foldkit write directly into an Alchemy
command so your Entity rules run inside the aggregate, or wrap an existing
Alchemy command when you do not need client-side prediction.

**Limits today** (from the package README):

- Pins `@alchemy.run/domain` at `2.0.0-beta.86` and tracks upstream changes.
- Supports forward-paged lists and single-record relations only; live reads
  with relations are refused.
- Tested against Domain's in-memory host and local HTTP only—no production
  deploy, Cloudflare Durable Objects, or WebSocket transport yet.

Start with
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

### What is new in 0.41, and what shipped earlier

| Capability | First shipped |
| --- | --- |
| Entities, relations and derived values | 0.7.0 |
| Expressions in queries, compiled to SQL | 0.8.0 |
| Declared writes and permission rules (`foldkit-guard`) | 0.17.0 |
| Invariants | 0.33.0 |
| Cross-record conditions, viewer/clock rules and client expression reader | 0.36.0 |
| Named states, checked transitions, `Laws.check`, `Scenario`, `Walk` and `Data.can` | 0.41.0 |
| Guard "unknown is not no", incident ids, row revisions, Alchemy adapter, Expressions guide | 0.41.0 |

## Upgrading from 0.40

Most breaking changes are renames, so the TypeScript compiler lists every
site to update. [Upgrading to 0.41](../upgrading-0.41.md) covers every
package with before-and-after diffs. Four UI changes compile either way, so
check them by eye:

1. **The default theme** casts shadows, rounds corners more and deepens the
   accent; the upgrade guide lists the five settings that restore 0.40's
   look.
2. **A card group** draws its pointer highlight only when you pass
   `fluid: Card.fluid`.
3. **An image cropper** draws its zoom slider only when you pass
   `zoom: ImageCropper.zoomSlider()`.
4. **A color picker's eyedropper** is off unless you pass `eyedropper`.

On the data side, three behaviour changes apply: a write's `when` condition
may no longer read who is asking or the clock (use Guard instead), lists
ordered by text need an explicit collation, and server failures return an
incident id.

## Also in 0.41

- **FileUpload**, a file picker supporting drop, pick and paste, per-file
  refusals, previews and retries
  ([page](https://foldkit-plus.pages.dev/components/file-upload)).
- **CodeBlock** marks added, removed and highlighted lines and folds long
  blocks behind a toggle button
  ([page](https://foldkit-plus.pages.dev/components/code-block)).
- **Page builder, rich text and data grid:** finger-sized drag handles, a
  standard formatting toolbar with a "More" menu, and copying a grid
  selection as an HTML table
  ([builder](https://foldkit-plus.pages.dev/composition/guides/mixins-builder),
  [rich text](https://foldkit-plus.pages.dev/richtext),
  [grid](https://foldkit-plus.pages.dev/data-grid)).
- **Selected text** adopts the theme's accent colour.
- **Website:** every component page is built from live example modules,
  alongside the new Primitives gallery.
- **Chrome 157 tint fix:** pale tints written with CSS relative colour syntax
  lost their hue and painted pink; tints now use OKLab.
- **Fixes:** an input mask scrambling typed digits, server-data state failing
  to survive a dev reload, scroll restoration on reload, and duplicate writes
  from two tabs.

Every change is listed in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

## See it, try it

- [The table's page](https://foldkit-plus.pages.dev/components/table), and
  the [component pages](https://foldkit-plus.pages.dev/components) for the
  other ninety.
- [The widgets demo](https://foldkit-widgets-demo.pages.dev/), a small
  application using many components together.
- [Chirp](https://foldkit-chirp-demo.pages.dev/), for a declared domain,
  writes and permissions in one running app.
- [The registry demo](https://foldkit-registry-demo.pages.dev/), for offline
  edits across two devices: press *Go offline* on one, edit, then *Go
  online*.

![The widget showcase in a dark scheme: a Toolbar with Bold, Italic, Strikethrough and Link, a Mute toggle, a left, center and right toggle group, an accordion with Billing, Team and API keys, and a Delete project button.](/blog/2026-11-18-foldkit-plus-0-41/widgets-dark.png "The widget demo in a dark scheme")

Next we are giving dialogs and popovers the same one-call drawing the table
has, and adding a solver behind `Laws.check` for relational rules like
`amount <= balance`.

To try it, install `foldkit-mixins-ui` along with Foldkit, its unstyled
`@foldkit/ui` components and Effect:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

Then draw the table from [One table, three variations](#one-table-three-variations),
or start the data side from one record with
[One domain declaration](https://foldkit-plus.pages.dev/entity/guides/domain).
