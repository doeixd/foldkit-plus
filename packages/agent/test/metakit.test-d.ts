/**
 * Compile-time expectations for `foldkit-agent/metakit`: tools are keyed and
 * named by the machine, take the agent's Model and Principal, and a variant
 * whose Message does not fit the transition's input does not compile.
 */
import type { Money } from '@doeixd/metakit/domain'
import { expectTypeOf, test } from 'vitest'
import { Agent } from '../src/index.js'
import { machineTools } from '../src/metakit.js'
import { AccountMachine, type Caller, Message, type Model } from './bankApp.js'

const BankAgent = Agent.forModel<Model, Caller>()
const Tools = machineTools({
  agent: BankAgent,
  machine: AccountMachine,
  state: model => model.account,
})

test('tools are keyed by the machine', () => {
  expectTypeOf(Tools).toHaveProperty('Withdraw')
  // @ts-expect-error the machine has no `Withdrw` transition.
  void Tools.Withdrw
})

test('state must give the machine its state', () => {
  // @ts-expect-error the Model is not an account.
  machineTools({ agent: BankAgent, machine: AccountMachine, state: model => model })
})

test('names default to the transition key and follow an override', () => {
  const messages = BankAgent.expose(Message, {
    Withdraw: Tools.Withdraw('Withdraw'),
    Freeze: Tools.Freeze({ name: 'lock', description: 'Freeze' }),
  })
  const definition = BankAgent.make({ messages })
  type Names = keyof NonNullable<(typeof definition.messages)['~capabilities']>['byName']
  expectTypeOf<Names>().toEqualTypeOf<'withdraw' | 'lock'>()
})

test("dispatching takes the transition's input", () => {
  const messages = BankAgent.expose(Message, { Withdraw: Tools.Withdraw('Withdraw') })
  type Capabilities = NonNullable<(typeof messages)['~capabilities']>
  expectTypeOf<Capabilities['byTag']['Withdraw']['input']>().toEqualTypeOf<{
    readonly amount: Money.MoneyValue<'USD', 2>
    readonly memo?: string | undefined
  }>()
})

test('authorize sees the agent principal', () => {
  Tools.Withdraw({
    description: 'Pay',
    toMessage: ({ amount }) => ({ amount, source: 'Agent' as const }),
    authorize: ({ principal }) => {
      expectTypeOf(principal).toEqualTypeOf<Caller>()
      return principal.canPay
    },
  })
})

test('a Message that does not fit the input does not compile', () => {
  BankAgent.expose(Message, {
    // @ts-expect-error `Paid` needs a `source` the input does not have.
    Paid: Tools.Withdraw('Pay'),
  })
  BankAgent.expose(Message, {
    // @ts-expect-error `toMessage` must make a `Paid` payload.
    Paid: Tools.Withdraw({ description: 'Pay', toMessage: ({ amount }) => ({ amount }) }),
  })
})
