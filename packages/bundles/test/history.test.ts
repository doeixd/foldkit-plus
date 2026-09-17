/**
 * History: push/undo/redo/clear over a text value, bounded capacity,
 * no-op edges, factory validation, and placement through a real assembly.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, history } from '../src/state/index.js'

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
const fresh: Model = { doc: { past: [], present: 'a', future: [] } }

describe('History transitions', () => {
  it('starts from the given initial value', () => {
    expect(placed.init({ doc: { past: ['x'], present: 'y', future: ['z'] } }).model.doc).toEqual({
      past: [],
      present: 'a',
      future: [],
    })
  })

  it('pushes, undoes, redoes, and clears', () => {
    const b = send(fresh, EditHistory.Message.Push({ value: 'b' }))
    expect(b).toEqual({ past: ['a'], present: 'b', future: [] })
    expect(canUndo(b)).toBe(true)
    expect(canRedo(b)).toBe(false)
    const c = send({ doc: b }, EditHistory.Message.Push({ value: 'c' }))
    expect(c).toEqual({ past: ['a', 'b'], present: 'c', future: [] })
    const undone = send({ doc: c }, EditHistory.Message.Undo())
    expect(undone).toEqual({ past: ['a'], present: 'b', future: ['c'] })
    expect(canRedo(undone)).toBe(true)
    const redone = send({ doc: undone }, EditHistory.Message.Redo())
    expect(redone).toEqual(c)
    const cleared = send({ doc: redone }, EditHistory.Message.Clear())
    expect(cleared).toEqual({ past: [], present: 'c', future: [] })
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
    expect(d).toEqual({ past: ['b', 'c'], present: 'd', future: [] })
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
        { tiny: { past: [], present: 'a', future: [] } },
        TinyDoc.wrapper.make(Tiny.Message.Push({ value: 'b' })),
      ),
    ).model.tiny
    expect(pushed).toEqual({ past: [], present: 'b', future: [] })
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
