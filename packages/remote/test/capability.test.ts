/**
 * The layer capability (#378): a domain loads the code that shows pending
 * layers only through what makes one, and refuses a layer nothing installed.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Query, Remote, RemoteClient, type RemoteMessage } from '../src/index.js'
import { lift, overlay } from '../src/overlay.js'

const Project = Entity.make('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})
const All = Query.make('All', { Input: {}, Result: Project })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const reads = () => Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })
const summary = Project.select({ name: true })

const known = (Data: { readonly reduce: (model: Model, message: RemoteMessage) => Model }): Model =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: ['p1', 'p2'].map(id => ({ entity: 'Project', id, fields: ['id', 'name'] })),
      result: {
        settled: [],
        entities: ['p1', 'p2'].map(id => ({
          entity: 'Project',
          id,
          values: { id, name: `saved ${id}` },
        })),
      },
      now: 0,
    },
  )

const started: RemoteMessage = {
  _tag: 'MutationStarted',
  requestId: 'r1',
  optimistic: [Project.patch('p1', { name: 'pending' })],
}

describe('A domain that registers no mutation', () => {
  it('reads the committed store', () => {
    const Data = reads()
    expect(Data.get(summary, 'p1').read(known(Data))).toEqual({
      _tag: 'Ready',
      value: { name: 'saved p1' },
    })
  })

  it('refuses a pending layer, naming the domain, rather than showing the store without it', () => {
    const Data = reads()
    expect(() => Data.reduce(known(Data), started)).toThrow(/domain "remote" holds a pending layer/)
  })

  it('shows an overlay, which installs the layer code', () => {
    const Data = reads()
    const shown = overlay(Data, known(Data), 'preview', [Project.patch('p1', { name: 'preview' })])
    expect(Data.get(summary, 'p1').read(shown)).toEqual({
      _tag: 'Ready',
      value: { name: 'preview' },
    })
  })

  it('lifts nothing, which installs the layer code, and keeps its Model', () => {
    const Data = reads()
    const model = known(Data)
    expect(lift(Data, model, 'preview')).toBe(model)
  })

  it('shows a live insert, which installs the layer code', () => {
    const Data = reads()
    const list = Data.query(All, {}, { select: summary, first: 10 })
    const paged = Data.reduce(known(Data), {
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: {
        edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })
    const inserted = Data.reduce(paged, {
      _tag: 'LiveReceived',
      stream: 's1',
      event: {
        _tag: 'ConnectionInsert',
        connection: list.ref.identity,
        edge: { key: 'Project:p2', ref: { entity: 'Project', id: 'p2' } },
        position: 'append',
        cursor: 1,
      },
      now: 0,
    })
    const read = list.read(inserted)
    expect(read._tag === 'Ready' ? read.value.items : read).toEqual([
      { name: 'saved p1' },
      { name: 'saved p2' },
    ])
  })

  it('runs Remote.mutateInto, which installs what its mutation carries', async () => {
    const Bound = Remote.at(Remote.define({ entities: [Project] }), App.model.remote)
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.die('unused'),
      mutate: () =>
        Effect.succeed({
          output: {},
          entities: [{ entity: 'Project', id: 'p1', values: { name: 'renamed' } }],
          connections: [],
        }),
      live: () => Stream.empty,
    })
    const result = await Effect.runPromise(
      Remote.mutateInto(
        Bound,
        { remote: Remote.initial },
        Rename,
        { id: 'p1', name: 'renamed' },
        'r1',
        {
          optimistic: [Project.patch('p1', { name: 'renamed' })],
        },
      ).pipe(Effect.provide(client)),
    )
    expect(result.model.remote.mutations.applied.has('r1')).toBe(true)
  })
})

describe('A domain that registers no mutation, called past its types', () => {
  it('has no mutate, and says so naming the domain', () => {
    const Data = reads()
    // @ts-expect-error Registered refuses a mutation the domain does not register
    expect(() => Data.mutate(known(Data), Rename, { id: 'p1', name: 'x' })).toThrow(
      /domain "remote" declares no mutations, so it has no mutate/,
    )
  })

  it('has no retry, and says so naming the domain', () => {
    const Data = reads()
    // @ts-expect-error a domain that registers no mutation has nothing to retry
    expect(() => Data.retry(known(Data), 'r1')).toThrow(
      /domain "remote" declares no mutations, so it has no retry/,
    )
  })
})

describe('A domain that registers a mutation', () => {
  it('mutates, showing the write while it is pending', () => {
    const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })
    const started = Data.mutate(
      known(Data),
      Rename,
      { id: 'p1', name: 'renamed' },
      {
        optimistic: [Project.patch('p1', { name: 'renamed' })],
      },
    )
    expect(Data.get(summary, 'p1').read(started.model)).toEqual({
      _tag: 'Ready',
      value: { name: 'renamed' },
    })
  })

  it('shows a pending layer', () => {
    const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })
    const pending = Data.reduce(known(Data), started)
    expect(Data.get(summary, 'p1').read(pending)).toEqual({
      _tag: 'Ready',
      value: { name: 'pending' },
    })
  })
})
