/**
 * Compile-time expectations for the hosts. Type-checked, not executed: every
 * `@ts-expect-error` must stay an error.
 */
import { Layer } from 'effect'
import { expectTypeOf } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, type Model, initial, recordingStore, subscriptions, update } from './hostApp.js'

// The page host reads its Model and Message types from the config's `update`.
const { host } = Agent.host({ init: () => ({ model: initial }), update, view: () => null })
expectTypeOf(host.model()).toEqualTypeOf<Model>()
expectTypeOf(host.dispatch).parameter(0).toEqualTypeOf<Message>()

// A headless runtime whose Commands need a resource must be given it.
Agent.headless({ init: () => ({ model: initial }), update, resources: recordingStore().layer })
// @ts-expect-error `update`'s Commands need `Store`, and nothing provides it.
Agent.headless({ init: () => ({ model: initial }), update })
Agent.headless({
  init: () => ({ model: initial }),
  update,
  subscriptions,
  // @ts-expect-error a Layer that provides something else is not the resources it needs.
  resources: Layer.empty,
})

// What a headless runtime does not run is refused, not ignored.
Agent.headless({
  init: () => ({ model: initial }),
  update,
  resources: recordingStore().layer,
  // @ts-expect-error there is no page to acquire Managed Resources against.
  managedResources: {},
})

// Both hosts are what `bind` takes; one for another application's Messages is not.
const HostAgent = Agent.forModel<Model>()
const definition = HostAgent.make({
  messages: HostAgent.expose(Message, { Incremented: 'Add one' }),
})
HostAgent.bind({ definition, host })
HostAgent.bind({
  definition,
  host: Agent.headless({
    init: () => ({ model: initial }),
    update,
    resources: recordingStore().layer,
  }).host,
})
declare const elsewhere: Agent.RuntimeHost<Model, { readonly _tag: 'Unrelated' }>
// @ts-expect-error this host cannot receive the contract's Messages.
HostAgent.bind({ definition, host: elsewhere })
