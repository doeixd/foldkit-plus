/**
 * `verifyPredictions`' `Value`: when a mutation's answer lands, each field its
 * pending layer showed that the answer carries is compared with what was
 * shown, and a disagreement is a `PredictionMismatch`. A field the answer
 * does not carry is the `Gap`'s; one another pending request patches is not
 * judged. operations-phase6-DESIGN §2.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  PredictionPart,
  Remote,
  type PredictionMismatch,
  type RemoteMessage,
} from '../src/index.js'
import { Answers } from './answers.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, likes: Schema.Number }),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const make = (verifyPredictions: boolean) =>
  Remote.make({
    mutations: [Answers],
    model: App.model.remote,
    entities: [Post],
    verifyPredictions,
  })

const p1 = { entity: 'Post', id: 'p1' }

/** p1 held, titled One with two likes. */
const held = (Data: ReturnType<typeof make>): Model =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [{ ...p1, fields: ['id', 'title', 'likes'] }],
      result: { settled: [], entities: [{ ...p1, values: { id: 'p1', title: 'One', likes: 2 } }] },
      now: 0,
    },
  )

/** p1 held, and the request `r1` showing `shown` over it. */
const pending = (Data: ReturnType<typeof make>, shown: Record<string, unknown>) =>
  Data.reduce(held(Data), {
    _tag: 'MutationStarted',
    requestId: 'r1',
    optimistic: [{ ...p1, values: shown }],
    write: { mutation: 'EditPost', input: {} },
  })

const answered = (
  values: Record<string, unknown>,
  read: Record<string, unknown> = {},
): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'r1',
  entities: [{ ...p1, values }],
  read: {
    requests: [{ ...p1, fields: Object.keys(read) }],
    result: { settled: [], entities: [{ ...p1, values: read }] },
  },
  now: 1,
})

/** The values a Model's mismatches name. */
const values = (model: Model) =>
  model.remote.diagnostics
    .filter(
      (diagnostic): diagnostic is PredictionMismatch => diagnostic._tag === 'PredictionMismatch',
    )
    .map(diagnostic => diagnostic.part)
    .filter(PredictionPart.$is('Value'))
    .map(({ requestId, entity, id, field, shown, answered }) => ({
      requestId,
      entity,
      id,
      field,
      shown,
      answered,
    }))

describe('verifyPredictions, its Value', () => {
  it('records a field the answer holds otherwise than the client showed', () => {
    const Data = make(true)
    const model = Data.reduce(pending(Data, { title: 'Two' }), answered({ title: 'Deux' }))
    expect(values(model)).toEqual([
      { requestId: 'r1', entity: 'Post', id: 'p1', field: 'title', shown: 'Two', answered: 'Deux' },
    ])
    expect(model.remote.diagnostics[0]).toMatchObject({
      _tag: 'PredictionMismatch',
      source: 'foldkit-remote',
      level: 'error',
      message:
        'EditPost (request r1) showed Post:p1.title as "Two" while it was pending, and the server answered "Deux": the client\'s prediction and the server\'s write disagree.',
      part: { mutation: Option.some('EditPost') },
    })
  })

  it('records nothing when the answer agrees', () => {
    const Data = make(true)
    expect(
      values(Data.reduce(pending(Data, { title: 'Two' }), answered({ title: 'Two' }))),
    ).toEqual([])
  })

  it('judges an increment by the value it showed, and a field the answer read', () => {
    const Data = make(true)
    const bumped = Data.reduce(held(Data), {
      _tag: 'MutationStarted',
      requestId: 'r2',
      optimistic: [{ ...p1, values: {}, adds: { likes: 1 } }],
    })
    const settled = Data.reduce(bumped, {
      _tag: 'MutationSucceeded',
      requestId: 'r2',
      entities: [],
      read: {
        requests: [{ ...p1, fields: ['likes'] }],
        result: { settled: [], entities: [{ ...p1, values: { likes: 5 } }] },
      },
      now: 1,
    })
    expect(values(settled)).toEqual([
      { requestId: 'r2', entity: 'Post', id: 'p1', field: 'likes', shown: 3, answered: 5 },
    ])
  })

  it('leaves a field the answer does not carry to the Gap', () => {
    const Data = make(true)
    expect(values(Data.reduce(pending(Data, { title: 'Two' }), answered({ likes: 2 })))).toEqual([])
  })

  it('does not judge a field another pending request also shows', () => {
    const Data = make(true)
    const twice = Data.reduce(pending(Data, { title: 'Two' }), {
      _tag: 'MutationStarted',
      requestId: 'r2',
      optimistic: [{ ...p1, values: { title: 'Three' } }],
    })
    expect(values(Data.reduce(twice, answered({ title: 'Deux' })))).toEqual([])
  })

  it('records nothing without it', () => {
    const Data = make(false)
    const model = Data.reduce(pending(Data, { title: 'Two' }), answered({ title: 'Deux' }))
    expect(model.remote.diagnostics).toEqual([])
  })
})
