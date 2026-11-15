/**
 * History: push/undo/redo/clear over a text value, bounded capacity,
 * no-op edges, factory validation, and placement through a real assembly.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { History, HistoryModel, canRedo, canUndo, history } from '../src/state/index.js'

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 2 })
const Doc = Bundle.declare(EditHistory, 'doc')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Doc, { args: { initial: 'a' } })

const send = (model: Model, message: Parameters<typeof Doc.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Doc.wrapper.make(message))).model.doc
const fresh: Model = {
  doc: { past: [], present: 'a', future: [], group: null, groupedAt: Option.none() },
}

describe('History transitions', () => {
  it('starts from the given initial value', () => {
    expect(
      placed.init({
        doc: { past: ['x'], present: 'y', future: ['z'], group: null, groupedAt: Option.none() },
      }).model.doc,
    ).toEqual({
      past: [],
      present: 'a',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
  })

  it('pushes, undoes, redoes, and clears', () => {
    const b = send(fresh, EditHistory.Message.Push({ value: 'b' }))
    expect(b).toEqual({
      past: ['a'],
      present: 'b',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
    expect(canUndo(b)).toBe(true)
    expect(canRedo(b)).toBe(false)
    const c = send({ doc: b }, EditHistory.Message.Push({ value: 'c' }))
    expect(c).toEqual({
      past: ['a', 'b'],
      present: 'c',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
    const undone = send({ doc: c }, EditHistory.Message.Undo())
    expect(undone).toEqual({
      past: ['a'],
      present: 'b',
      future: ['c'],
      group: null,
      groupedAt: Option.none(),
    })
    expect(canRedo(undone)).toBe(true)
    const redone = send({ doc: undone }, EditHistory.Message.Redo())
    expect(redone).toEqual(c)
    const cleared = send({ doc: redone }, EditHistory.Message.Clear())
    expect(cleared).toEqual({
      past: [],
      present: 'c',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
    expect(canUndo(cleared)).toBe(false)
  })

  it('a push drops the redo future', () => {
    const undone = send(
      { doc: send(fresh, EditHistory.Message.Push({ value: 'b' })) },
      EditHistory.Message.Undo(),
    )
    expect(undone.future).toEqual(['b'])
    expect(send({ doc: undone }, EditHistory.Message.Push({ value: 'x' })).future).toEqual([])
  })

  it('undo and redo at the edges leave the Model alone', () => {
    expect(send(fresh, EditHistory.Message.Undo())).toEqual(fresh.doc)
    expect(send(fresh, EditHistory.Message.Redo())).toEqual(fresh.doc)
  })

  it('the past holds at most capacity entries', () => {
    const d = send(
      {
        doc: send(
          { doc: send(fresh, EditHistory.Message.Push({ value: 'b' })) },
          EditHistory.Message.Push({ value: 'c' }),
        ),
      },
      EditHistory.Message.Push({ value: 'd' }),
    )
    expect(d).toEqual({
      past: ['b', 'c'],
      present: 'd',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
  })

  it('capacity zero keeps no past', () => {
    const Tiny = history({ name: 'Tiny', value: Schema.String, capacity: 0 })
    const TinyDoc = Bundle.declare(Tiny, 'tiny')
    const TinyModel = Schema.Struct({ ...TinyDoc.fields })
    type TinyModel = typeof TinyModel.Type
    const TinyMessage = defineMessageUnion({ ...TinyDoc.cases })
    const TinyPage = Bundle.parent({ Model: TinyModel, Message: TinyMessage })
    const tiny = TinyPage.at(TinyDoc, { args: { initial: 'a' } })
    const pushed = Option.getOrThrow(
      tiny.update(
        { tiny: { past: [], present: 'a', future: [], group: null, groupedAt: Option.none() } },
        TinyDoc.wrapper.make(Tiny.Message.Push({ value: 'b' })),
      ),
    ).model.tiny
    expect(pushed).toEqual({
      past: [],
      present: 'b',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
    expect(canUndo(pushed)).toBe(false)
  })
})

describe('History.goTo', () => {
  // Step 2 is the present; the future holds the next redo first.
  const middle: HistoryModel<string> = {
    past: ['a', 'b'],
    present: 'c',
    future: ['d', 'e'],
    group: null,
    groupedAt: Option.none(),
  }

  it.each([
    [0, { past: [], present: 'a', future: ['b', 'c', 'd', 'e'] }],
    [1, { past: ['a'], present: 'b', future: ['c', 'd', 'e'] }],
    [3, { past: ['a', 'b', 'c'], present: 'd', future: ['e'] }],
    [4, { past: ['a', 'b', 'c', 'd'], present: 'e', future: [] }],
  ])('jumps to step %s, back or forward in one move', (step, expected) => {
    expect(History.goTo(middle, step)).toEqual({
      ...expected,
      group: null,
      groupedAt: Option.none(),
    })
  })

  it.each([2, -1, 5, 1.5, Number.NaN])('leaves the Model as it was for step %s', step => {
    expect(History.goTo(middle, step)).toBe(middle)
  })

  it('ends a group, as an undo does', () => {
    const typed = History.push(History.start('a'), 'b', {
      capacity: 10,
      group: 'g',
    })
    expect(History.goTo(typed, 0).group).toBeNull()
  })

  it('jumps through the placed bundle', () => {
    const c = send(
      { doc: send(fresh, EditHistory.Message.Push({ value: 'b' })) },
      EditHistory.Message.Push({ value: 'c' }),
    )
    expect(send({ doc: c }, EditHistory.Message.GoTo({ step: 0 }))).toEqual({
      past: [],
      present: 'a',
      future: ['b', 'c'],
      group: null,
      groupedAt: Option.none(),
    })
  })
})

describe('History factory', () => {
  it('rejects a negative or fractional capacity', () => {
    expect(() => history({ name: 'Bad', value: Schema.String, capacity: -1 })).toThrow(
      /non-negative integer/,
    )
    expect(() => history({ name: 'Bad', value: Schema.String, capacity: 1.5 })).toThrow(
      /non-negative integer/,
    )
  })
})

describe('History in an assembly', () => {
  it('routes its Messages', () => {
    const assembly = Page.assemble(Page.at(Doc, { args: { initial: 'a' } }))
    const update = assembly.update(model => ({ model }))
    const pushed = update(fresh, Doc.wrapper.make(EditHistory.Message.Push({ value: 'b' })))
    expect(pushed.model.doc.present).toBe('b')
  })
})

describe('grouped steps, and the steps as functions', () => {
  it('joins consecutive pushes of one group into one step, and a different group starts a new one', () => {
    const typed = ['H', 'He', 'Hey'].reduce(
      (model, value) => History.push(model, value, { capacity: 10, group: 'title' }),
      History.start(''),
    )
    expect(typed).toEqual({
      past: [''],
      present: 'Hey',
      future: [],
      group: 'title',
      groupedAt: Option.none(),
    })
    expect(History.undo(typed).present).toBe('')
    const other = History.push(typed, 'Hey!', {
      capacity: 10,
      group: 'body',
    })
    expect(other.past).toEqual(['', 'Hey'])
    // No group stands alone, even twice.
    const plain = History.push(History.push(other, 'a', { capacity: 10 }), 'b', { capacity: 10 })
    expect(plain.past).toEqual(['', 'Hey', 'Hey!', 'a'])
  })

  it('breaks a group at an undo, so the next push of it is its own step', () => {
    const one = History.push(History.start('a'), 'b', {
      capacity: 10,
      group: 'g',
    })
    const back = History.undo(History.push(one, 'c', { capacity: 10, group: 'g' }))
    expect(back.group).toBeNull()
    expect(History.push(back, 'd', { capacity: 10, group: 'g' }).past).toEqual(['a'])
  })

  it('ends a group where asked, so the same group again is a step of its own', () => {
    const first = History.push(History.start('a'), 'b', {
      capacity: 10,
      group: 'g',
    })
    const closed = History.close(first)
    expect(closed.present).toBe('b')
    expect(History.push(closed, 'c', { capacity: 10, group: 'g' }).past).toEqual(['a', 'b'])
    expect(History.close(closed)).toBe(closed)
  })

  it('reverts a group’s step with nothing to redo, and leaves another group’s alone', () => {
    const before = History.push(History.start('a'), 'b', { capacity: 10 })
    const typed = ['bx', 'bxy'].reduce(
      (model, value) => History.push(model, value, { capacity: 10, group: 'g' }),
      before,
    )
    expect(History.revert(typed, 'g')).toEqual({
      past: ['a'],
      present: 'b',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
    expect(History.revert(typed, 'h')).toBe(typed)
    // A step closed is no longer the group's to take back.
    expect(History.revert(History.close(typed), 'g').present).toBe('bxy')
    // With nothing kept there is nothing to take back, and the group still ends.
    const unkept = ['b', 'c'].reduce(
      (model, value) => History.push(model, value, { capacity: 0, group: 'g' }),
      History.start('a'),
    )
    expect(History.revert(unkept, 'g')).toEqual({
      past: [],
      present: 'c',
      future: [],
      group: null,
      groupedAt: Option.none(),
    })
  })

  it('groups through the placed bundle too', () => {
    const typed = [
      EditHistory.Message.Push({ value: 'b', group: 'x' }),
      EditHistory.Message.Push({ value: 'bc', group: 'x' }),
    ].reduce<Model>((model, message) => ({ doc: send(model, message) }), fresh)
    expect(typed.doc).toEqual({
      past: ['a'],
      present: 'bc',
      future: [],
      group: 'x',
      groupedAt: Option.none(),
    })
  })

  it('keeps an empty future as it was through a push, grouped or not', () => {
    const typed = History.push(History.start('a'), 'b', {
      capacity: 10,
      group: 'g',
    })
    const joined = History.push(typed, 'bc', { capacity: 10, group: 'g' })
    expect(joined.future).toBe(typed.future)
    expect(History.push(joined, 'x', { capacity: 10 }).future).toBe(typed.future)
  })

  it('keeps a stored history, its group included, through its Schema', () => {
    const model = History.push(History.start('a'), 'b', {
      capacity: 10,
      group: 'g',
    })
    const stored = JSON.parse(JSON.stringify(Schema.encodeSync(HistoryModel(Schema.String))(model)))
    expect(Schema.decodeUnknownSync(HistoryModel(Schema.String))(stored)).toEqual(model)
  })
})

describe('a no-op records nothing', () => {
  const same = (present: string, value: string) => present.trim() === value.trim()

  it('returns the Model it was given for a value equal to the present, grouped or not', () => {
    const model = History.push(History.start('a'), 'b', { capacity: 10, group: 'g' })
    expect(History.push(model, ' b ', { capacity: 10, group: 'g', equals: same })).toBe(model)
    expect(History.push(model, 'b', { capacity: 10, equals: same })).toBe(model)
    expect(History.push(model, 'c', { capacity: 10, equals: same }).present).toBe('c')
  })

  it('keeps an undo reachable: an equal push after an undo does not drop the redo', () => {
    const undone = History.undo(History.push(History.start('a'), 'b', { capacity: 10 }))
    expect(History.push(undone, 'a', { capacity: 10, equals: same }).future).toEqual(['b'])
  })

  it('applies a factory’s equals to every Message', () => {
    const Trimmed = history({ name: 'Trimmed', value: Schema.String, equals: same })
    const trimmed = Bundle.declare(Trimmed, 'trimmed')
    const TrimmedModel = Schema.Struct({ ...trimmed.fields })
    const TrimmedMessage = defineMessageUnion({ ...trimmed.cases })
    const at = Bundle.parent({ Model: TrimmedModel, Message: TrimmedMessage }).at(trimmed, {
      args: { initial: 'a' },
    })
    const start = at.init({ trimmed: History.start('x') }).model
    const result = Option.getOrThrow(
      at.update(start, trimmed.wrapper.make(Trimmed.Message.Push({ value: 'a ' }))),
    ).model
    expect(result.trimmed).toBe(start.trimmed)
  })
})

describe('a pause ends a grouped step', () => {
  const typed = (steps: ReadonlyArray<readonly [string, number]>) =>
    steps.reduce(
      (model, [value, at]) =>
        History.push(model, value, { capacity: 10, group: 'typing', at, within: 500 }),
      History.start(''),
    )

  it.each([
    [
      'inside the window',
      [
        ['a', 0],
        ['ab', 400],
        ['abc', 800],
      ] as const,
      [''],
      'abc',
    ],
    [
      'after a pause',
      [
        ['a', 0],
        ['ab', 400],
        ['abc', 1000],
      ] as const,
      ['', 'ab'],
      'abc',
    ],
  ])('%s', (_name, steps, past, present) => {
    const model = typed(steps)
    expect(model.past).toEqual(past)
    expect(model.present).toBe(present)
  })

  it('measures each push from the previous one, so steady typing never splits', () => {
    const steady = typed([0, 1, 2, 3, 4, 5].map(i => [`k${i}`, i * 400] as const))
    expect(steady.past).toEqual([''])
  })

  it('does not join without a known time when a window is asked for', () => {
    const untimed = History.push(History.start('a'), 'b', { capacity: 10, group: 'g' })
    const next = History.push(untimed, 'c', { capacity: 10, group: 'g', at: 5, within: 500 })
    expect(next.past).toEqual(['a', 'b'])
  })

  it('does not join a push that names a window but no time', () => {
    const timed = History.push(History.start('a'), 'b', { capacity: 10, group: 'g', at: 0 })
    const next = History.push(timed, 'c', { capacity: 10, group: 'g', within: 500 })
    expect(next.past).toEqual(['a', 'b'])
  })

  it('carries the time through the placed bundle', () => {
    const Timed = history({ name: 'Timed', value: Schema.String, within: 100 })
    const timed = Bundle.declare(Timed, 'timed')
    const TimedModel = Schema.Struct({ ...timed.fields })
    const TimedMessage = defineMessageUnion({ ...timed.cases })
    const at = Bundle.parent({ Model: TimedModel, Message: TimedMessage }).at(timed, {
      args: { initial: '' },
    })
    const push = (model: typeof TimedModel.Type, value: string, time: number) =>
      Option.getOrThrow(
        at.update(model, timed.wrapper.make(Timed.Message.Push({ value, group: 'g', at: time }))),
      ).model
    const first = push(at.init({ timed: History.start('') }).model, 'a', 0)
    expect(push(first, 'ab', 50).timed.past).toEqual([''])
    expect(push(first, 'ab', 500).timed.past).toEqual(['', 'a'])
  })
})

describe('History.map', () => {
  it('rewrites every kept value and keeps the steps and the group', () => {
    const model = History.undo(
      History.push(History.push(History.start('a'), 'b', { capacity: 10 }), 'c', {
        capacity: 10,
        group: 'g',
      }),
    )
    const upper = History.map(model, value => value.toUpperCase())
    expect(upper).toEqual({ ...model, past: ['A'], present: 'B', future: ['C'] })
  })

  it('returns the Model it was given when no value changes', () => {
    const model = History.push(History.start('a'), 'b', { capacity: 10 })
    expect(History.map(model, value => value)).toBe(model)
  })
})

describe('a step that names itself', () => {
  type Step = { readonly text: string; readonly label: string; readonly source: 'reader' | 'agent' }
  const edit = (model: HistoryModel<Step>, text: string, label: string, source: Step['source']) =>
    History.push(model, { text, label, source }, { capacity: 10 })

  it('reads the menu labels from present and the first redo', () => {
    const renamed = edit(
      History.start({ text: 'a', label: 'start', source: 'reader' }),
      'b',
      'rename',
      'agent',
    )
    expect(`Undo ${renamed.present.label}`).toBe('Undo rename')
    expect(renamed.present.source).toBe('agent')
    const undone = History.undo(renamed)
    expect(undone.future[0]?.label).toBe('rename')
    expect(History.undo(undone)).toBe(undone)
  })
})
