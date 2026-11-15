/**
 * Box: the limits a moved or resized box obeys (bounds, grid, size, aspect),
 * a group kept in shape, and the keys that nudge: pure functions, so a drag's
 * deltas and a key's meet the same rules.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import type { KeyPress } from '../src/events/index.js'
import { Box } from '../src/state/index.js'

const press = (overrides: Partial<KeyPress>): KeyPress => ({
  key: 'ArrowRight',
  repeat: false,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  ...overrides,
})

const box = (x: number, y: number, width = 20, height = 10): Box.Box => ({ x, y, width, height })
const area: Box.Area = { left: 0, top: 0, right: 100, bottom: 50 }

describe('Box.moveBy', () => {
  it('moves by the delta', () => {
    expect(Box.moveBy(box(10, 10), 5, -3)).toEqual(box(15, 7))
  })

  it.each([
    ['left', -50, 0, box(0, 10)],
    ['right', 500, 0, box(80, 10)],
    ['top', 0, -50, box(10, 0)],
    ['bottom', 0, 500, box(10, 40)],
  ])('stops at the %s of the area', (_edge, dx, dy, expected) => {
    expect(Box.moveBy(box(10, 10), dx, dy, { bounds: area })).toEqual(expected)
  })

  it('lands on the grid, on the axes that move', () => {
    expect(Box.moveBy(box(10, 10), 7, 4, { snap: 10 })).toEqual(box(20, 10))
    expect(Box.moveBy(box(13, 13), 7, 0, { snap: 10 })).toEqual(box(20, 13))
  })

  it('snaps first and then limits, so the area wins over the grid', () => {
    expect(Box.moveBy(box(10, 10), 90, 0, { snap: 25, bounds: area })).toEqual(box(80, 10))
  })

  it('returns the box it was given when nothing moves', () => {
    const given = box(0, 0)
    expect(Box.moveBy(given, 0, 0)).toBe(given)
    expect(Box.moveBy(given, -5, -5, { bounds: area })).toBe(given)
    expect(Box.moveBy(given, 3, 0, { snap: 10 })).toBe(given)
  })

  it('refuses a delta that is not a number', () => {
    const given = box(5, 5)
    expect(Box.moveBy(given, Infinity, 0)).toBe(given)
    expect(Box.moveBy(given, Number.NaN, 0)).toBe(given)
  })
})

describe('Box.moveEach', () => {
  const boxes = { a: box(10, 10), b: box(30, 20), c: box(60, 30) }

  it('moves the named boxes together and leaves the rest', () => {
    const moved = Box.moveEach(boxes, ['a', 'b'], 5, 5)
    expect(moved).toEqual({ a: box(15, 15), b: box(35, 25), c: box(60, 30) })
    expect(moved.c).toBe(boxes.c)
  })

  it('holds the group inside the area as a whole, keeping its shape', () => {
    // b would stop at x 80 alone, but a stays 20 behind it, not squashed against it.
    const moved = Box.moveEach(boxes, ['a', 'b'], 500, 0, { bounds: area })
    expect(moved.a.x).toBe(60)
    expect(moved.b.x).toBe(80)
    expect(moved.b.x - moved.a.x).toBe(boxes.b.x - boxes.a.x)
  })

  it('lands the first named box on the grid and moves the others by the same amount', () => {
    const moved = Box.moveEach(boxes, ['b', 'a'], 4, 0, { snap: 10 })
    expect(moved.b.x).toBe(30)
    expect(Box.moveEach(boxes, ['b', 'a'], 7, 0, { snap: 10 })).toEqual({
      a: box(20, 10),
      b: box(40, 20),
      c: box(60, 30),
    })
  })

  it('skips an id the record does not hold, and an inherited name', () => {
    const loose: Readonly<Record<string, Box.Box>> = boxes
    expect(Box.moveEach(loose, ['a', 'nope', 'constructor', 'toString'], 1, 0)).toEqual({
      ...boxes,
      a: box(11, 10),
    })
    expect(Box.moveEach(loose, ['constructor'], 1, 0)).toBe(loose)
  })

  it('returns the record it was given for no ids, no delta, or a group already at the edge', () => {
    expect(Box.moveEach(boxes, [], 5, 5)).toBe(boxes)
    expect(Box.moveEach(boxes, ['a'], 0, 0)).toBe(boxes)
    expect(Box.moveEach({ a: box(0, 0) }, ['a'], -5, 0, { bounds: area })).toEqual({ a: box(0, 0) })
    const edge = { a: box(0, 0) }
    expect(Box.moveEach(edge, ['a'], -5, 0, { bounds: area })).toBe(edge)
  })

  it('keeps a group wider than the area at its start edge', () => {
    const wide = { a: box(0, 0, 200, 10) }
    expect(Box.moveEach(wide, ['a'], 30, 0, { bounds: area })).toBe(wide)
  })

  it('writes an id named __proto__ as a property of its own', () => {
    const hostile: Record<string, Box.Box> = JSON.parse(
      '{"__proto__":{"x":1,"y":1,"width":2,"height":2}}',
    )
    const moved = Box.moveEach(hostile, ['__proto__'], 5, 0)
    expect(Object.hasOwn(moved, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(moved)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(moved, '__proto__')?.value).toEqual(box(6, 1, 2, 2))
  })
})

describe('Box.resize', () => {
  const from = box(40, 20, 20, 10)

  it.each([
    ['e', 5, 0, box(40, 20, 25, 10)],
    ['w', -5, 0, box(35, 20, 25, 10)],
    ['s', 0, 5, box(40, 20, 20, 15)],
    ['n', 0, -5, box(40, 15, 20, 15)],
    ['se', 5, 5, box(40, 20, 25, 15)],
    ['nw', -5, -5, box(35, 15, 25, 15)],
    ['ne', 5, -5, box(40, 15, 25, 15)],
    ['sw', -5, 5, box(35, 20, 25, 15)],
  ] as const)(
    'the %s handle moves its own edges and keeps the opposite ones',
    (handle, dx, dy, expected) => {
      expect(Box.resize(from, handle, dx, dy)).toEqual(expected)
    },
  )

  it('an edge handle ignores the other axis', () => {
    expect(Box.resize(from, 'e', 5, 99)).toEqual(box(40, 20, 25, 10))
    expect(Box.resize(from, 's', 99, 5)).toEqual(box(40, 20, 20, 15))
  })

  it('does not shrink below the minimum, and the opposite edge stays put', () => {
    const smallest = { width: 8, height: 4 }
    expect(Box.resize(from, 'w', 100, 0, { min: smallest })).toEqual(box(52, 20, 8, 10))
    expect(Box.resize(from, 'n', 0, 100, { min: smallest })).toEqual(box(40, 26, 20, 4))
    expect(Box.resize(from, 'e', -100, 0)).toEqual(box(40, 20, 1, 10))
  })

  it('does not grow past the maximum or out of the area', () => {
    expect(Box.resize(from, 'e', 100, 0, { max: { width: 30, height: 10 } })).toEqual(
      box(40, 20, 30, 10),
    )
    expect(Box.resize(from, 'e', 100, 0, { bounds: area })).toEqual(box(40, 20, 60, 10))
    expect(Box.resize(from, 'w', -100, 0, { bounds: area })).toEqual(box(0, 20, 60, 10))
    expect(Box.resize(from, 'se', 100, 100, { bounds: area })).toEqual(box(40, 20, 60, 30))
  })

  it('lands a moving edge on the grid, and the limits still win', () => {
    expect(Box.resize(from, 'e', 7, 0, { snap: 10 })).toEqual(box(40, 20, 30, 10))
    expect(Box.resize(from, 'w', -7, 0, { snap: 10 })).toEqual(box(30, 20, 30, 10))
    expect(Box.resize(from, 'e', 33, 0, { snap: 25, bounds: area })).toEqual(box(40, 20, 60, 10))
  })

  describe('aspect ratio', () => {
    const wide = box(10, 10, 40, 20)
    const ratio = 2

    it('an east edge sets the height about the middle', () => {
      expect(Box.resize(wide, 'e', 20, 0, { aspect: ratio })).toEqual(box(10, 5, 60, 30))
    })

    it('a south edge sets the width about the middle', () => {
      expect(Box.resize(wide, 's', 0, 10, { aspect: ratio })).toEqual(box(0, 10, 60, 30))
    })

    it('a corner follows the edge that moved further', () => {
      expect(Box.resize(wide, 'se', 20, 1, { aspect: ratio })).toEqual(box(10, 10, 60, 30))
      expect(Box.resize(wide, 'se', 1, 20, { aspect: ratio })).toEqual(box(10, 10, 80, 40))
    })

    it('stays in the ratio at the area’s edge and at the minimum', () => {
      const grown = Box.resize(wide, 'se', 500, 500, { aspect: ratio, bounds: area })
      expect(grown.width / grown.height).toBe(ratio)
      expect(grown.x + grown.width).toBeLessThanOrEqual(area.right)
      expect(grown.y + grown.height).toBeLessThanOrEqual(area.bottom)
      const shrunk = Box.resize(wide, 'se', -500, -500, {
        aspect: ratio,
        min: { width: 4, height: 4 },
      })
      expect(shrunk.width / shrunk.height).toBe(ratio)
      expect(shrunk.height).toBeGreaterThanOrEqual(4)
    })
  })

  it('returns the box it was given when nothing changes', () => {
    expect(Box.resize(from, 'e', 0, 0)).toBe(from)
    expect(Box.resize(from, 'e', -100, 0, { min: { width: 20, height: 1 } })).toBe(from)
  })

  it('a delta of infinity goes as far as the limits allow, and is refused with none', () => {
    expect(Box.resize(from, 'e', Infinity, 0, { bounds: area })).toEqual(box(40, 20, 60, 10))
    expect(Box.resize(from, 'e', -Infinity, 0)).toEqual(box(40, 20, 1, 10))
    expect(Box.resize(from, 'e', Infinity, 0)).toBe(from)
    expect(Box.resize(from, 'e', Number.NaN, 0)).toBe(from)
  })
})

describe('Box.moveKey', () => {
  it.each([
    ['ArrowRight', { dx: 1, dy: 0 }],
    ['ArrowLeft', { dx: -1, dy: 0 }],
    ['ArrowDown', { dx: 0, dy: 1 }],
    ['ArrowUp', { dx: 0, dy: -1 }],
  ])('Alt with %s nudges one step', (key, delta) => {
    expect(Box.moveKey(press({ key, alt: true }))).toEqual(Option.some(delta))
  })

  it('takes the step, the larger step with Shift, and ten steps by default', () => {
    expect(Box.moveKey(press({ alt: true }), { step: 4 })).toEqual(Option.some({ dx: 4, dy: 0 }))
    expect(Box.moveKey(press({ alt: true, shift: true }), { step: 4 })).toEqual(
      Option.some({ dx: 40, dy: 0 }),
    )
    expect(Box.moveKey(press({ alt: true, shift: true }), { step: 4, largeStep: 25 })).toEqual(
      Option.some({ dx: 25, dy: 0 }),
    )
  })

  it('leaves a plain arrow, another key, and a browser chord alone', () => {
    expect(Box.moveKey(press({}))).toEqual(Option.none())
    expect(Box.moveKey(press({ key: 'a', alt: true }))).toEqual(Option.none())
    expect(Box.moveKey(press({ alt: true, ctrl: true }))).toEqual(Option.none())
    expect(Box.moveKey(press({ alt: true, meta: true }))).toEqual(Option.none())
  })

  it('keeps a repeat, so holding the key keeps nudging', () => {
    expect(Option.isSome(Box.moveKey(press({ alt: true, repeat: true })))).toBe(true)
  })
})

describe('Box.resizeKey', () => {
  it('an east handle reads Left and Right, and a south one Up and Down', () => {
    expect(Box.resizeKey(press({ key: 'ArrowRight' }), 'e')).toEqual(Option.some({ dx: 1, dy: 0 }))
    expect(Box.resizeKey(press({ key: 'ArrowLeft' }), 'e')).toEqual(Option.some({ dx: -1, dy: 0 }))
    expect(Box.resizeKey(press({ key: 'ArrowUp' }), 'e')).toEqual(Option.none())
    expect(Box.resizeKey(press({ key: 'ArrowDown' }), 's')).toEqual(Option.some({ dx: 0, dy: 1 }))
    expect(Box.resizeKey(press({ key: 'ArrowRight' }), 's')).toEqual(Option.none())
  })

  it('a corner reads all four arrows', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(Option.isSome(Box.resizeKey(press({ key }), 'se'))).toBe(true)
    }
  })

  it('Shift takes the larger step', () => {
    expect(Box.resizeKey(press({ shift: true }), 'e', { step: 2 })).toEqual(
      Option.some({ dx: 20, dy: 0 }),
    )
  })

  it.each([
    ['e', 'Home', { dx: -Infinity, dy: 0 }],
    ['e', 'End', { dx: Infinity, dy: 0 }],
    ['w', 'Home', { dx: Infinity, dy: 0 }],
    ['w', 'End', { dx: -Infinity, dy: 0 }],
    ['s', 'Home', { dx: 0, dy: -Infinity }],
    ['n', 'End', { dx: 0, dy: -Infinity }],
    ['se', 'End', { dx: Infinity, dy: Infinity }],
  ] as const)('on the %s handle %s is the smallest or largest', (handle, key, delta) => {
    expect(Box.resizeKey(press({ key }), handle)).toEqual(Option.some(delta))
  })

  it('Home and End through resize reach the minimum and the area', () => {
    const from = box(40, 20, 20, 10)
    const limits = { bounds: area, min: { width: 5, height: 5 } }
    const smallest = Option.getOrThrow(Box.resizeKey(press({ key: 'Home' }), 'w'))
    const largest = Option.getOrThrow(Box.resizeKey(press({ key: 'End' }), 'w'))
    expect(Box.resize(from, 'w', smallest.dx, smallest.dy, limits)).toEqual(box(55, 20, 5, 10))
    expect(Box.resize(from, 'w', largest.dx, largest.dy, limits)).toEqual(box(0, 20, 60, 10))
  })

  it('leaves another key, and a press with a modifier, alone', () => {
    expect(Box.resizeKey(press({ key: 'a' }), 'e')).toEqual(Option.none())
    expect(Box.resizeKey(press({ alt: true }), 'e')).toEqual(Option.none())
    expect(Box.resizeKey(press({ ctrl: true }), 'e')).toEqual(Option.none())
    expect(Box.resizeKey(press({ meta: true, key: 'Home' }), 'e')).toEqual(Option.none())
  })
})

describe('a key and a drag meet the same limits', () => {
  it('a nudge past the edge stops where a drag does', () => {
    const delta = Option.getOrThrow(Box.moveKey(press({ alt: true, shift: true }), { step: 100 }))
    const nudged = Box.moveBy(box(10, 10), delta.dx, delta.dy, { bounds: area })
    expect(nudged).toEqual(Box.moveBy(box(10, 10), 1000, 0, { bounds: area }))
    expect(nudged.x).toBe(80)
  })
})
