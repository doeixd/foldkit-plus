# Take a form's limits and guards from its metakit declaration

Your input Schema already says an amount is above zero and at most 10,000.00,
and your withdrawal rule already says nobody takes out more than the balance.
Without help you write both again in the view: `min`, `max` and `step` on the
input, and a `disabled` check on the button that drifts from the real rule.
When those rules are written with [metakit](../../metakit/README.md), a
library that keeps Schema rules and state transitions as data a program can
read, `foldkit-form/metakit` reads them for you. It turns the Schema's bounds
into input attributes and judges the transition against what has been typed so
far.

## Read input attributes from the Schema

`Declared.of(form)` reads the form's input Schema once, through metakit's
`Inspect.fieldSpecs`, and gives each key a constraint: its bounds, its literal
options, its domain type, and the HTML attributes those imply. This form edits
an amount of US dollars, which metakit's `Money` type stores as whole cents:

```ts
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { Declared } from 'foldkit-form/metakit'
import { Expr } from 'metakit'
import { Money } from 'metakit/domain'

const Usd = Money.make('USD')
const WithdrawInput = Schema.Struct({
  amount: Usd.pipe(
    Expr.refine($ =>
      Expr.all(Money.gt($, Money.minor('USD', 0)), Money.lte($, Money.minor('USD', 1_000_000))),
    ),
  ),
})
const WithdrawForm = Form.make('Withdraw', Form.input(WithdrawInput), {
  inputs: Declared.inputs(WithdrawInput),
})
const { constraints } = Declared.of(WithdrawForm)

const { min, max, step } = constraints.amount.attributes
// min: Option.some('0.01'), max: Option.some('10000.00'), step: Option.some('0.01')
```

The bounds come out in the units the input shows: dollars, not cents. "Above
zero" became `0.01`, because an amount held as whole cents has no value between
0 and 1 cent. Each attribute is an Effect `Option`, none when the Schema says
nothing about it, so your view adds only the attributes that are there:

<!-- docs-check
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
declare const h: HtmlBuilder<typeof WithdrawForm.Message.Type>
-->

```ts
h.input([...Option.toArray(Option.map(min, h.Min)), ...Option.toArray(Option.map(max, h.Max))])
```

What each kind of key gets:

| The key's Schema | `type` | `step` | Bounds shown as |
| --- | --- | --- | --- |
| `Schema.Int` | `number` | `1` | Whole numbers; an exclusive bound becomes the next one |
| `Schema.Number` | `number` | `any` | Numbers; an exclusive bound is left to validation |
| `Money` or `Decimal` | `number` | One unit at the scale (`0.01`) | Whole units (`12.50`) |
| `CalendarDay` | `date` | none | Days (`2026-01-01`) |
| Text, a flag, literals | none | none | none |

HTML has no exclusive bound, so `Schema.Number.check(Schema.isLessThan(1))`
gives no `max`; the key's own validation still refuses 1. The constraint keeps
the bound itself as `exclusiveMax`, with `min`, `max`, `literals` and `domain`
beside it as `Inspect.fieldSpecs` read them.

## Give money and dates a control that reads them

`Declared.inputs(schema)` gives each `Money`, `Decimal` and `CalendarDay` key a
control that matches its attributes. The example above passed it under
`inputs`. A `Money` key's draft is the amount in whole units (`12.50`), stored
as cents (`1250`); a `CalendarDay` key's draft is the day as `YYYY-MM-DD`, what
an `<input type="date">` holds. Without it, a `Money` key gets the plain
`Number` control, which reads `12.50` as 12.5 and fails the Schema's integer
check.

A control you name for the same key replaces the derived one:

<!-- docs-check
import { Input } from 'foldkit-form'
-->

```ts
Form.make('Withdraw', Form.input(WithdrawInput), {
  inputs: { ...Declared.inputs(WithdrawInput), amount: Input.text() },
})
```

For a `Money` key that should read and write amounts in the reader's locale
(`1.234,50 €`), use the control of `FieldRecipes.money({ currency, unit: 'minor' })`
from `foldkit-form-recipes` instead. It stores the same whole minor units, at
the scale the currency itself uses.

[`foldkit-mixins-form`](../../mixins-form/README.md#renderers) draws each kind
of control with a renderer, and ships none for these two: pass one under
`renderers`, keyed `CalendarDay` and `Decimal`. A renderer can tell them apart
with `Declared.CalendarDay.is(control)` and `Declared.Decimal.is(control)`; the
`Decimal` control's data is the domain's own, so it can show a `Money` key's
currency.

## Refuse an action its guard refuses

A metakit `Transition` is a state change with a `when` guard: a withdrawal
goes through when the account is open and the amount is within the balance.
`can(model, transition, state)` judges that guard with the form's values as the
transition's input and `state` as what you know of the account:

```ts
import { Eq, Transition, Verdict } from 'metakit'

const Account = Schema.Struct({ balance: Usd, frozen: Schema.Boolean })
const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(Eq.is(state.frozen, false), Money.lte(input.amount, state.balance)),
  apply: ({ state, input }) => [Transition.set(state.balance, Money.sub(state.balance, input.amount))],
})
const { can } = Declared.of(WithdrawForm)

const verdict = can(WithdrawForm.initial, Withdraw, { balance: Money.minor('USD', 10_000), frozen: false })
Verdict.isFalse(verdict) // false: nothing is typed yet, so the guard is not decided
```

The answer has three values, not two:

- **`True`**: every value the guard reads is known, and it holds.
- **`False`**: it fails, whatever the unknown values turn out to be. A frozen
  account is `False` before an amount is typed.
- **`Unknown`**: the guard reads a value that is not typed yet, does not
  decode yet, or comes from an opaque function. A draft that does not read as
  an amount is `Unknown`, not `False`.

Refuse the control only on `False`, and leave it pressable on `Unknown`:

```ts
h.button([...(Verdict.isFalse(verdict) ? [h.AriaDisabled(true)] : [])], ['Withdraw'])
```

`Unknown` is not a promise that the withdrawal will go through. Run the
transition in your `update` when the form submits (`Transition.run` refuses it
there if the guard fails), and use `aria-disabled` rather than `disabled`, as
the form's own submit button does, so Enter still reaches your `update`.

## Next

- Write the rules and transitions themselves: [metakit's getting started](../../metakit/docs/getting-started.md)
- Decide when a form validates and what it says: [the form's validation](../README.md#validation)
- Draw the form with accessible controls: [`foldkit-mixins-form`](../../mixins-form/README.md)
