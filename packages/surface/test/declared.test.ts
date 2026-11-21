/**
 * `foldkit-surface/declared`: derived `update`, exhaustive emitted-record
 * Command dispatch, coexistence with hand-written `fallback` arms, no-op
 * identity preservation, and `Writes` path-skipping integration.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Eq, Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { describe, expect, it } from 'vitest'
import { Declared } from '../src/declared.js'
import { Surface } from '../src/index.js'

const Model = Schema.Struct({
  title: Schema.String,
  count: Schema.Int,
  note: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Renamed: { title: Schema.String },
  Incremented: { by: Schema.Int },
  Saved: {},
  Noted: { note: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })

const initial: Model = { title: 'Untitled', count: 0, note: '' }

const Renamed = Transition.make({
  state: Model,
  input: Message.Renamed,
  when: ({ input }) => Eq.isNot(input.title, ''),
  apply: ({ state, input }) => [Transition.set(state.title, input.title)],
  emits: ({ input }) => [
    Transition.emit('LogTitle', { title: input.title }),
    Transition.emit('Persist', { kind: 'title' }),
  ],
})

const Incremented = Transition.make({
  state: Model,
  input: Message.Incremented,
  when: ({ input }) => Num.gt(input.by, 0),
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})

const PartialMachine = Machine.make({
  state: Model,
  transitions: { Renamed, Incremented },
})

describe('Declared.of', () => {
  it('derives update from the machine, preserves emission order, and keeps no-op model identity', () => {
    const declared = Declared.of(App, PartialMachine, {
      commands: {
        LogTitle: ({ title }) => [
          { name: `log:${title}`, effect: Effect.succeed(Message.Saved()) },
        ],
        Persist: ({ kind }) => [
          { name: `persist:${kind}`, effect: Effect.succeed(Message.Saved()) },
        ],
      },
      sends: {
        LogTitle: ['Saved'],
        Persist: ['Saved'],
      },
      fallback: (model, message) =>
        message._tag === 'Noted' ? { model: { ...model, note: message.note } } : { model },
    })

    // 1. Declared transition with emitted records -> commands in exact emission order.
    const r1 = declared.update(initial, Message.Renamed({ title: 'Hello' }))
    expect(r1.model).toEqual({ title: 'Hello', count: 0, note: '' })
    expect(r1.commands?.map(c => c.name)).toEqual(['log:Hello', 'persist:title'])

    // 2. Guard-refused transition -> exact no-op model reference (`toBe`), no commands.
    const r2 = declared.update(r1.model, Message.Renamed({ title: '' }))
    expect(r2.model).toBe(r1.model)
    expect(r2.commands).toBeUndefined()

    // 3. Declared transition with no emits -> updated model, no commands property.
    const r3 = declared.update(r1.model, Message.Incremented({ by: 3 }))
    expect(r3.model).toEqual({ title: 'Hello', count: 3, note: '' })
    expect(r3.commands).toBeUndefined()

    // 4. Coexistence: undeclared Message routes to `fallback`.
    const r4 = declared.update(r3.model, Message.Noted({ note: 'kept' }))
    expect(r4.model).toEqual({ title: 'Hello', count: 3, note: 'kept' })

    // 5. Introspection: undeclared list, validated sends map, and derived messageEdges.
    expect(declared.undeclared).toEqual(['Saved', 'Noted'])
    expect(declared.sends).toEqual({ LogTitle: ['Saved'], Persist: ['Saved'] })
    expect(declared.messageEdges).toEqual([
      { from: 'Renamed', emit: 'LogTitle', to: 'Saved' },
      { from: 'Renamed', emit: 'Persist', to: 'Saved' },
    ])
  })

  it('tracks Writes epochs automatically through declared.update (including fallback Messages)', () => {
    const declared = Declared.of(App, PartialMachine, {
      commands: {
        LogTitle: () => [],
        Persist: () => [],
      },
      fallback: (model, message) =>
        message._tag === 'Noted' ? { model: { ...model, note: message.note } } : { model },
    })
    const titleEpoch = declared.writes.epochFor([['title']])
    const m1 = declared.update(initial, Message.Incremented({ by: 1 })).model
    const e1 = titleEpoch()
    // Another Incremented does NOT write ['title'] -> titleEpoch unchanged!
    const m2 = declared.update(m1, Message.Incremented({ by: 2 })).model
    expect(titleEpoch()).toBe(e1)
    // Renamed writes ['title'] -> titleEpoch advances!
    const m3 = declared.update(m2, Message.Renamed({ title: 'Changed' })).model
    expect(titleEpoch()).toBeGreaterThan(e1)
    // Undeclared Noted changes model via fallback -> bumps `all` -> titleEpoch advances!
    const e3 = titleEpoch()
    declared.update(m3, Message.Noted({ note: 'fallback' }))
    expect(titleEpoch()).toBeGreaterThan(e3)
  })

  it('allows omitting config when a machine emits no records', () => {
    const PureMachine = Machine.make({
      state: Model,
      transitions: { Incremented },
    })
    const declared = Declared.of(App, PureMachine)
    const next = declared.update(initial, Message.Incremented({ by: 5 }))
    expect(next.model).toEqual({ title: 'Untitled', count: 5, note: '' })
    // Undeclared Message with no fallback is a safe no-op returning the exact model.
    const unchanged = declared.update(next.model, Message.Noted({ note: 'ignored' }))
    expect(unchanged.model).toBe(next.model)
  })

  it('refuses sends naming an unknown or prototype Message tag at definition time', () => {
    expect(() =>
      Declared.of(App, PartialMachine, {
        commands: { LogTitle: () => [], Persist: () => [] },
        // @ts-expect-error `constructor` is not a Message tag of App
        sends: { LogTitle: ['constructor'] },
      }),
    ).toThrow(/not a Message of this application/)
  })
})
