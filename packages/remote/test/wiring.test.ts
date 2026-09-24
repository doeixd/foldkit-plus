/**
 * A Remote domain's wiring does what an application wires by hand: route
 * Remote's Messages into `reduce`, and bring its Subscriptions and contract.
 * (`Data.refresh` marks stale data and returns the Model, so there is no
 * startup Command to run.)
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface, type Wiring } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  RemotePolicy,
  type RemoteClient,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteMessageTag,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [User] })
const initial: Model = { route: 'u1', remote: Remote.initial }

const summary = User.select({ name: true })
const Home = App.surface('Home', { model: () => ({ user: Data.get(summary, 'u1') }) })
const wiring = Data.wiring({ home: Home })

// The wiring carries `RemoteClient` for the assembly: routing and entries run
// their effects through it.
const asWiring: Wiring<Model, RemoteMessage | RemoteMessageInput, RemoteClient> = wiring

const allTags: ReadonlyArray<RemoteMessageTag> = [
  'ReadReceived',
  'ReadFailed',
  'RefreshStarted',
  'ReadStarted',
  'QueryStarted',
  'RetentionChanged',
  'Hydrated',
  'MutationStarted',
  'MutationSucceeded',
  'MutationFailed',
  'OverlayShown',
  'OverlayLifted',
  'LiveReceived',
  'GapCleared',
  'ConnectionMerged',
  'ConnectionInvalidated',
  'ConnectionRefreshed',
  'QueryFailed',
]

describe('RemoteDomain.wiring', () => {
  const receivedAda = Message.ReadReceived({
    requests: [{ entity: 'User', id: 'u1', fields: ['name'] }],
    result: { settled: [], entities: [{ entity: 'User', id: 'u1', values: { name: 'ada' } }] },
    now: 0,
  })

  it('routes Remote Messages into reduce, as an application would by hand', () => {
    const routed = Option.getOrThrow(asWiring.route!(initial, receivedAda))
    expect(routed.model).toEqual(Data.reduce(initial, receivedAda))
    expect(Data.get(summary, 'u1').read(routed.model)).toEqual({
      _tag: 'Ready',
      value: { name: 'ada' },
    })
  })

  it('ignores a Message outside Remote’s cases', () => {
    expect(
      // @ts-expect-error: only Remote's Messages are routable
      asWiring.route!(initial, Message.Ping({})),
    ).toEqual(Option.none())
  })

  it('claims every Remote tag, shared with no other integration', () => {
    expect([...wiring.handles].sort()).toEqual([...allTags].sort())
    expect(wiring.shared).toBeUndefined()
    expect(wiring.key).toBe('remote:remote')
  })

  it('brings its Subscriptions and contract', () => {
    expect(Object.keys(wiring.subscriptions!).sort()).toEqual(['home.live', 'home.read', 'retain'])
    const read = wiring.subscriptions!['home.read']!
    const expected = Data.subscriptions({ home: Home })['home.read']!
    expect(read.modelToDependencies(initial)).toEqual(expected.modelToDependencies(initial))
    expect(wiring.contract).toBe(Data.contract)
  })

  it('passes options through to the entries', () => {
    const loaded = Data.reduce(initial, receivedAda)
    // Cache-first sees nothing to fetch; network-only refetches what the store holds.
    const cached = wiring.subscriptions!['home.read']!.modelToDependencies(loaded)
    expect(cached.requirements).toEqual([])
    const refetch = Data.wiring(
      { home: Home },
      { policy: RemotePolicy.networkOnly },
    ).subscriptions!['home.read']!.modelToDependencies(loaded)
    expect(refetch.requirements).toEqual([{ entity: 'User', id: 'u1', fields: ['name'] }])
  })
})
