/**
 * What the box's `update` decides, with no page: a key and a drag obey one
 * set of limits, a drag is measured from where it began, and Escape puts the
 * start back.
 */
import { Option } from 'effect'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { AREA, GRID, MIN, Message, initial, update, type Model } from '../src/box/app.js'
import { runDemo } from '../src/box/demo.js'
import { MovableBox } from '../src/box/view.js'
import { pageStylesheet } from '../src/style.js'

const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

const start = initial().model

describe('a key', () => {
  it.each([
    ['right', { dx: GRID, dy: 0 }, { x: 80, y: 40 }],
    ['up', { dx: 0, dy: -GRID }, { x: 60, y: 20 }],
    ['past the right edge', { dx: 1000, dy: 0 }, { x: AREA.right - 100, y: 40 }],
    ['past the top', { dx: 0, dy: -1000 }, { x: 60, y: AREA.top }],
  ])('nudges %s by the grid and stops at the bounds', (_name, delta, at) => {
    expect(run(start, Message.Nudged(delta)).rect).toMatchObject(at)
  })

  it('hands back the Model it was given when the box is already at the bound', () => {
    const edge = run(start, Message.Nudged({ dx: 1000, dy: 0 }))
    expect(update(edge, Message.Nudged({ dx: GRID, dy: 0 })).model).toBe(edge)
  })

  it('resizes the south-east corner by the grid, within the area and above the smallest size', () => {
    expect(run(start, Message.ResizedByKey({ dx: GRID, dy: 0 })).rect).toMatchObject({
      width: 120,
      height: 80,
    })
    expect(run(start, Message.ResizedByKey({ dx: 1000, dy: 1000 })).rect).toMatchObject({
      width: AREA.right - 60,
      height: AREA.bottom - 40,
    })
    expect(run(start, Message.ResizedByKey({ dx: -1000, dy: -1000 })).rect).toMatchObject({
      width: MIN.width,
      height: MIN.height,
    })
  })
})

describe('a drag', () => {
  it('snaps to the grid, measured from where the drag began', () => {
    const dragging = run(
      start,
      Message.DragStarted({ mode: 'move' }),
      Message.Dragged({ dx: 35, dy: 25 }),
    )
    expect(dragging.rect).toMatchObject({ x: 100, y: 60 })
    // The next move is again from the start: going back to 0 puts the box back.
    expect(run(dragging, Message.Dragged({ dx: 0, dy: 0 })).rect).toEqual(start.rect)
  })

  it('resizes from the start rectangle with the same limits', () => {
    const resized = run(
      start,
      Message.DragStarted({ mode: 'resize' }),
      Message.Dragged({ dx: 45, dy: 25 }),
    )
    expect(resized.rect).toMatchObject({ x: 60, y: 40, width: 140, height: 100 })
  })

  it('keeps the box where it was dropped on a completed end, and drops the drag', () => {
    const dropped = run(
      start,
      Message.DragStarted({ mode: 'move' }),
      Message.Dragged({ dx: 40, dy: 0 }),
      Message.DragEnded({ completed: true }),
    )
    expect(dropped.rect).toMatchObject({ x: 100 })
    expect(Option.isNone(dropped.drag)).toBe(true)
  })

  it('puts the start back on a cancelled end', () => {
    const cancelled = run(
      start,
      Message.DragStarted({ mode: 'move' }),
      Message.Dragged({ dx: 40, dy: 40 }),
      Message.DragEnded({ completed: false }),
    )
    expect(cancelled.rect).toEqual(start.rect)
    expect(Option.isNone(cancelled.drag)).toBe(true)
  })

  it('ignores a second start while one is open, and a move or end with none open', () => {
    const open = run(
      start,
      Message.DragStarted({ mode: 'move' }),
      Message.Dragged({ dx: 40, dy: 0 }),
    )
    expect(update(open, Message.DragStarted({ mode: 'resize' })).model).toBe(open)
    expect(update(start, Message.Dragged({ dx: 40, dy: 0 })).model).toBe(start)
    expect(update(start, Message.DragEnded({ completed: false })).model).toBe(start)
  })
})

describe('the view', () => {
  it('draws only Slots and a place only as custom properties', () => {
    const tree = Inert.draw(MovableBox, start)
    expect(Inert.unslotted(tree)).toEqual([])
    expect(Inert.fixedInline(tree)).toEqual([])
    expect(Inert.missingTokens(tree, pageStylesheet)).toEqual([])
  })
})

describe('the demo trace', () => {
  it('prints a key, a snapped drag and a cancelled resize', () => {
    expect(runDemo()).toEqual([
      'start: x 60, y 40, 100 by 80',
      'one step right: x 80, y 40, 100 by 80',
      'dragged by 35, 25: x 120, y 60, 100 by 80',
      'a resize cancelled: x 120, y 60, 100 by 80',
    ])
  })
})
