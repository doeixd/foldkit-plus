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
const fresh: Model = { doc: { past: [], present: 'a', future: [], group: null } }

describe('History transitions', () => {
  it('starts from the given initial value', () => {
    expect(
      placed.init({ doc: { past: ['x'], present: 'y', future: ['z'], group: null } }).model.doc,
    ).toEqual({
      past: [],
      present: 'a',
      future: [],
      group: null,
    })
  })

  it('pushes, undoes, redoes, and clears', () => {
    const b = send(fresh, EditHistory.Message.Push({ value: 'b' }))
    expect(b).toEqual({ past: ['a'], present: 'b', future: [], group: null })
    expect(canUndo(b)).toBe(true)
    expect(canRedo(b)).toBe(false)
    const c = send({ doc: b }, EditHistory.Message.Push({ value: 'c' }))
    expect(c).toEqual({ past: ['a', 'b'], present: 'c', future: [], group: null })
    const undone = send({ doc: c }, EditHistory.Message.Undo())
    expect(undone).toEqual({ past: ['a'], present: 'b', future: ['c'], group: null })
    expect(canRedo(undone)).toBe(true)
    const redone = send({ doc: undone }, EditHistory.Message.Redo())
    expect(redone).toEqual(c)
    const cleared = send({ doc: redone }, EditHistory.Message.Clear())
    expect(cleared).toEqual({ past: [], present: 'c', future: [], group: null })
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
    expect(d).toEqual({ past: ['b', 'c'], present: 'd', future: [], group: null })
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
        { tiny: { past: [], present: 'a', future: [], group: null } },
        TinyDoc.wrapper.make(Tiny.Message.Push({ value: 'b' })),
      ),
    ).model.tiny
    expect(pushed).toEqual({ past: [], present: 'b', future: [], group: null })
    expect(canUndo(pushed)).toBe(false)
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
    expect(typed).toEqual({ past: [''], present: 'Hey', future: [], group: 'title' })
    expect(History.undo(typed).present).toBe('')
    const other = History.push(typed, 'Hey!', { capacity: 10, group: 'body' })
    expect(other.past).toEqual(['', 'Hey'])
    // No group stands alone, even twice.
    const plain = History.push(History.push(other, 'a', { capacity: 10 }), 'b', { capacity: 10 })
    expect(plain.past).toEqual(['', 'Hey', 'Hey!', 'a'])
  })

  it('breaks a group at an undo, so the next push of it is its own step', () => {
    const one = History.push(History.start('a'), 'b', { capacity: 10, group: 'g' })
    const back = History.undo(History.push(one, 'c', { capacity: 10, group: 'g' }))
    expect(back.group).toBeNull()
    expect(History.push(back, 'd', { capacity: 10, group: 'g' }).past).toEqual(['a'])
  })

  it('groups through the placed bundle too', () => {
    const typed = [
      EditHistory.Message.Push({ value: 'b', group: 'x' }),
      EditHistory.Message.Push({ value: 'bc', group: 'x' }),
    ].reduce<Model>((model, message) => ({ doc: send(model, message) }), fresh)
    expect(typed.doc).toEqual({ past: ['a'], present: 'bc', future: [], group: 'x' })
  })

  it('keeps a stored history, its group included, through its Schema', () => {
    const model = History.push(History.start('a'), 'b', { capacity: 10, group: 'g' })
    const stored = JSON.parse(JSON.stringify(Schema.encodeSync(HistoryModel(Schema.String))(model)))
    expect(Schema.decodeUnknownSync(HistoryModel(Schema.String))(stored)).toEqual(model)
  })
})
