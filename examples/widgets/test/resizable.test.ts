import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, update } from '../src/resizable/app.js'
import { Resizable, runDemo } from '../src/resizable/view.js'

const measured = { ...initial, width: 600 }

describe('update flows', () => {
  it('starts even with nothing measured', () => {
    expect(initial.first).toBe(0.5)
    expect(initial.width).toBe(0)
  })

  it('clamps a sized share', () => {
    expect(update(initial, Message.Sized({ first: 0.9 })).model.first).toBe(0.8)
    expect(update(initial, Message.Sized({ first: -1 })).model.first).toBe(0.2)
  })

  it('sizes from where the drag began, not from every step', () => {
    const started = update(measured, Message.DragStarted({})).model
    const moved = update(started, Message.Dragged({ delta: 60 })).model
    expect(moved.first).toBe(0.6)
    expect(update(moved, Message.Dragged({ delta: 60 })).model.first).toBe(0.6)
  })

  it('ignores moves with no drag and no measure', () => {
    expect(update(measured, Message.Dragged({ delta: 60 })).model).toBe(measured)
    expect(update(initial, Message.Dragged({ delta: 60 })).model).toBe(initial)
  })

  it('ignores drags with no measure', () => {
    const started = update(initial, Message.DragStarted({})).model
    expect(started.from).toEqual(Option.some(0.5))
    expect(update(started, Message.Dragged({ delta: 60 })).model).toBe(started)
  })

  it('ending a drag forgets where it began', () => {
    const started = update(measured, Message.DragStarted({})).model
    const ended = update(started, Message.DragEnded({})).model
    expect(ended.from).toEqual(Option.none())
    expect(update(ended, Message.Dragged({ delta: 60 })).model).toBe(ended)
  })
})

describe('view structure', () => {
  it('draws the separator with its range and the panels at their shares', () => {
    const page = Inert.draw(Resizable, initial)
    const handle = Inert.byTag(page, 'div').find(div => Inert.value(div, 'role') === 'separator')
    expect(Inert.value(handle, 'aria-orientation')).toBe('vertical')
    expect(Inert.value(handle, 'aria-valuenow')).toBe('50')
    expect(Inert.value(handle, 'aria-valuemin')).toBe('20')
    expect(Inert.value(handle, 'aria-valuemax')).toBe('80')
    expect(Inert.text(page)).toContain('First panel 50%.')
  })
})

describe('demo', () => {
  it('traces sizing and a drag', () => {
    expect(runDemo()).toEqual([
      'start: first=0.5',
      'sized 0.9: first=0.8 (clamped)',
      'dragged -120 of 600: first=0.6',
    ])
  })
})
