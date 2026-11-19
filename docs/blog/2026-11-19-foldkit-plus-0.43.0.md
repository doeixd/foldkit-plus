---
title: Composition over copy and paste: Foldkit Plus 0.43
description: Build interactive components, declare domain rules across your app, and check whether changes keep those rules.
date: 2026-11-19
author: Claude
tags: [release, mixins-ui, entity, guard, remote-domain, bundle-size]
---

# Composition over copy and paste: Foldkit Plus 0.43

A searchable picker looks small until you build it. A person types a name,
moves through matching results with the keyboard, and chooses one. Your app
needs the selected person; the control also needs to track the typed text,
the highlighted option, and whether the menu is open.

[Try the combobox examples](https://foldkit-plus.pages.dev/components/combobox):
search for a city, select several as chips, or explore the loading and empty
states. They are part of Foldkit Plus, a set of open-source packages for
[Foldkit](https://foldkit.dev/), a TypeScript framework where a page's state
lives in one object and changes through named events.

This release also helps you check the rules behind an interface. A rule such
as “an open account is never overdrawn” must hold for every change your app
can make. Foldkit Plus 0.43 improves its checker so it can reason about more
numeric rules and show an example when a change breaks one.

## A searchable picker without building the interaction

Imagine assigning a person to an issue. The reader types part of a name,
navigates the matches, and chooses someone. Your application owns the people
and the selected assignee; the picker handles the interaction and reports
the selection back to the application.

The [basic combobox example](https://foldkit-plus.pages.dev/components/combobox)
uses cities instead of people. Its application state stores the selected city
alongside the combobox's own state, which tracks the typed text and highlighted
option. The view connects the two; see the
[complete example](https://github.com/doeixd/foldkit-plus/blob/v0.43.0/examples/site/src/examples/combobox/basic.ts)
for the state and event handling around it.

The important part of the view is small. Here `model.box` is the picker's
state, and `model.city` is the application's selected city. The callback
wraps interaction events in a message the application can handle. `style`
is the chosen look and `h` is Foldkit's HTML builder; the complete example
supplies both alongside the page's state and message handler:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes } from 'foldkit-mixins-ui'
import type { HtmlBuilder } from 'foldkit/html'
const fixtureCities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const fixtureCity = Combobox.one(fixtureCities)
const App = Bundle.compose({ city: Schema.Option(Schema.Literals(fixtureCities)) }).pipe(
  Bundle.withChild('box', Bundles.Combobox, {
    args: { id: 'city', animated: true },
    onOut: out => model => ({ model: { ...model, city: fixtureCity.picked(model.city, out) } }),
  }),
)
declare const model: typeof App.Model.Type
declare const onMessage: (message: typeof App.Message.Type) => typeof App.Message.Type
declare const h: HtmlBuilder<typeof App.Message.Type>
const style = Recipes.Combobox.style()
-->
```ts
import { Combobox } from 'foldkit-mixins-ui'

const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich'] as const
const City = Combobox.one(cities)

Combobox.view(
  {
    model: model.box,
    onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
    label: 'City',
    choice: City,
    value: model.city,
    filter: Combobox.contains,
    placeholder: 'Find a city',
    style,
    mixins: Combobox.fluid,
  },
  h,
)
```

The picker filters the cities as you type and reports a selection. The
example's application handler uses `City.picked` to store that selection in
`model.city`. An app can then use it to filter a list or submit a form.

The same component can select several values as chips, or display a loading
message and an empty result. The application still owns fetching and loading
state; the component displays what it is given. Another example adds an
application rule that limits the selection to three, while keeping the
picker's interaction. These examples are on the
[combobox page](https://foldkit-plus.pages.dev/components/combobox), with
their complete source. You can also change the component's look by targeting
its named parts while retaining its interaction behavior.

## Building blocks for your own interface

When a finished component is not the right fit, Foldkit Plus also offers
smaller building blocks. Keyboard routes let behaviors share key handling;
focus recovery can move focus to a useful place when the focused control is
removed. Explore these and other examples in the
[Primitives gallery](https://foldkit-plus.pages.dev/primitives).

## Describe your records once

Take one rule from a bank: "an open account is never overdrawn." In a typical
web app it is written four times: as a SQL constraint, a check in the server handler,
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

## Check your writes before they run

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

Permissions often end up scattered across endpoints and components.
`foldkit-guard` lets you declare who may read or change a record alongside
your domain rules. The server enforces the rules; the interface can use
permission information to decide which controls to show.

Try [Chirp](https://foldkit-chirp-demo.pages.dev/) and switch users: admins
can edit any post, while only the author can delete it. The
[Guard guide](https://foldkit-plus.pages.dev/guard/guides/how-guard-works) explains how
to declare and enforce those rules.

![Chirp signed in as Ada Lovelace: her own post shows both Edit and Delete buttons, while Grace Hopper's post below it shows Edit because Ada is an admin and no Delete.](/blog/2026-11-18-foldkit-plus-0-41/chirp-guard.png "Chirp shows different actions for posts by different authors")

## Putting an event-sourced server behind Remote

Some teams record changes as events, such as “money deposited”, and build
the records readers see from those events. The experimental
`foldkit-remote-domain` adapter connects an
[Alchemy Domain](https://github.com/alchemy-run/alchemy) server to Remote,
so an application can use Remote's queries and writes with that backend.

The adapter targets a specific Alchemy beta and has been tested with its
in-memory host and a local HTTP server. For its current limits and an
example, see [An event-sourced domain behind Remote](https://foldkit-plus.pages.dev/remote/guides/event-sourced-domains).

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

- [The combobox page](https://foldkit-plus.pages.dev/components/combobox), and
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

Next we are giving dialogs and popovers the same one-call drawing other
components have, and teaching the checker to settle rules that compare two
numbers, like
`amount <= balance`.

To try it, install `foldkit-mixins-ui` along with Foldkit, its unstyled
`@foldkit/ui` components and Effect:

```bash
pnpm add foldkit foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui effect
```

Then try the [combobox examples](https://foldkit-plus.pages.dev/components/combobox).
For the data side, add the packages for records, server data and permissions:

```bash
pnpm add foldkit-entity foldkit-remote foldkit-guard
```

and start from one record with
[One domain declaration](https://foldkit-plus.pages.dev/entity/guides/domain).
