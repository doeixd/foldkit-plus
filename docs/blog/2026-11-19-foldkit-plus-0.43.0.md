---
title: Composition over copy and paste: Foldkit Plus 0.43
description: Why Foldkit Plus components need no code generation, how to declare domain rules once across SQL, server and UI, and what else is new.
date: 2026-11-19
author: Claude
tags: [release, mixins-ui, entity, guard, remote-domain, bundle-size]
---

# Composition over copy and paste: Foldkit Plus 0.43

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
buttons, fields, menus, dialogs, tables and charts. You choose each variation
by passing arguments, and a page ships only the code for the arguments it
passes.

![Three table examples side by side: Basic, a four-row invoice table; Following highlight, the same table with the second row shaded; Configure once, three small tables stacked, one roomy, one dense and one in the style picked above.](/blog/2026-11-18-foldkit-plus-0-41/table-three-ways.png "Three of the Table examples on the components page: Basic, Following highlight and Configure once")

Business rules suffer the same drift. A rule such as "an open account is
never overdrawn" usually gets copied into SQL constraints, server handlers,
form validation and button state. Foldkit Plus lets you declare both UI
variations and domain rules once, and then checks them. You do not need to
know Foldkit to read on: the examples are functions that return HTML, or
plain declarations.

**If you only read one thing:** building interfaces, read
[One table, three variations](#one-table-three-variations); modelling data,
read [Describe your records once](#describe-your-records-once); upgrading,
read [Upgrading](#upgrading).

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
projects until two tables that look alike behave differently. A generator
changes none of that: it writes the same copy faster.

The usual alternative is boolean flags: `<Table striped hoverHighlight
selectable>`. You keep receiving fixes, but you meet two other limits. When
the variation you need is missing, you wait or fork. And a flag such as
`hoverHighlight: true` pulls the highlight's code into every bundle, because
the library cannot know which pages will set it.

Here, an argument to a component is one of three things:

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
shipped look, written as data with named choices called a *recipe*.

The CSS comes from `foldkit-mixins`, our styling package, which turns each
recipe into scoped CSS classes. For production, its Vite build plugin
computes those classes at build time, so the browser downloads class names
and CSS rather than the code that computes them; on our design-system
example, which draws most of the catalogue, that took the JavaScript from
220.7 kB to 184.2 kB, compressed.

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

`add` refuses a choice name the recipe already owns, so you cannot replace a
shipped look by accident.

**A feature you pass.** The gliding hover highlight pictured in the middle
panel at the top is a separate value, `Table.fluid`. A page that never
imports it never downloads it:

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

The chart kinds, the table's checkboxes, the card group's highlight and the
image cropper's zoom slider are values you pass the same way.

**The same table, configured once.** An application usually wants every table
to share defaults. `Table.configure` locks in the options that stay constant
and returns a `view` needing only what changes:

```ts
const AppTable = Table.configure({ base: { style: Striped, fluid: Table.fluid } })

export const ordersTable = (h: HtmlBuilder<never>) =>
  AppTable.view({ columns: [{ header: 'Order', value: row => row.id }], rows: invoices }, h)
```

About fifty components have a `configure`. Components that remember
something, such as whether a listbox is open, come with that state and the
function that updates it packaged together, so you place them on one field
of your page's state instead of writing the wiring yourself. Each example on
the [table's page](https://foldkit-plus.pages.dev/components/table) is the
whole module that draws it.

## Build your own component from the same parts

When configuring is not enough, you can build a component from the same parts
the library uses, and each part says what it needs and is checked when you
put the component together. Two common problems show how.

**Two handlers for one key.** A search field wants Escape to clear its query,
the dialog around it wants Escape to close, and your app wants Enter to
submit. Our styling package lets one keyboard handler own an element, so
two separate behaviours that both listen for keys clash, even when they want
different keys.

`Behaviors.Keys` gives you that one handler, built from named *routes*. A
route lists the keys it listens for and a function that returns
`Option.some(event)` to handle the press or `Option.none()` to let it pass
on (`Option` comes from Effect, the TypeScript library Foldkit is built on).
Two routes that claim the same key throw as soon as they are defined, naming
both, so a clash shows up when you write it, not when a user presses the key.
Below, the search field's parts (`SearchSlots`: its container and its input)
and its events (`Message`: the query changed, or it was submitted) are
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
in `foldkit-primitives` (our package of interaction building blocks with
behaviour but no look), moves
focus along a fallback chain the moment the focused part disappears, while
leaving focus alone if the user already moved elsewhere.

Here a removed row hands focus to the next row, else the previous one, else
the search input, and the clear button hands focus to the input (the view's
parts are declared ahead of the snippet):

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

More parts, each covered in its package's README:

- **Keyboard reordering:** `Reorder` moves an item with Space, arrow keys and
  Escape, so lists work without a mouse.
- **Leaving rows made inert:** `Presence.behavior` stops a row animating out
  from taking a click or Tab focus.
- **Focus return for dialogs:** `FocusReturn` gives a closing dialog a
  fallback when the button that opened it is gone.
- **Accessibility you can check:** an interaction pattern declares the roles,
  labels and keyboard navigation it needs, and putting a component together
  with a piece missing throws, so a missing label fails while you develop,
  not for a user. Browser tests then drive the rendered component in
  Chromium and read what a screen reader would. These are automated checks,
  not a claim of conformance to WCAG, the web accessibility standard.
- **Inspection:** `SlotView.describe` returns an assembled component's parts,
  styles and behaviours as plain data, for a debugging panel or your docs.
- **AI agents:** `Agent.part`, in `foldkit-agent`, marks which control does
  which action, so an agent can act through your app's named events.
- **More building blocks:** `InlineEdit` (edit a value in place),
  `SpatialNavigation` (arrow keys across a board), `SwipeActions` (actions
  behind a row) and `Repeat` (a button that repeats while held).

The library's own components are built from these parts. The
[Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery)
lists each one with live examples.

![The top of the Primitives gallery: its heading, a search box, the Media family with three primitives listed (MediaQuery, Breakpoints, platformFromUA) and, below them, the live PrefersDark example reading that the system asks for a light colour scheme.](/blog/2026-11-18-foldkit-plus-0-41/primitives-gallery.png "The Primitives gallery: the Media family and its live PrefersDark example")

## Describe your records once

Software copies itself in a second place, and it hurts more there. Take one
rule from a bank: "an open account is never overdrawn." In a typical web app
it is written four times: as a SQL constraint, a check in the server handler,
validation in the withdrawal form, and the condition disabling the Withdraw
button. Four people write those at four times. Eventually the button lets you
try what the server refuses, or the form rejects what the database would have
taken.

Foldkit Plus lets you describe your records and rules once, as plain data
with no database or network imports. The database adapter, the server, the
form and the page all read that one description. The rest of this section
walks through one bank account.

### Records and rules

`foldkit-entity` calls the description of one kind of record an *Entity*.
Each field uses a *Schema* from Effect (the TypeScript library Foldkit builds
on) to describe and validate its shape. A named condition on a record, such
as "is open", is a *state* declared with `Entity.refine`. Rules are written
with `Expr` as data, which the database, the server and the browser can each
read, rather than as functions only one of them can run. An *invariant* is a
rule every stored row must keep. A *transition* is a rule about how a row may
change.

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

Because each rule is data, every layer reads it in its own terms. On the
server, `foldkit-remote-drizzle` (our adapter for the Drizzle SQL toolkit)
turns the two single-row invariants into SQL `CHECK` constraints. For
SQLite, its `checkConstraints` function writes:

```text
constraint "accounts_neverOverdrawn" check (((not ("accounts"."status" = 'open') or "accounts"."balance" >= 0)) is true)
constraint "accounts_withinDailyLimit" check (((not ("accounts"."status" = 'open') or "accounts"."withdrawn_today" <= 500)) is true)
```

The transition compares the row before and after a write, which a `CHECK`
cannot see, so the adapter reports it as held by the server alone. The same
rules are checked in the statement that saves a row, in the form (each
`message` shown beside its field), and in the browser before a request is
sent. The Drizzle adapter's
[page](https://foldkit-plus.pages.dev/remote/guides/remote-drizzle) shows how
the constraints reach a migration.

When a rule needs a record the browser does not hold, the browser answers
*unknown* and leaves the decision to the server, so the page never shows a
guess as an answer. Values
computed from related records, such as counts, are declared as *derived
values* rather than stored. The
[Expressions guide](https://foldkit-plus.pages.dev/entity/guides/expressions)
teaches the whole language.

### States, and the writes between them

A *declared write* describes a change the server accepts as data, instead of
as a request handler, so client and server share one contract.
`foldkit-remote`, our package for server data, declares writes with
`Mutation`, each naming the state it starts from and the state it leaves:

```ts
import { Mutation } from 'foldkit-remote'

// An amount is never negative.
const Amount = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))

// Starts open and empty; the input is the account's `id` plus the fields in `set`.
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

What you get with no handler to write: the server turns `CloseAccount` into
one `UPDATE … WHERE` that checks the id, the starting state and the rules, so
closing an already-closed account comes back as an `Unmet` refusal your page
can show, not a generic error. And the page shows the write's result while
the request is in flight, then settles on the server's answer.

## Checking every write before it runs

Declaring rules does not prove that your writes keep them. `Laws.check` reads
your declarations, with no database, and tells you which write can break
which rule. Pass it `Operators.kernel`, the built-in arithmetic that
`increment` and `decrement` use. Here is its report for the bank account
above:

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

Each line under the states is a *pair*: one write against one rule (`x`
reads "against"). *Kept* means the write cannot break the rule, and
"enumerated" means the checker tried every row the write could start from.
Read it from the top. Closing moves every open account to `Closed`, and
nothing leaves `Closed`, so it is *terminal*, which is an observation, not an
error. A deposit cannot overdraw an account: the balance starts at zero or
more and the amount is never negative, so their sum is zero or more. It
cannot break the daily limit because it never touches `withdrawnToday`, and
closing breaks neither number rule because both apply only to open accounts.

The `refused` line is a real bug in `WithdrawMoney` as written. It checks the
balance, not the day's total, and the report shows the account that proves
it: 500 already withdrawn today, a balance of 1, a withdrawal of 1, leaving
501. One extra condition fixes it:

```diff
-  when: ({ row, input }) => Expr.lte(input.amount, row.balance),
+  when: ({ row, input }) =>
+    Expr.and(Expr.lte(input.amount, row.balance), Expr.lte(Expr.add(row.withdrawnToday, input.amount), 500)),
```

With that condition added, the refusal is gone. Two pairs stay *undecided*:
each depends on comparing two numbers with each other, the amount with the
balance, which the checker cannot settle. Cover those with a test.

Two tools in `foldkit-remote/testing` do that. `Scenario` writes a test case
as data (the starting rows, who asks, the time, the write and the expected
result) and runs it against every backend you give it. `Walk.run` drives
random sequences of events through your app and checks your rules after
every step. `npx foldkit-plus laws <module>` prints the report above from the
command line.

The same rules reach the page. A `foldkit-remote` client's `Data.can` tells
the UI whether a write would be refused, so the Withdraw button is disabled on
a closed account before anyone clicks it. Documents shared across devices with
`foldkit-sync` can declare rules of their own, checked after every edit. The
[domain guide](https://foldkit-plus.pages.dev/entity/guides/domain) and the
[Laws guide](https://foldkit-plus.pages.dev/entity/guides/laws) walk through
the full workflow.

## Guard: who may read and change what

Permissions usually end up scattered as one-off checks on every endpoint and
component. Miss one and you have a hole; let two disagree and the UI offers
actions the server rejects. `foldkit-guard` declares who may do what once,
using the same `Expr` language, and enforces it on every query and write.
Who is asking comes from your own sign-in system, or from `foldkit-auth`,
which reads [Yielded Auth](https://github.com/yielded-dev/auth) sessions.

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

// Attaching rules returns a guarded handle: pass this one everywhere. `Write` covers create, update and delete.
const Owned = Account.pipe(Guards.attach(Bank, { row: { Read: [Bank.isOwner], Write: [Bank.isOwner] } }), Guards.may)
```

`Guards.may` asks the server to send, with each row, what the reader may do
with it. **On the server**, the Drizzle adapter adds the `Read` rule to every
query (by id, in lists and in counts), so an account you may not see looks
exactly like one that does not exist. Every write is checked again in the
statement that saves it:

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

// Server-only implementations for rules about the user alone (none here).
const Policy = Bank.implement({})

// The Read rule, as a condition added to every Drizzle query on this table.
export const visible = GuardDrizzle.visible(Policy, [Owned])
```

**On the page**, the same rule decides which controls to show. Below, `row`
is an account the page read with `may` selected:

<!-- docs-check
import type { Selected } from 'foldkit-entity'
declare const row: Selected<typeof Card>
-->
```ts
const Card = Entity.select(Owned, { balance: true, may: true })

// Show Withdraw when the server said this reader may update the account.
export const showWithdraw = May.can(row.may, 'Update')
```

That flag is a hint for the UI: a button shown by mistake still meets the
server's refusal. Some rules cannot be decided from one row (may edit if you
belong to the household this account is in), and the server leaves those
unanswered. `May.answer` returns yes, no or none, and `May.refused` is true
only for a definite no, so a form stays editable and the server decides when
it is submitted.

To see Guard live, open [Chirp](https://foldkit-chirp-demo.pages.dev/), a
small Twitter-like demo whose server runs in your browser. Switch users and
watch Edit and Delete follow the rules: in Chirp, admins may edit any post,
while only the author may delete one.

![Chirp signed in as Ada Lovelace: her own post shows both Edit and Delete buttons, while Grace Hopper's post below it shows Edit (because Ada is an admin) and no Delete.](/blog/2026-11-18-foldkit-plus-0-41/chirp-guard.png "Chirp signed in as Ada Lovelace: Edit and Delete on her own post, Edit only on Grace Hopper's")

When something fails on the server's side, the browser gets "Internal
error" and an *incident* id, never the server's own error text, which could
reveal a database message or a hidden row. Your page reads the id with
`RemoteData.incident` and can show it to the user to quote; the full cause
is in the server's logs under the same id. Words meant for the user are sent
on purpose, with `RemoteServer.tell`.

## Putting an event-sourced server behind Remote

Everything above assumed rows stored in SQL. Some teams use *event sourcing*
instead: the server appends events ("money deposited") rather than updating
rows in place, and builds the rows readers see by folding those events.

`foldkit-remote-domain` (experimental) puts an
[Alchemy Domain](https://github.com/alchemy-run/alchemy)
(`@alchemy.run/domain`) server behind `foldkit-remote`. Your page keeps the
same queries, writes, instant results and refusals; only the server that
answers changes. Alchemy describes the model in its own terms: a *command*
asks for a change, an *aggregate* decides it, events record what happened,
a *view* folds them into rows, and an *Api* lists what clients may call.

Suppose your Alchemy server exposes `BankApi` with a `DepositMoney` command
and a `Balance` view holding `{ balance, revision }`. Here are the
declarations that connect the page to it:

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

// The record the page reads, and the write it sends (`Mutation.make`: a write the
// page names without declaring what it changes, since Alchemy decides that).
const AccountBalance = Entity.define(
  'AccountBalance',
  Schema.Struct({ id: Schema.String, balance: Schema.Number, revision: Schema.Number }),
)
const Deposit = Mutation.make('Deposit', { Input: { id: Schema.String, amount: Schema.Number }, Output: {} })

// Read balances from Alchemy's view; send Deposit as Alchemy's command.
export const reads = DomainRemote.view(AccountBalance, BankApi, 'Balance', { revision: 'revision' })
export const deposits = DomainRemote.command(Deposit, BankApi, 'DepositMoney', {
  entity: AccountBalance,
  target: input => input.id,
  input: input => ({ amount: input.amount }),
})
```

These bindings check, when they are created, that the view holds every field
the record declares and that the names match `BankApi`, so a mismatch fails
as the page starts rather than on a user's click. The
[package page](https://foldkit-plus.pages.dev/remote/guides/remote-domain)
shows the one call that connects them to a running Api.

An event-sourced server commits a command before its view catches up, so a
read straight after a deposit could show the old balance and seem to undo it.
Remote handles that for you: each row carries a *revision* number, an older
copy never replaces a newer one, and after a write the page reads again until
the view has caught up.

**Limits today:** it works with one beta of Alchemy Domain (`2.0.0-beta.86`);
lists are paged forward only and relations point at a single record; and it
has been tested against Alchemy's in-memory host and a local HTTP server, not
a production deploy. Start with
[An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

## Upgrading

Coming from 0.40, most breaking changes are renames, so the TypeScript
compiler lists every place to update; [Upgrading to 0.41](../upgrading-0.41.md)
has a before and after for each. Four changes compile either way, so check
them by eye: the default theme now casts shadows, rounds corners more and
deepens the accent (the guide lists the settings that bring the old look
back); a card group draws its pointer highlight only when you pass
`fluid: Card.fluid`; an image cropper draws its zoom slider only when you pass
`zoom: ImageCropper.zoomSlider()`; and a color picker's eyedropper is off
unless you pass `eyedropper`.

Coming from 0.41 or 0.42, little changes: CodeBlock's `collapsed` option
takes `{ lines, expanded, onToggle }`, and code that reads `Laws.check`'s
report has new cases to handle. The
[changelog](https://github.com/doeixd/foldkit-plus/blob/main/CHANGELOG.md)
lists every change.

## Also new

- **FileUpload**, a file field supporting drop, pick and paste, per-file
  refusals, previews and retries
  ([page](https://foldkit-plus.pages.dev/components/file-upload)).
- **CodeBlock** marks added, removed and highlighted lines and folds long
  blocks behind a button
  ([page](https://foldkit-plus.pages.dev/components/code-block)).
- **Page builder, rich text and data grid:** finger-sized drag handles, a
  standard formatting toolbar with a "More" menu, and copying a grid
  selection as an HTML table
  ([builder](https://foldkit-plus.pages.dev/composition/guides/mixins-builder),
  [rich text](https://foldkit-plus.pages.dev/richtext),
  [grid](https://foldkit-plus.pages.dev/data-grid)).
- **Selected text** takes the theme's accent colour.
- **Website:** every component page is built from live example modules, and
  the Primitives gallery shows the building blocks.
- **Fixes:** pale tints painted pink in Chrome 157, an input mask scrambled
  typed digits, server data did not survive a development reload, scroll was
  not restored on reload, and two tabs could send the same write twice.

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
has, and teaching the checker to settle rules that compare two numbers, like
`amount <= balance`.

To try it, install `foldkit-mixins-ui` along with Foldkit, its unstyled
`@foldkit/ui` components and Effect:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

Then draw the table from [One table, three variations](#one-table-three-variations).
For the data side, add the packages for records, server data and permissions:

```bash
pnpm add foldkit-entity foldkit-remote foldkit-guard
```

and start from one record with
[One domain declaration](https://foldkit-plus.pages.dev/entity/guides/domain).
