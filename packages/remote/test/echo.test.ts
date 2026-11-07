/**
 * A live stream lags a write's answer (#485). It delivers in commit order, so
 * until it sends the answer's values back, a patch of its to those fields
 * predates the write, or, from a stream that coalesces, follows it unseen.
 * Neither overwrites the answer: the field is read again instead.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  isRemoteMessage,
  type RemoteMessage,
} from '../src/index.js'
import { live } from '../src/live.js'
import { Respond, Trace } from '../src/testing.js'

const User = Entity.make(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
)
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [User], mutations: [Rename] })
const selection = User.select({ name: true, email: true })
const user = Data.get(selection, 'u1')
// Reading it live installs the live capability on the domain.
live(Data, selection, 'u1')

const request = { entity: 'User', id: 'u1', fields: ['name', 'email'] }
const read = (model: Model, name: string, now: number): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [request],
    result: {
      entities: [{ entity: 'User', id: 'u1', values: { name, email: 'ada@example.com' } }],
      settled: [],
    },
    now,
  })
const patched = (
  values: Record<string, unknown>,
  cursor: number,
  stream = 's',
  now = 10 + cursor,
): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream,
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'User', id: 'u1' },
    values,
    changed: Object.keys(values),
  },
  now,
})
const deleted = (cursor: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: { _tag: 'EntityDeleted', cursor, ref: { entity: 'User', id: 'u1' } },
  now: 10 + cursor,
})

/** Ada read at 0, renamed to `name` and answered at 5. */
const answered = (name = 'Grace', from: Model = read({ remote: Remote.initial }, 'Ada', 0)) => {
  const started = Data.mutate(
    from,
    Rename,
    { id: 'u1', name },
    { optimistic: [User.patch('u1', { name })] },
  )
  return Data.reduce(started.model, {
    _tag: 'MutationSucceeded',
    now: 5,
    requestId: started.requestId,
    entities: [{ entity: 'User', id: 'u1', values: { name } }],
  })
}
const nameOf = (model: Model) => {
  const shown = user.read(model)
  return 'value' in shown ? shown.value.name : shown._tag
}
const stepped = (model: Model, ...messages: ReadonlyArray<RemoteMessage>) =>
  messages.reduce(Data.reduce, model)

describe('a live patch from before a write, arriving after its answer (#485)', () => {
  it('leaves the answer shown, in the projection and in what the server confirmed', () => {
    const late = Data.reduce(answered(), patched({ name: 'Ada' }, 1))
    expect(nameOf(late)).toBe('Grace')
    const confirmed = Data.confirmed(user).read(late)
    expect('value' in confirmed && confirmed.value.name).toBe('Grace')
  })

  it('asks for the field again, which reads Refreshing over the answer meanwhile', () => {
    const late = Data.reduce(answered(), patched({ name: 'Ada' }, 1))
    expect(user.read(late)).toEqual({
      _tag: 'Refreshing',
      value: { name: 'Grace', email: 'ada@example.com' },
    })
    expect(Data.plan(late, user)).toEqual([{ entity: 'User', id: 'u1', fields: ['name'] }])
  })

  it('still writes the fields the answer did not', () => {
    const late = Data.reduce(answered(), patched({ name: 'Ada', email: 'old@example.com' }, 1))
    const shown = user.read(late)
    expect('value' in shown && shown.value).toEqual({ name: 'Grace', email: 'old@example.com' })
  })

  it('applies every patch once the stream sends the answer back, a later edit included', () => {
    const caught = stepped(answered(), patched({ name: 'Grace' }, 1), patched({ name: 'Eve' }, 2))
    expect(nameOf(caught)).toBe('Eve')
  })

  it('shows what a read asked after the answer finds, and applies the stream after it', () => {
    // A stream that coalesces sent the edit after ours, never ours.
    const contradicted = Data.reduce(answered(), patched({ name: 'Eve' }, 1))
    expect(nameOf(contradicted)).toBe('Grace')
    const reread = read(contradicted, 'Eve', 20)
    expect(nameOf(reread)).toBe('Eve')
    expect(nameOf(Data.reduce(reread, patched({ name: 'Zoe' }, 2)))).toBe('Zoe')
  })

  it('is not ended by a read asked before the answer', () => {
    const early = read(answered(), 'Grace', 4)
    expect(nameOf(Data.reduce(early, patched({ name: 'Ada' }, 1)))).toBe('Grace')
  })

  it('waits on each stream: one that sent the answer back does not vouch for another', () => {
    const heardOnS = Data.reduce(answered(), patched({ name: 'Grace' }, 1, 's'))
    expect(nameOf(Data.reduce(heardOnS, patched({ name: 'Ada' }, 1, 't')))).toBe('Grace')
  })

  it('waits for the later of two answers to one row', () => {
    const twice = answered('Hopper', answered('Grace'))
    // The first answer's echo is now older than the row.
    expect(nameOf(Data.reduce(twice, patched({ name: 'Grace' }, 1)))).toBe('Hopper')
    expect(nameOf(Data.reduce(twice, patched({ name: 'Hopper' }, 1)))).toBe('Hopper')
  })

  it('keeps what an earlier answer to the row awaits when a later one writes another field', () => {
    const renamed = answered()
    const started = Data.mutate(renamed, Rename, { id: 'u1', name: 'Grace' })
    const both = Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      now: 6,
      requestId: started.requestId,
      entities: [{ entity: 'User', id: 'u1', values: { email: 'grace@example.com' } }],
    })
    expect(nameOf(Data.reduce(both, patched({ name: 'Ada' }, 1)))).toBe('Grace')
  })

  it('ends with a live delete, and with forget', () => {
    const gone = Data.reduce(answered(), deleted(1))
    expect(gone.remote.echoes).toEqual({})
    expect(Data.forget(answered()).remote.echoes).toEqual({})
  })

  it('asks for nothing again on a duplicate', () => {
    const once = Data.reduce(answered(), patched({ name: 'Grace' }, 1))
    expect(Data.reduce(once, patched({ name: 'Ada' }, 1))).toBe(once)
  })
})

describe('a domain no live read installed', () => {
  const Plain = Remote.make({ model: App.model.remote, entities: [User], mutations: [Rename] })
  it('awaits no echo for an answer', () => {
    const started = Plain.mutate(read({ remote: Remote.initial }, 'Ada', 0), Rename, {
      id: 'u1',
      name: 'Grace',
    })
    const settled = Plain.reduce(started.model, {
      _tag: 'MutationSucceeded',
      now: 5,
      requestId: started.requestId,
      entities: [{ entity: 'User', id: 'u1', values: { name: 'Grace' } }],
    })
    expect(settled.remote.echoes).toBe(started.model.remote.echoes)
  })
})

describe('through the read and live entries', () => {
  const Message = defineMessageUnion({ ...Remote.messages, Renamed: { name: Schema.String } })
  type Message = typeof Message.Type
  const Traced = Surface.application({ Model, Message })
  const Live = Remote.make({
    model: Traced.model.remote,
    entities: [User],
    mutations: [Rename],
    verifyPredictions: { on: true },
  })
  const watched = live(Live, selection, 'u1')
  const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
    if (isRemoteMessage(message)) return { model: Live.reduce(model, message) }
    const started = Live.mutate(
      model,
      Rename,
      { id: 'u1', name: message.name },
      { optimistic: [User.patch('u1', { name: message.name })] },
    )
    return { model: started.model, commands: [started.command] }
  }
  /** A server that held Ada, and holds Eve by its second read: someone renamed it after us. */
  let reads = 0
  const client: RemoteClient['Service'] = {
    read: batch =>
      Effect.sync(() => {
        const row = { name: reads++ === 0 ? 'Ada' : 'Eve', email: 'ada@example.com' }
        return {
          settled: [],
          entities: batch.requests.map(request => ({
            entity: request.entity,
            id: request.id,
            values: Object.fromEntries(
              request.fields.map(field => [field, row[field as keyof typeof row]]),
            ),
          })),
        }
      }),
    query: () => Effect.die('unused'),
    mutate: () =>
      Effect.sync(() => ({
        output: { id: 'u1' },
        entities: [{ entity: 'User', id: 'u1', values: { name: 'Grace' } }],
      })),
    live: () => Stream.never,
  }

  it('reads a contradicted field again, and shows what the server holds then', async () => {
    const trace = await Trace.run(Live, {
      start: { remote: Remote.initial },
      update,
      active: { page: Live.active('page', () => Option.some(watched)) },
      client,
      steps: [
        Respond.read(User, 'u1'),
        Message.Renamed({ name: 'Grace' }),
        Respond.mutation(Rename),
        // The stream coalesced our write away and sends the rename after it.
        Message.LiveReceived({
          stream: 'u1',
          event: {
            _tag: 'EntityPatched',
            cursor: 1,
            ref: { entity: 'User', id: 'u1' },
            values: { name: 'Eve' },
            changed: ['name'],
          },
          now: 0,
        }),
        // Throws unless the contradicted field was asked for again.
        Respond.read(User, 'u1'),
      ],
    })
    const named = (model: Model) => {
      const shown = watched.read(model)
      return 'value' in shown ? shown.value.name : shown._tag
    }
    const answered = trace.entries.findIndex(entry => entry.message._tag === 'MutationSucceeded')
    const after = trace.entries.slice(answered).map(entry => named(entry.model))
    // Ours until the read asked after the answer says otherwise; never Ada again.
    expect(after).toEqual([...after.slice(0, -1).map(() => 'Grace'), 'Eve'])
    expect(trace.entries.at(-1)?.message._tag).toBe('ReadReceived')
  })
})
