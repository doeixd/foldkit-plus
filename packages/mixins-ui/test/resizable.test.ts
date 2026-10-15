/**
 * Resizable as a transition and as markup: a drag follows the pointer from
 * where it began over the measured group, keys step within the bounds, and
 * the handle is a separator with its value.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, Resizable, ResizableSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const { Message, init, update } = Resizable

describe('Resizable.update', () => {
  it('follows a drag from where it began, over the measured group', () => {
    let model = update(init(0.5), Message.Measured({ size: 600 }))
    model = update(model, Message.DragStarted())
    model = update(model, Message.Dragged({ delta: -120 }))
    expect(model.share).toBe(0.3)
    // A later move is measured from the start again, not from the last move.
    model = update(model, Message.Dragged({ delta: 60 }))
    expect(model.share).toBe(0.6)
  })

  it('holds still before the group is measured, and outside a drag', () => {
    const unmeasured = update(
      update(init(0.5), Message.DragStarted()),
      Message.Dragged({ delta: 99 }),
    )
    expect(unmeasured.share).toBe(0.5)
    const idle = update(init(0.5), Message.Dragged({ delta: 99 }))
    expect(idle).toEqual(init(0.5))
  })

  it('keeps a share within its bounds, and returns the same Model when nothing changes', () => {
    expect(update(init(0.5), Message.Set({ share: 2 }), { max: 0.8 }).share).toBe(0.8)
    const model = init(0.5)
    expect(update(model, Message.Set({ share: 0.5 }))).toBe(model)
  })
})

describe('Resizable.view', () => {
  const style = Style.forSlots(ResizableSlots)(Recipes.Resizable({}))

  it('meets the window splitter pattern', () => {
    expect(A11y.validate(Patterns.Resizable, ResizableSlots)).toEqual([])
  })

  it('draws the handle as a separator with its value, a tab stop', () => {
    const drawn = Resizable.view(
      {
        model: init(0.35),
        onMessage: () => message('Other'),
        label: 'Resize the list',
        first: h.p([], ['one']),
        second: h.p([], ['two']),
        style,
      },
      h,
    )
    const [handle] = Inert.all(drawn).filter(node => Inert.value(node, 'role') === 'separator')
    expect(Inert.value(handle, 'aria-valuenow')).toBe('35')
    expect(Inert.value(handle, 'aria-orientation')).toBe('vertical')
    expect(Inert.value(handle, 'tabIndex')).toBe(0)
  })
})
