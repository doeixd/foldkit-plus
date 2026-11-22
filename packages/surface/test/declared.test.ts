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
import { WritesCheck } from '../src/writes.js'

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
        Persist: ['Noted'],
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
    expect(declared.sends).toEqual({ LogTitle: ['Saved'], Persist: ['Noted'] })
    expect(declared.messageEdges).toEqual([
      { from: 'Renamed', emit: 'LogTitle', to: 'Saved' },
      { from: 'Renamed', emit: 'Persist', to: 'Noted' },
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
    const e1 = titleEpoch(m1)
    // Another Incremented does NOT write ['title'] -> titleEpoch unchanged!
    const m2 = declared.update(m1, Message.Incremented({ by: 2 })).model
    expect(titleEpoch(m2)).toBe(e1)
    // Renamed writes ['title'] -> titleEpoch advances!
    const m3 = declared.update(m2, Message.Renamed({ title: 'Changed' })).model
    expect(titleEpoch(m3)).toBeGreaterThan(e1)
    // Undeclared Noted changes model via fallback -> bumps `all` -> titleEpoch advances!
    const e3 = titleEpoch(m3)
    const m4 = declared.update(m3, Message.Noted({ note: 'fallback' })).model
    expect(titleEpoch(m4)).toBeGreaterThan(e3)
  })

  it('allows omitting config when every Message has a transition that emits nothing', () => {
    const CountMessage = defineMessageUnion({ Incremented: { by: Schema.Int } })
    const Counting = Surface.application({ Model, Message: CountMessage })
    const declared = Declared.of(
      Counting,
      Machine.make({
        state: Model,
        transitions: {
          Incremented: Transition.make({
            state: Model,
            input: CountMessage.Incremented,
            apply: ({ state, input }) => [Transition.add(state.count, input.by)],
          }),
        },
      }),
    )
    const next = declared.update(initial, CountMessage.Incremented({ by: 5 }))
    expect(next.model).toEqual({ title: 'Untitled', count: 5, note: '' })
    expect(declared.undeclared).toEqual([])
  })

  it('requires a fallback while some Message has no transition, and refuses to be made without one', () => {
    const PureMachine = Machine.make({ state: Model, transitions: { Incremented } })
    // @ts-expect-error `Renamed`, `Saved` and `Noted` have no transition and no fallback handles them
    expect(() => Declared.of(App, PureMachine)).toThrow(
      'no transition for "Renamed", "Saved", "Noted", and no fallback to handle them',
    )
    const declared = Declared.of(App, PureMachine, { fallback: model => ({ model }) })
    const unchanged = declared.update(initial, Message.Noted({ note: 'ignored' }))
    expect(unchanged.model).toBe(initial)
  })

  it('throws where a transition emits a record the commands table has no handler for', () => {
    const declared = Declared.of(App, PartialMachine, {
      // @ts-expect-error `Persist` has no handler
      commands: { LogTitle: () => [] },
      fallback: model => ({ model }),
    })
    expect(() => declared.update(initial, Message.Renamed({ title: 'Hello' }))).toThrow(
      'transition "Renamed" emitted "Persist", which has no handler in commands',
    )
  })

  it('gives an untracked step: a Model it made draws every view again under the writes', () => {
    const declared = Declared.of(App, PartialMachine, {
      commands: { LogTitle: () => [], Persist: () => [] },
      fallback: model => ({ model }),
    })
    const titleEpoch = declared.writes.epochFor([['title']])
    const tracked = declared.update(initial, Message.Incremented({ by: 1 })).model
    const before = titleEpoch(tracked)
    // `update` saw this Model made, and `Incremented` writes no title: the epoch stays.
    const current = declared.update(tracked, Message.Incremented({ by: 1 })).model
    expect(titleEpoch(current)).toBe(before)
    // `step` is wrapped by an outer `track`; on its own the writes never saw its Model made.
    const stepped = declared.step(current, Message.Incremented({ by: 1 })).model
    expect(stepped.count).toBe(3)
    expect(titleEpoch(stepped)).toBeGreaterThan(before)
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

  it('refuses sends keyed by a record no transition emits, at definition time', () => {
    expect(() =>
      Declared.of(App, PartialMachine, {
        commands: { LogTitle: () => [], Persist: () => [] },
        // @ts-expect-error `Typo` is not a record the machine emits
        sends: { Typo: ['Saved'] },
      }),
    ).toThrow(/sends\["Typo"\] names a record no transition of the machine emits/)
  })

  it('confines an opaque child Bundle to its path: skips unrelated reads and catches stray writes', () => {
    // `Noted` stands for an opaque child Bundle placed at `['note']` with no machine.
    const declared = Declared.of(App, PartialMachine, {
      commands: { LogTitle: () => [], Persist: () => [] },
      contracts: [{ messages: ['Noted'], owns: [['note']] }],
      fallback: (model, message) =>
        message._tag === 'Noted' ? { model: { ...model, note: message.note } } : { model },
    })

    const titleEpoch = declared.writes.epochFor([['title']])
    const noteEpoch = declared.writes.epochFor([['note']])
    const m1 = declared.update(initial, Message.Incremented({ by: 1 })).model
    const titleBefore = titleEpoch(m1)
    const noteBefore = noteEpoch(m1)

    // Confined child writes `['note']`: noteEpoch advances, titleEpoch stays exact!
    const m2 = declared.update(m1, Message.Noted({ note: 'inside' })).model
    expect(noteEpoch(m2)).toBeGreaterThan(noteBefore)
    expect(titleEpoch(m2)).toBe(titleBefore)

    // WritesCheck enforces the confinement: if the opaque child writes outside `['note']`, it fails.
    const leaky = WritesCheck.verify(declared.writes, (model: Model, message: Message) =>
      message._tag === 'Noted'
        ? { model: { ...model, note: message.note, title: 'leaked!' } }
        : { model },
    )
    expect(() => leaky(m1, Message.Noted({ note: 'x' }))).toThrow(
      /"Noted" changed title, and its transition declares it writes note/,
    )
  })
})

describe('Declared.of with supplied values', () => {
  const Stamp = Schema.Struct({ stamp: Schema.Int, label: Schema.String })
  type Stamp = typeof Stamp.Type
  const StampMessage = defineMessageUnion({ Stamped: { label: Schema.String } })
  type StampMessage = typeof StampMessage.Type
  const Stamping = Surface.application({ Model: Stamp, Message: StampMessage })
  const machine = Machine.make({
    state: Stamp,
    transitions: {
      Stamped: Transition.make({
        state: Stamp,
        input: StampMessage.Stamped,
        supplied: { now: Schema.Int },
        apply: ({ state, input, supplied }) => [
          Transition.set(state.stamp, supplied.now),
          Transition.set(state.label, input.label),
        ],
      }),
    },
  })
  const start: Stamp = { stamp: 0, label: '' }

  it('runs supply once per step and hands its values to the transition', () => {
    let clock = 100
    const asked: Array<string> = []
    const declared = Declared.of(Stamping, machine, {
      supply: {
        Stamped: message => {
          asked.push(message.label)
          return { now: clock++ }
        },
      },
    })
    const first = declared.update(start, StampMessage.Stamped({ label: 'a' })).model
    expect(first).toEqual({ stamp: 100, label: 'a' })
    const second = declared.update(first, StampMessage.Stamped({ label: 'b' })).model
    expect(second).toEqual({ stamp: 101, label: 'b' })
    expect(asked).toEqual(['a', 'b'])
  })

  it('records each step’s values, and a replay of them gives the same Models without supply', () => {
    let clock = 7
    const recorded: Array<{ readonly message: StampMessage; readonly supplied: { now: number } }> =
      []
    const live = Declared.of(Stamping, machine, {
      supply: { Stamped: () => ({ now: clock++ }) },
      record: step => recorded.push(step),
    })
    const labels = ['x', 'y', 'z']
    const models: Array<Stamp> = []
    let model = start
    for (const label of labels) {
      model = live.update(model, StampMessage.Stamped({ label })).model
      models.push(model)
    }
    expect(recorded.map(step => step.supplied.now)).toEqual([7, 8, 9])

    const replayer = Declared.of(Stamping, machine, {
      supply: {
        Stamped: () => {
          throw new Error('a replay does not ask for new values')
        },
      },
    })
    let replayed = start
    const replayedModels: Array<Stamp> = []
    for (const step of recorded) {
      replayed = replayer.replay(replayed, step).model
      replayedModels.push(replayed)
    }
    expect(replayedModels).toEqual(models)
  })

  it('requires supply for a transition that declares supplied values, and refuses to be made without it', () => {
    // @ts-expect-error `Stamped` takes `now`, and no supply makes it
    expect(() => Declared.of(Stamping, machine)).toThrow(
      'the transition "Stamped" takes supplied values, and supply has no entry for it',
    )
  })
})
