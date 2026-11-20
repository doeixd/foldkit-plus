/**
 * `foldkit-agent/metakit`: a metakit Machine's transitions as capabilities,
 * their schema, availability and refusals all read from the transition.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Expr, Num, Transition } from 'metakit'
import { Money } from 'metakit/domain'
import * as Machine from 'metakit/machine'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { machineTools } from '../src/metakit.js'
import {
  Account,
  AccountMachine,
  type Caller,
  Message,
  type Model,
  auditWindow,
  update,
} from './bankApp.js'

const BankAgent = Agent.forModel<Model, Caller>()
const Tools = machineTools({
  agent: BankAgent,
  machine: AccountMachine,
  state: model => model.account,
})

const definition = BankAgent.make({
  messages: BankAgent.expose(Message, {
    Withdraw: Tools.Withdraw('Withdraw money from the account'),
    Paid: Tools.Withdraw({
      name: 'pay',
      description: 'Pay out of the account',
      toMessage: ({ amount }) => ({ amount, source: 'Agent' as const }),
      authorize: ({ principal }) => principal.canPay,
    }),
    Freeze: Tools.Freeze('Freeze the account'),
    Audit: Tools.Audit('Audit the account'),
  }),
})

const usd = (cents: number) => Money.minor('USD', cents)

const bank = (account: Account, caller: Caller = { canPay: true }) => {
  let model: Model = { account }
  const dispatched: Array<Message> = []
  const runtime = BankAgent.bind({
    definition,
    host: {
      model: () => model,
      principal: () => caller,
      dispatch: (message: Message) => {
        dispatched.push(message)
        model = update(model, message)
      },
    },
  })
  const names = (listed: Effect.Effect<ReadonlyArray<{ readonly name: string }>>) =>
    Effect.runSync(listed).map(each => each.name)
  return {
    runtime,
    dispatched,
    model: () => model,
    set: (next: Account) => {
      model = { account: next }
    },
    available: () => names(runtime.messages.available),
    call: (name: string, input: unknown) =>
      Effect.runPromise(Effect.result(runtime.messages.dispatchUnknown(name, input))),
  }
}

const open: Account = { balance: usd(1_000), status: 'open' }
const frozen: Account = { balance: usd(1_000), status: 'frozen' }

const failureOf = async (pending: ReturnType<ReturnType<typeof bank>['call']>) => {
  const result = await pending
  if (result._tag === 'Success') throw new Error('expected the call to be refused')
  return { tag: result.failure._tag, message: result.failure.message }
}

describe('the parameter schema', () => {
  const withdraw = definition.messages.variants.find(variant => variant.name === 'withdraw')!

  it('carries the bounds and domain format metakit reads from the input', () => {
    expect(withdraw.inputJsonSchema['properties']).toMatchObject({
      amount: {
        type: 'integer',
        exclusiveMinimum: 0,
        maximum: 100_000,
        'x-metakit-domain': { kind: 'money', currency: 'USD', scale: 2 },
      },
    })
  })

  it("keeps Effect's structure: an optional field is not required, excess fields are closed", () => {
    expect(withdraw.inputJsonSchema).toMatchObject({
      type: 'object',
      required: ['amount'],
      additionalProperties: false,
    })
    expect(withdraw.inputJsonSchema['properties']).toHaveProperty('memo')
  })

  it('keeps each bound at the tighter of Effect and metakit', () => {
    const Limit = Machine.make({
      state: Account,
      transitions: {
        Limit: Transition.make({
          state: Account,
          input: Schema.Struct({
            count: Schema.Int.pipe(Expr.refine($ => Expr.all(Num.gte($, 1), Num.lte($, 1e20)))),
          }),
          apply: () => [],
        }),
      },
    })
    const tools = machineTools({ agent: BankAgent, machine: Limit, state: model => model.account })
    const [variant] = BankAgent.expose(defineMessageUnion({ Limit: { count: Schema.Int } }), {
      Limit: tools.Limit('Set the limit'),
    }).variants
    expect(variant!.inputJsonSchema['properties']).toEqual({
      count: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    })
  })

  it('is what adapters are handed', () => {
    const { runtime } = bank(open)
    const described = Effect.runSync(runtime.messages.list).find(each => each.name === 'withdraw')!
    expect(described.inputSchema).toEqual(withdraw.inputJsonSchema)
  })

  it('gives a transition with no input a closed empty object', () => {
    const freeze = definition.messages.variants.find(variant => variant.name === 'freeze')!
    expect(freeze.inputJsonSchema).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    })
  })
})

describe('availability', () => {
  it('hides a tool whose guard is False in the current state', () => {
    expect(bank(frozen).available()).not.toContain('freeze')
    expect(bank(frozen).available()).not.toContain('withdraw')
  })

  it('lists a tool whose guard is True, or Unknown until the input arrives', () => {
    expect(bank(open).available()).toEqual(['withdraw', 'pay', 'freeze', 'audit'])
  })

  it('still describes a hidden tool in the full list', () => {
    const names = Effect.runSync(bank(frozen).runtime.messages.list).map(each => each.name)
    expect(names).toContain('freeze')
  })

  it('lists a tool whose guard reads an opaque term, which no state can decide', () => {
    auditWindow.open = false
    expect(bank(frozen).available()).toContain('audit')
  })
})

describe('calling a tool', () => {
  it('runs the transition through update', async () => {
    const app = bank(open)
    const result = await app.call('withdraw', { amount: 250 })
    expect(result._tag).toBe('Success')
    expect(app.model().account.balance).toBe(750)
  })

  it('maps the input onto another Message with toMessage', async () => {
    const app = bank(open)
    await app.call('pay', { amount: 100 })
    expect(app.dispatched).toEqual([Message.Paid({ amount: usd(100), source: 'Agent' })])
    expect(app.model().account.balance).toBe(900)
  })

  it('refuses an input the guard refuses in this state, so Unknown is never taken as proved', async () => {
    const app = bank(open)
    expect(await failureOf(app.call('pay', { amount: 5_000 }))).toEqual({
      tag: 'AgentCapabilityUnavailableError',
      message: '"pay" does not allow this input in the current state',
    })
    expect(app.dispatched).toEqual([])
  })

  it('evaluates an opaque guard on the call', async () => {
    auditWindow.open = false
    const app = bank(open)
    expect((await failureOf(app.call('audit', {}))).tag).toBe('AgentCapabilityUnavailableError')
    auditWindow.open = true
    expect((await app.call('audit', {}))._tag).toBe('Success')
  })

  it('refuses a tool whose guard turned False after it was listed', async () => {
    const app = bank(open)
    expect(app.available()).toContain('freeze')
    app.set(frozen)
    expect(await failureOf(app.call('freeze', {}))).toEqual({
      tag: 'AgentCapabilityUnavailableError',
      message: 'Capability "freeze" is not available right now',
    })
    expect(app.dispatched).toEqual([])
  })

  it.each([
    ['below the bound', { amount: 0 }],
    ['above the bound', { amount: 100_001 }],
    ['of the wrong type', { amount: '250' }],
    ['not an integer', { amount: 2.5 }],
    ['with a field the schema does not declare', { amount: 250, extra: true }],
  ])('refuses an input %s at the boundary', async (_, input) => {
    const app = bank(open)
    expect(await failureOf(app.call('withdraw', input))).toEqual({
      tag: 'AgentInvalidInputError',
      message: 'Invalid input for "withdraw"',
    })
    expect(app.dispatched).toEqual([])
  })

  it('asks authorize before the guard, so a refused caller learns nothing of the state', async () => {
    const app = bank(open, { canPay: false })
    expect((await failureOf(app.call('pay', { amount: 5_000 }))).tag).toBe(
      'AgentAuthorizationError',
    )
  })
})

it('refuses at definition a transition with no input Schema', () => {
  const Freeze = AccountMachine.transitions.Freeze
  const Bare = Machine.make({
    state: Account,
    transitions: { Freeze: { ...Freeze, inputSchema: Option.none() } },
  })
  expect(() =>
    machineTools({ agent: BankAgent, machine: Bare, state: model => model.account }),
  ).toThrow('Cannot make a tool of "Freeze": the transition declares no input Schema')
})
