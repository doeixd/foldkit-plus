/**
 * InlineEdit's transitions, placed in a parent that saves a title and
 * refuses an empty one, and the keys where a value shows. Focus and real
 * keys are `inline-edit.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { InlineEdit } from '../src/interaction/index.js'

const Title = Bundle.declare(InlineEdit.bundle, 'title')
const Model = Schema.Struct({ ...Title.fields, saved: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Title.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const placeWith = (blur: InlineEdit.Args['blur']) => {
  const placed = Page.at(Title, {
    args: { id: 'title', blur },
    onOut:
      (out: InlineEdit.Committed) =>
      (model: Model): Update.Return<Model, Message> =>
        out.value.trim() === ''
          ? placed.helpers.refuse(out, 'A title is needed')(model)
          : { model: { ...model, saved: [...model.saved, `${out.id}=${out.value}`] } },
  })
  return placed
}
const committing = placeWith('commit')
const fresh: Model = { title: { editing: Option.none() }, saved: [] }
const M = InlineEdit.Message

const run = (
  model: Model,
  messages: ReadonlyArray<InlineEdit.Message>,
  placed: ReturnType<typeof placeWith> = committing,
) => {
  let last: { model: Model; commands: ReadonlyArray<{ readonly name: string }> } = {
    model,
    commands: [],
  }
  for (const message of messages) {
    const next = Option.getOrThrow(placed.update(last.model, Title.wrapper.make(message)))
    last = { model: next.model, commands: next.commands ?? [] }
  }
  return last
}
const editing = (model: Model) => Option.getOrNull(model.title.editing)

describe('InlineEdit placement', () => {
  it('starts with the text selected, and a second start of the same item is a no-op', () => {
    const started = run(fresh, [M.Started({ id: 'a', text: 'Plan' })])
    expect(editing(started.model)).toEqual({
      id: 'a',
      initial: 'Plan',
      draft: 'Plan',
      error: Option.none(),
    })
    expect(started.commands.map(command => command.name)).toEqual(['InlineEdit.focusInput'])
    expect(run(started.model, [M.Started({ id: 'a', text: 'Plan' })]).model).toBe(started.model)
  })

  it('a key where the value shows starts over with it, then keeps every key before the field is drawn', () => {
    const typed = run(fresh, [
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'N' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'e' }),
    ])
    expect(editing(typed.model)).toMatchObject({ initial: 'Plan', draft: 'Ne' })
    // Enter selected the text; the keys after it replace it, as they would in the field.
    const entered = run(fresh, [
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'Enter' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'N' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'o' }),
    ])
    expect(editing(entered.model)).toMatchObject({ initial: 'Plan', draft: 'No' })
    // Backspace deletes the selection, then a character; F2 again changes nothing.
    const deleted = run(fresh, [
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'F2' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'Backspace' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'a' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'b' }),
      M.KeyedOver({ id: 'a', text: 'Plan', key: 'Backspace' }),
    ])
    expect(editing(deleted.model)).toMatchObject({ initial: 'Plan', draft: 'a' })
    expect(run(deleted.model, [M.KeyedOver({ id: 'a', text: 'Plan', key: 'F2' })]).model).toBe(
      deleted.model,
    )
    // A second Enter commits what the keys before it typed.
    const committed = run(entered.model, [M.KeyedOver({ id: 'a', text: 'Plan', key: 'Enter' })])
    expect(committed.model.saved).toEqual(['a=No'])
    // Backspace where the value shows, not editing, starts nothing.
    expect(run(fresh, [M.KeyedOver({ id: 'a', text: 'Plan', key: 'Backspace' })]).model).toBe(fresh)
  })

  it('Enter commits a changed draft to the parent, and an unchanged one commits nothing', () => {
    const saved = run(fresh, [
      M.Started({ id: 'a', text: 'Plan' }),
      M.Changed({ id: 'a', text: 'Plans' }),
      M.Entered({ id: 'a' }),
    ])
    expect(saved.model.saved).toEqual(['a=Plans'])
    expect(editing(saved.model)).toBeNull()
    expect(saved.commands.map(command => command.name)).toEqual(['InlineEdit.returnFocus'])
    const unchanged = run(fresh, [M.Started({ id: 'a', text: 'Plan' }), M.Entered({ id: 'a' })])
    expect(unchanged.model.saved).toEqual([])
    expect(editing(unchanged.model)).toBeNull()
  })

  it('a refused commit stays open on its draft with the reason, until the draft changes', () => {
    const refused = run(fresh, [
      M.Started({ id: 'a', text: 'Plan' }),
      M.Changed({ id: 'a', text: ' ' }),
      M.Entered({ id: 'a' }),
    ])
    expect(refused.model.saved).toEqual([])
    expect(editing(refused.model)).toEqual({
      id: 'a',
      initial: 'Plan',
      draft: ' ',
      error: Option.some('A title is needed'),
    })
    expect(InlineEdit.errorOf(refused.model.title)).toEqual(Option.some('A title is needed'))
    const fixing = run(refused.model, [M.Changed({ id: 'a', text: ' x' })]).model
    expect(editing(fixing)).toMatchObject({ draft: ' x', error: Option.none() })
    // The same text again changes nothing.
    expect(run(fixing, [M.Changed({ id: 'a', text: ' x' })]).model).toBe(fixing)
  })

  it('Escape drops the draft and hands focus back', () => {
    const cancelled = run(fresh, [
      M.Started({ id: 'a', text: 'Plan' }),
      M.Changed({ id: 'a', text: 'Gone' }),
      M.Escaped({ id: 'a' }),
    ])
    expect(cancelled.model.saved).toEqual([])
    expect(editing(cancelled.model)).toBeNull()
    expect(cancelled.commands.map(command => command.name)).toEqual(['InlineEdit.returnFocus'])
  })

  it('leaving the field commits or cancels as the args say, and takes no focus', () => {
    const steps = [
      M.Started({ id: 'a', text: 'Plan' }),
      M.Changed({ id: 'a', text: 'Plans' }),
      M.Blurred({ id: 'a' }),
    ]
    const committed = run(fresh, steps)
    expect(committed.model.saved).toEqual(['a=Plans'])
    expect(committed.commands).toEqual([])
    const cancelled = run(fresh, steps, placeWith('cancel'))
    expect(cancelled.model.saved).toEqual([])
    expect(editing(cancelled.model)).toBeNull()
    expect(cancelled.commands).toEqual([])
  })

  it('ignores what another item sends, and a leaving after the edit ended', () => {
    const started = run(fresh, [M.Started({ id: 'a', text: 'Plan' })]).model
    for (const message of [
      M.Changed({ id: 'b', text: 'x' }),
      M.Entered({ id: 'b' }),
      M.Escaped({ id: 'b' }),
      M.Blurred({ id: 'b' }),
    ])
      expect(run(started, [message]).model).toBe(started)
    const ended = run(started, [M.Entered({ id: 'a' })]).model
    expect(run(ended, [M.Blurred({ id: 'a' })]).model).toBe(ended)
  })

  it('a parent starts an edit with the start helper', () => {
    const started = committing.helpers.start('a', 'Plan')(fresh)
    expect(editing(started.model)).toMatchObject({ id: 'a', draft: 'Plan' })
  })
})

describe('displayKey', () => {
  const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
  it('sends Enter, F2, Backspace and a printable key other than Space', () => {
    for (const key of ['Enter', 'F2', 'Backspace', 'x'])
      expect(InlineEdit.displayKey('a', 'Plan', key, plain)).toEqual(
        Option.some(M.KeyedOver({ id: 'a', text: 'Plan', key })),
      )
  })
  it('leaves Space, other keys and modified keys alone', () => {
    expect(InlineEdit.displayKey('a', 'Plan', ' ', plain)).toEqual(Option.none())
    expect(InlineEdit.displayKey('a', 'Plan', 'Tab', plain)).toEqual(Option.none())
    expect(InlineEdit.displayKey('a', 'Plan', 'x', { ...plain, ctrlKey: true })).toEqual(
      Option.none(),
    )
    expect(InlineEdit.displayKey('a', 'Plan', 'Enter', { ...plain, shiftKey: true })).toEqual(
      Option.none(),
    )
  })
})
