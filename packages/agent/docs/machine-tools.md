# Let an agent call your state machine's transitions

Say your account rules are written once, as a state machine: "withdraw" is allowed only while the account is open and only up to the balance, and the amount must be a positive number of cents. Handing those actions to an AI assistant usually means writing them a second time: a parameter schema for each tool, a check for when to offer it, and the same guard again before the action runs. The copies drift, and the assistant is offered a tool that then fails, or sends an amount your rules would refuse.

`machineTools`, from `foldkit-agent/metakit`, makes each of those tools from the rule itself. A tool's parameters come from the transition's input, it is offered only while the state allows it, and a call the rule refuses is turned down before anything changes.

This guide assumes you have a `foldkit-agent` contract: the list of your app's Messages (the actions your `update` function handles) that an assistant may send, declared with `Agent.expose`. The [package page](../README.md) shows how to write one and connect it to a running app.

## Write the rules as a metakit machine

[metakit](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/README.md) writes a rule as an expression your code can inspect, rather than a function it can only run. A **transition** is one step from one state to the next. It has an input Schema, a guard (`when`) that says when the step is allowed, and the writes it makes. A **machine** groups the transitions over one state:

```ts
import { Schema } from 'effect'
import { Eq, Expr, Num, Transition } from 'metakit'
import { Money } from 'metakit/domain'
import * as Machine from 'metakit/machine'

const Usd = Money.make('USD')
const Account = Schema.Struct({ balance: Usd, status: Schema.Literals(['open', 'frozen']) })

const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Withdraw: Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Usd.pipe(Expr.refine($ => Num.gt($, 0))) }),
      when: ({ state, input }) =>
        Expr.all(Eq.is(state.status, 'open'), Num.lte(input.amount, state.balance)),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Money.sub(state.balance, input.amount)),
      ],
    }),
    Freeze: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.is(state.status, 'open'),
      apply: ({ state }) => [Transition.set(state.status, 'frozen')],
    }),
  },
})
```

`Money.make('USD')` is an integer number of cents that remembers its currency, and `Expr.refine` adds a rule to a Schema that both decoding and metakit can read.

## Turn each transition into a tool

Your app keeps the account in its Model and has one Message per transition. Its `update` applies the transition through the machine, so the rule that runs is the one the tools were made from:

```ts
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({ account: Account })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Withdraw: { amount: Usd }, Freeze: {} })
type Message = typeof Message.Type

const update = (model: Model, message: Message): Model => {
  const [account] = Message.match(message, {
    Withdraw: input => AccountMachine.update(model.account, { _tag: 'Withdraw', input }),
    Freeze: () => AccountMachine.update(model.account, { _tag: 'Freeze', input: {} }),
  })
  return account === model.account ? model : { account }
}
```

`machineTools` takes your bound agent, the machine, and where the machine's state sits in your Model. It returns one function per transition, named as the machine names them. Call one with a description and put the result under the Message it sends:

```ts
import { Agent } from 'foldkit-agent'
import { machineTools } from 'foldkit-agent/metakit'

const BankAgent = Agent.forModel<Model>()
const Tools = machineTools({
  agent: BankAgent,
  machine: AccountMachine,
  state: model => model.account,
})

const BankContract = BankAgent.make({
  messages: BankAgent.expose(Message, {
    Withdraw: Tools.Withdraw('Withdraw money from the account'),
    Freeze: Tools.Freeze('Freeze the account'),
  }),
})
```

The contract now has two tools, `withdraw` and `freeze`. Their names are the transition keys in snake_case; a misspelled key such as `Tools.Withdrw` does not compile, and neither does a tool placed under a Message whose fields differ from the transition's input.

## What the assistant is shown

Every protocol adapter hands the assistant the same parameter schema. For `withdraw` it is:

```json
{
  "type": "object",
  "properties": {
    "amount": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "exclusiveMinimum": 0,
      "x-metakit-domain": { "kind": "money", "currency": "USD", "scale": 2 }
    }
  },
  "required": ["amount"],
  "additionalProperties": false
}
```

The `exclusiveMinimum` comes from the `Expr.refine` rule and the `x-metakit-domain` entry from `Money`, neither of which Effect's own JSON Schema can see. The rest is what Effect derives from the Schema. Where both give a bound, the tighter one is kept.

## When a tool is hidden, and when a call is refused

Before any input arrives, the guard is checked against the current state alone. That check has three answers: true, false, or unknown when it needs the input or calls code metakit cannot look into. Only false takes the tool away. Each adapter does what its protocol allows:

| Adapter | A tool whose guard is false |
| --- | --- |
| `foldkit-agent-mcp` | Left out of `tools/list`; the client is sent `tools/list_changed` when the Model changes |
| `foldkit-agent-webmcp` | Unregistered from the page, and registered again when the state allows it |
| `foldkit-agent-native` | Stays registered, since the registry is fixed at start; a call answers `ok: false` |
| `foldkit-agent-a2a` | Stays on the agent card, tagged `conditional`; a call is refused |

None of these protocols can mark a tool as disabled but visible, so hiding is the closest each offers.

A tool whose guard is unknown stays offered. When it is called, the guard runs on the state and the decoded input together, which always gives a plain yes or no. With 50 dollars in the account, `withdraw` with `{ "amount": 9000 }` is refused with `CapabilityUnavailableError` and the message `"withdraw" does not allow this input in the current state`; nothing is sent to `update`.

The state can also change between the moment the assistant lists the tools and the moment it calls one. Every call reads the state again first, so a `withdraw` sent after the account was frozen fails with `Capability "withdraw" is not available right now` and does not run.

A call is checked in this order, and the first failure is the answer:

1. Is the tool available in the current state?
2. Does the input decode? An amount of `0`, a string, or an extra field fails here as `InvalidInputError`.
3. Is this caller allowed (`authorize`, below)?
4. Does the guard allow this input in this state?

The guard runs after `authorize`, so a caller who may not use the tool learns nothing about the account from the answer.

## Send a different Message, or limit who may call

Pass an object instead of a description when the Message your app handles has a different shape from the transition's input, or when only some callers may use the tool:

```ts
interface Teller {
  readonly canPay: boolean
}
const PayMessage = defineMessageUnion({ Paid: { amount: Usd, source: Schema.Literal('Agent') } })
const TellerAgent = Agent.forModel<Model, Teller>()
const TellerTools = machineTools({
  agent: TellerAgent,
  machine: AccountMachine,
  state: model => model.account,
})

TellerAgent.expose(PayMessage, {
  Paid: TellerTools.Withdraw({
    name: 'pay',
    description: 'Pay out of the account',
    toMessage: ({ amount }) => ({ amount, source: 'Agent' as const }),
    authorize: ({ principal }) => principal.canPay,
  }),
})
```

- `name` replaces the default tool name.
- `toMessage` makes the Message's fields from the decoded input. Without it, the input is sent as the Message's fields unchanged.
- `authorize` receives the caller your host reports (its `principal`), typed by the agent you passed.

## Next

- Connect the contract to a running app, and see every error a call can fail with: [the package page](../README.md).
- Serve the tools to a desktop assistant: [`foldkit-agent-mcp`](../../agent-mcp/README.md).
- Prove the machine's rules can never break the account's invariants: [Verify a state machine in CI](../../metakit/docs/proving-transitions.md).
