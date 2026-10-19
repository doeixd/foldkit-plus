/**
 * The Drawer's state: a press toggles it, the click after a drag does not,
 * and a release settles by its speed, then by how far it came.
 */
import { describe, expect, it } from 'vitest'
import * as Drawer from '../src/drawer.js'

const after = (model: Drawer.Model, ...messages: ReadonlyArray<Drawer.Message>) =>
  messages.reduce(Drawer.update, model)
const down = Drawer.init({ id: 'tools' })
const up = Drawer.init({ id: 'tools', open: true })
const release = (delta: number, velocity = 0) => [
  Drawer.Message.Grabbed({ size: 400, from: 'handle' }),
  Drawer.Message.Dragged({ delta }),
  Drawer.Message.Released({ delta, velocity, completed: true }),
]

describe('Drawer', () => {
  it('starts down unless asked open, and a press toggles it', () => {
    expect(down.open).toBe(false)
    expect(after(down, Drawer.Message.Pressed()).open).toBe(true)
    expect(after(up, Drawer.Message.Pressed()).open).toBe(false)
  })

  it('passes over the click a drag ends with, and takes the next press', () => {
    const dragged = after(up, ...release(200))
    expect(dragged.open).toBe(false)
    expect(after(dragged, Drawer.Message.Pressed()).open).toBe(false)
    expect(after(dragged, Drawer.Message.Pressed(), Drawer.Message.Pressed()).open).toBe(true)
    // A new press on the handle forgets the drag before it.
    expect(
      after(
        dragged,
        Drawer.Message.Grabbed({ size: 400, from: 'handle' }),
        Drawer.Message.Pressed(),
      ).open,
    ).toBe(true)
  })

  it('takes the next press after a swipe on a grip, which ends with no click', () => {
    const swiped = after(
      up,
      Drawer.Message.Grabbed({ size: 400, from: 'grip' }),
      Drawer.Message.Dragged({ delta: 200 }),
      Drawer.Message.Released({ delta: 200, velocity: 0, completed: true }),
    )
    expect(swiped.open).toBe(false)
    // A key or a tap on the handle next is a press, not the end of a drag.
    expect(after(swiped, Drawer.Message.Pressed()).open).toBe(true)
  })

  it('leaves a press that barely moves to its click', () => {
    const pressed = after(up, ...release(2))
    expect(pressed.open).toBe(true)
    expect(pressed.dragged).toBe(false)
    expect(after(pressed, Drawer.Message.Pressed()).open).toBe(false)
  })

  it.each([
    ['open, dragged past a quarter', true, 120, 0, false],
    ['open, dragged short of it', true, 80, 0, true],
    ['open, flicked down however short', true, 10, 0.9, false],
    ['open, dragged down but flicked up', true, 150, -0.9, true],
    ['down, dragged up past a quarter', false, -110, 0, true],
    ['down, dragged up short of it', false, -60, 0, false],
    ['down, flicked up', false, -10, -0.9, true],
  ] as const)('settles %s', (_, open, delta, velocity, staysOpen) => {
    expect(after(open ? up : down, ...release(delta, velocity)).open).toBe(staysOpen)
  })

  it('ends a cancelled drag where it began, and hands back the Model for no change', () => {
    const cancelled = after(
      up,
      Drawer.Message.Grabbed({ size: 400, from: 'handle' }),
      Drawer.Message.Released({ delta: 300, velocity: 0, completed: false }),
    )
    expect([cancelled.open, cancelled.drag._tag]).toEqual([true, 'None'])
    expect(Drawer.update(up, Drawer.Message.Dragged({ delta: 5 }))).toBe(up)
    expect(Drawer.open(up)).toBe(up)
    expect(Drawer.close(down)).toBe(down)
  })

  it('reads how far down a drag has it, from 0 open to 1 down', () => {
    expect(Drawer.progress(up, { size: 400, delta: 100 })).toBe(0.25)
    expect(Drawer.progress(down, { size: 400, delta: -100 })).toBe(0.75)
    expect(Drawer.progress(up, { size: 400, delta: -50 })).toBe(0)
    expect(Drawer.progress(down, { size: 400, delta: 80 })).toBe(1)
  })
})
