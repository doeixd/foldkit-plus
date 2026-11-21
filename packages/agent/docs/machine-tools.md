# Let an agent call your state machine's transitions

Say your account rules are written once, as a state machine: "withdraw" is allowed only while the account is open and only up to the balance, and the amount must be a positive number of cents. An AI assistant acts on your app through tools: named actions it can call, each with a JSON Schema describing its parameters. Handing it those actions usually means writing the rules a second time: a parameter schema for each tool, a check for when to offer it, and the same guard again before the action runs. The copies drift, and the assistant is offered a tool that then fails, or sends an amount your rules would refuse.

`machineTools`, from `foldkit-agent/metakit`, makes each of those tools from the rule itself. A tool's parameters come from the transition's input, it is offered only while the state allows it, and a call the rule refuses is turned down before anything changes.

This guide assumes you have a `foldkit-agent` contract: the list of your app's Messages (the actions your `update` function handles) that an assistant may send, declared with `Agent.expose`. The [package page](../README.md) shows how to write one, connect it to a running app, and serve it to an assistant through an adapter (a package that speaks one protocol, such as MCP).

## Write the rules as a metakit machine

[metakit](https://github.com/doeixd/foldkit-plus/blob/main/packages/metakit/README.md) writes a rule as an expression your code can inspect, rather than a function it can only run. A **transition** is one step from one state to the next. It has an input [Effect Schema](https://effect.website/docs/schema/introduction/), a guard (`when`) that says when the step is allowed, and the writes it makes. A **machine** groups the transitions over one state. Below, `Money.make('USD')` is a Schema for an integer number of cents that remembers its currency, and `Expr.refine` adds a rule (here, "greater than 0") that both decoding and metakit can read:

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

`machineTools` takes your agent builder (`Agent.forModel<Model>()`, which fixes your Model's type for every callback), the machine, and a function that reads the machine's state out of your Model. It returns one function per transition, named as the machine names them. Call one with a description and put the result under the Message it sends:

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

The contract now has two tools, `withdraw` and `freeze`. Their names are the transition keys in snake_case; a misspelled key such as `Tools.Withdrw` does not compile. A tool placed under a Message whose fields differ from the transition's input does not compile either, unless you say how to make that Message ([below](#send-a-different-message-or-limit-who-may-call)).

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

Effect derives the JSON Schema of a Schema on its own, but it cannot read metakit rules. So `exclusiveMinimum` is added from the `Expr.refine` rule, and `x-metakit-domain` from `Money`. The rest is Effect's: `minimum` and `maximum` are the safe-integer range every `Schema.Int` has. When Effect and metakit both give the same keyword, the tighter value is kept.

## When a tool is hidden, and when a call is refused

Before any input arrives, the guard is checked against the current state alone. The check answers true, false, or unknown. It is unknown when the guard reads the input, as `amount <= balance` does, or calls a function metakit cannot look inside. Only false takes the tool away. Each adapter does what its protocol allows:

| Adapter | A tool whose guard is false |
| --- | --- |
| `foldkit-agent-mcp` | Left out of `tools/list`; the client is sent `tools/list_changed` when the Model changes |
| `foldkit-agent-webmcp` | Unregistered from the page, and registered again when the state allows it |
| `foldkit-agent-native` | Stays registered, since the registry is fixed at start; a call answers `ok: false` |
| `foldkit-agent-a2a` | Stays on the agent card, tagged `conditional`; a call is refused |

MCP and WebMCP have no way to show a tool as disabled, so those adapters hide it.

A tool whose guard is unknown stays offered. When it is called, the guard runs on the state and the decoded input together, which always gives a plain yes or no. With 50 dollars in the account, `withdraw` with `{ "amount": 9000 }` is refused with `CapabilityUnavailableError`, whose message is `"withdraw" does not allow this input in the current state`, and nothing is sent to `update`. The assistant reads that message as a failed tool call: over MCP, a tool result marked `isError: true`.

The state can also change after the assistant lists the tools and before it calls one. Each call checks the current state again before anything else. A `withdraw` sent after the account was frozen fails with `Capability "withdraw" is not available right now`, and does not run.

A call is checked in this order, and the first failure is the answer:

1. Is the tool available in the current state?
2. Does the input decode? An amount of `0`, a string, or an extra field fails here as `InvalidInputError`.
3. Is this caller allowed (`authorize`, below)?
4. Does the guard allow this input in this state?

The guard runs after `authorize`. Step 1 is asked before it, and it also decides what the tool list shows, so a tool with no `authorize` tells every caller whether the state allows it. A tool you give `authorize` (below) skips step 1: it is always listed, and its whole guard is asked at step 4. A caller `authorize` refuses then sees the same list and gets the same `AuthorizationError` whether the account is open or frozen, and learns nothing about the account. A caller it allows, calling `pay` on a frozen account, is refused at step 4 with the message above.

## Send a different Message, or limit who may call

Pass an object instead of a description when the Message your app handles has a different shape from the transition's input, or when only some callers may use the tool. Here a `Paid` Message also records where the payment came from, and only a teller allowed to pay may call it; your `update` would apply `Withdraw` for `Paid` as it does above. The second type given to `Agent.forModel` is the caller's type, which your host reports as its `principal` (the [package page](../README.md) shows how):

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
- `authorize` receives that caller as `principal`, typed as `Teller`, and runs before the guard. With it the tool is never hidden: hiding `pay` while the account is frozen would show the account's state to callers who may not pay.

## Next

- Connect the contract to a running app, and see every error a call can fail with: [the package page](../README.md).
- Serve the tools to a desktop assistant: [`foldkit-agent-mcp`](../../agent-mcp/README.md).
- Prove the machine's rules can never break the account's invariants: [Verify a state machine in CI](../../metakit/docs/proving-transitions.md).
