/**
 * Boxes that move and resize, as pure functions over the box's numbers: the
 * constraints (an area to stay in, a smallest and largest size, an aspect
 * ratio, a grid), a group moved together, and the keys that nudge. The Model
 * holds the boxes and the draft; a pointer drag's deltas (`Move`) and a key's
 * (`Box.moveKey`, `Box.resizeKey`) arrive at the same `moveBy` and `resize`,
 * so a keyboard move and a dragged one obey the same limits.
 */
import { Option } from 'effect'
import type { KeyPress } from '../events/hotkeys.js'

export interface Point {
  readonly x: number
  readonly y: number
}

/** Where a box sits and how big it is, in the units the application uses, usually CSS pixels. */
export interface Box extends Point {
  readonly width: number
  readonly height: number
}

/** The area a box stays inside. */
export interface Area {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** The edge or corner a handle drags, by compass point. */
export type Handle = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface MoveLimits {
  /** The area every moved box stays inside. A group is held inside it as a whole. */
  readonly bounds?: Area | undefined
  /** A grid: the first box named lands on a multiple of it, and the rest keep their distance from it. */
  readonly snap?: number | undefined
}

export interface ResizeLimits {
  readonly bounds?: Area | undefined
  /** The smallest the box gets. Default 1 by 1. */
  readonly min?: { readonly width: number; readonly height: number } | undefined
  readonly max?: { readonly width: number; readonly height: number } | undefined
  /** Width over height, kept while resizing, like `16 / 9`. */
  readonly aspect?: number | undefined
  /** A grid: the edges a handle moves land on a multiple of it, before the other limits apply. */
  readonly snap?: number | undefined
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const snapTo = (value: number, size: number | undefined): number =>
  size === undefined || size <= 0 || !Number.isFinite(value)
    ? value
    : Math.round(value / size) * size

const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const finite = (box: Box): boolean =>
  Number.isFinite(box.x) &&
  Number.isFinite(box.y) &&
  Number.isFinite(box.width) &&
  Number.isFinite(box.height)

/**
 * Every box in `ids` moved by `dx`, `dy`, one change. The group keeps its
 * shape: the delta is limited so the whole group stays inside `bounds`, rather
 * than each box stopping alone and the group squashing against an edge. With
 * `snap`, the first id lands on the grid and the others move by the same
 * amount. Ids the record does not hold are skipped, and the record comes back
 * as it was when nothing moves, so a no-op records no undo step.
 */
export const moveEach = <Boxes extends Readonly<Record<string, Box>>>(
  boxes: Boxes,
  ids: ReadonlyArray<keyof Boxes & string>,
  dx: number,
  dy: number,
  limits: MoveLimits = {},
): Boxes => {
  const moving = ids.flatMap(id => {
    const box = Object.hasOwn(boxes, id) ? boxes[id] : undefined
    return box === undefined ? [] : [{ id, box }]
  })
  const first = moving[0]
  if (first === undefined || !Number.isFinite(dx + dy)) return boxes
  const area = limits.bounds
  // An axis that is not moving is not snapped: a nudge along x leaves y where it is.
  let moveX = dx === 0 ? 0 : snapTo(first.box.x + dx, limits.snap) - first.box.x
  let moveY = dy === 0 ? 0 : snapTo(first.box.y + dy, limits.snap) - first.box.y
  if (area !== undefined) {
    const lowX = Math.max(...moving.map(({ box }) => area.left - box.x))
    const highX = Math.min(...moving.map(({ box }) => area.right - box.width - box.x))
    const lowY = Math.max(...moving.map(({ box }) => area.top - box.y))
    const highY = Math.min(...moving.map(({ box }) => area.bottom - box.height - box.y))
    // A group wider than the area has no room: it is held at the area's start edge.
    moveX = clamp(moveX, lowX, Math.max(lowX, highX))
    moveY = clamp(moveY, lowY, Math.max(lowY, highY))
  }
  if (moveX === 0 && moveY === 0) return boxes
  const moved = new Map(
    moving.map(({ id, box }) => [id, { ...box, x: box.x + moveX, y: box.y + moveY }]),
  )
  // fromEntries defines an own property for any id, `__proto__` included.
  return Object.fromEntries(
    Object.entries(boxes).map(([id, box]) => [id, moved.get(id) ?? box]),
  ) as Boxes
}

/** One box moved by `dx`, `dy` within the limits; the box as it was when it does not move. */
export const moveBy = (box: Box, dx: number, dy: number, limits: MoveLimits = {}): Box => {
  return moveEach({ box }, ['box'], dx, dy, limits).box
}

/**
 * The box a handle makes when its edges move by `dx` and `dy`, within the
 * limits, as a drag of that handle makes it. A non-finite delta goes as far as
 * the limits allow (Home and End use it), and the box comes back as it was if
 * that would be no limit at all, or changes nothing.
 */
export const resize = (
  from: Box,
  handle: Handle,
  dx: number,
  dy: number,
  limits: ResizeLimits = {},
): Box => {
  const area = limits.bounds
  const left = area?.left ?? -Infinity
  const top = area?.top ?? -Infinity
  const right = area?.right ?? Infinity
  const bottom = area?.bottom ?? Infinity
  const min = limits.min ?? { width: 1, height: 1 }
  const max = limits.max ?? { width: Infinity, height: Infinity }
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  // The edges that stay put, and how far the moving ones may go.
  const anchorX = west ? from.x + from.width : from.x
  const anchorY = north ? from.y + from.height : from.y
  const roomX = Math.min(max.width, west ? anchorX - left : right - anchorX)
  const roomY = Math.min(max.height, north ? anchorY - top : bottom - anchorY)
  // The moving edge goes to the grid first; the limits below still win over it.
  const stepX = west
    ? snapTo(from.x + dx, limits.snap) - from.x
    : east
      ? snapTo(from.x + from.width + dx, limits.snap) - (from.x + from.width)
      : dx
  const stepY = north
    ? snapTo(from.y + dy, limits.snap) - from.y
    : south
      ? snapTo(from.y + from.height + dy, limits.snap) - (from.y + from.height)
      : dy
  let width = west ? from.width - stepX : east ? from.width + stepX : from.width
  let height = north ? from.height - stepY : south ? from.height + stepY : from.height
  const ratio = limits.aspect
  if (ratio !== undefined && ratio > 0) {
    // A corner follows whichever edge moved further; an edge sets the other side.
    if ((west || east) && (north || south)) {
      if (Math.abs(width / from.width - 1) >= Math.abs(height / from.height - 1)) {
        height = width / ratio
      } else {
        width = height * ratio
      }
    } else if (west || east) {
      height = width / ratio
    } else {
      width = height * ratio
    }
    // An edge grows the other side about the box's middle, so it has room on both sides of it.
    const middleY = from.y + from.height / 2
    const middleX = from.x + from.width / 2
    const fitY =
      north || south ? roomY : 2 * Math.min(middleY - top, bottom - middleY, max.height / 2)
    const fitX = west || east ? roomX : 2 * Math.min(middleX - left, right - middleX, max.width / 2)
    width = clamp(width, Math.max(min.width, min.height * ratio), Math.min(fitX, fitY * ratio))
    height = width / ratio
  } else {
    width = clamp(width, min.width, Math.max(min.width, roomX))
    height = clamp(height, min.height, Math.max(min.height, roomY))
  }
  const box: Box = {
    x: west ? anchorX - width : east ? anchorX : from.x + (from.width - width) / 2,
    y: north ? anchorY - height : south ? anchorY : from.y + (from.height - height) / 2,
    width,
    height,
  }
  return finite(box) && !sameBox(box, from) ? box : from
}

const arrows = new Map<string, readonly [number, number]>([
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
])

export interface KeyStep {
  /** How far an arrow moves. Default 1. */
  readonly step?: number | undefined
  /** How far Shift with an arrow moves. Default ten steps. */
  readonly largeStep?: number | undefined
}

export interface Delta {
  readonly dx: number
  readonly dy: number
}

const stepOf = (press: KeyPress, { step = 1, largeStep }: KeyStep): number =>
  press.shift ? (largeStep ?? step * 10) : step

/**
 * What Alt with an arrow asks a box to move: `ArrowRight` is `{ dx: step, dy: 0 }`,
 * with Shift the larger step. None for any other key, and for a press with
 * Control or Meta, whose combinations are the browser's. A held key repeats and
 * keeps nudging, so a repeat is not filtered out here.
 */
export const moveKey = (press: KeyPress, options: KeyStep = {}): Option.Option<Delta> => {
  const direction = arrows.get(press.key)
  if (direction === undefined || !press.alt || press.ctrl || press.meta) return Option.none()
  const by = stepOf(press, options)
  return Option.some({ dx: direction[0] * by, dy: direction[1] * by })
}

/**
 * What a key on a focused handle asks it to do: an arrow moves the handle's own
 * edges (an east handle reads Left and Right only; a corner reads all four),
 * with Shift the larger step, and Home and End take the handle's axes to the
 * smallest and the largest size the limits allow, which is a delta of minus and
 * plus infinity for `resize` to clamp. None for any other key, and for a press
 * with Alt, Control or Meta.
 */
export const resizeKey = (
  press: KeyPress,
  handle: Handle,
  options: KeyStep = {},
): Option.Option<Delta> => {
  if (press.alt || press.ctrl || press.meta) return Option.none()
  const alongX = handle.includes('e') || handle.includes('w')
  const alongY = handle.includes('n') || handle.includes('s')
  // Which way each axis grows: an east or south edge grows with the arrow, a west or north one against it.
  const growX = handle.includes('w') ? -1 : 1
  const growY = handle.includes('n') ? -1 : 1
  if (press.key === 'Home' || press.key === 'End') {
    const toward = press.key === 'End' ? Infinity : -Infinity
    return Option.some({
      dx: alongX ? growX * toward : 0,
      dy: alongY ? growY * toward : 0,
    })
  }
  const direction = arrows.get(press.key)
  if (direction === undefined) return Option.none()
  const [x, y] = direction
  if ((x !== 0 && !alongX) || (y !== 0 && !alongY)) return Option.none()
  const by = stepOf(press, options)
  return Option.some({ dx: x * by, dy: y * by })
}
