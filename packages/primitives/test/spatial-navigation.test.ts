/**
 * SpatialNavigation without a layout: the pure `nearest` (cases, then seeded
 * walks over random boards), the placed transitions, and the keys. What
 * the browser measures and focuses is `spatial-navigation.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behaviors } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { SpatialNavigation } from '../src/interaction/index.js'

const { nearest } = SpatialNavigation
type Placed = SpatialNavigation.Placed
type Direction = SpatialNavigation.Direction

const box = (id: string, left: number, top: number, width = 10, height = 10): Placed => ({
  id,
  rect: { left, top, right: left + width, bottom: top + height },
})

describe('nearest', () => {
  it('takes what is straight ahead over what is nearer but to the side', () => {
    const items = [box('a', 0, 0), box('ahead', 100, 0), box('aside', 40, 35)]
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('ahead'))
  })

  it('takes an item inside the cone over a nearer one outside it', () => {
    // `steep` is 20 right and 60 down: nearer by score, but 72° off the axis.
    const items = [box('a', 0, 0), box('cone', 60, 50), box('steep', 20, 60)]
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('cone'))
  })

  it('falls back to an item outside the cone when none is inside it', () => {
    const items = [box('a', 0, 0), box('steep', 20, 60)]
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('steep'))
  })

  it('finds nothing where nothing lies ahead, and nothing for an unknown current', () => {
    const items = [box('a', 0, 0), box('b', 50, 0)]
    expect(nearest(items, 'b', 'right')).toEqual(Option.none())
    expect(nearest(items, 'a', 'up')).toEqual(Option.none())
    expect(nearest(items, 'gone', 'right')).toEqual(Option.none())
  })

  it('is physical: left is the smaller x whatever the reading direction', () => {
    const items = [box('a', 50, 0), box('west', 0, 0), box('east', 100, 0)]
    expect(nearest(items, 'a', 'left')).toEqual(Option.some('west'))
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('east'))
  })

  it('breaks a tie by the order given', () => {
    const items = [box('a', 0, 50), box('upper', 100, 30), box('lower', 100, 70)]
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('upper'))
    const swapped = [items[0]!, items[2]!, items[1]!]
    expect(nearest(swapped, 'a', 'right')).toEqual(Option.some('lower'))
  })

  it('reaches no item centred where the current one is, and treats a box of no size as a point', () => {
    const items = [box('a', 0, 0, 20, 20), box('stacked', 5, 5, 10, 10), box('dot', 40, 10, 0, 0)]
    for (const direction of ['up', 'down', 'left'] as const)
      expect(nearest(items, 'a', direction)).toEqual(Option.none())
    expect(nearest(items, 'a', 'right')).toEqual(Option.some('dot'))
  })
})

/** A small seeded generator, so a failing walk names the seed that found it. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const directions: ReadonlyArray<Direction> = ['up', 'down', 'left', 'right']
const opposite: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}
const centre = (item: Placed) => ({
  x: (item.rect.left + item.rect.right) / 2,
  y: (item.rect.top + item.rect.bottom) / 2,
})

describe('nearest over random boards', () => {
  it('never answers the current item, and every answer lies ahead', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed)
      const items = Array.from({ length: 2 + Math.floor(next() * 12) }, (_, index) =>
        box(`i${index}`, next() * 500, next() * 500, next() * 80, next() * 80),
      )
      for (const item of items) {
        for (const direction of directions) {
          const answer = nearest(items, item.id, direction)
          if (Option.isNone(answer)) continue
          expect(answer.value, `seed ${seed}`).not.toBe(item.id)
          const to = items.find(other => other.id === answer.value)!
          const ahead = {
            up: centre(item).y - centre(to).y,
            down: centre(to).y - centre(item).y,
            left: centre(item).x - centre(to).x,
            right: centre(to).x - centre(item).x,
          }[direction]
          expect(ahead, `seed ${seed}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('a move then its opposite returns, over regular grids of any size and spacing', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = random(seed)
      const columns = 1 + Math.floor(next() * 6)
      const rows = 1 + Math.floor(next() * 6)
      const size = 10 + next() * 60
      const gap = next() * 30
      const items = Array.from({ length: columns * rows }, (_, index) =>
        box(
          `c${index}`,
          (index % columns) * (size + gap),
          Math.floor(index / columns) * (size + gap),
          size,
          size,
        ),
      )
      for (const item of items) {
        for (const direction of directions) {
          const there = nearest(items, item.id, direction)
          if (Option.isNone(there)) continue
          expect(nearest(items, there.value, opposite[direction]), `seed ${seed}`).toEqual(
            Option.some(item.id),
          )
        }
      }
    }
  })
})

const Board = Bundle.declare(SpatialNavigation.bundle, 'board')
const Model = Schema.Struct({ ...Board.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Board.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Board, { args: { id: 'board' } })
const fresh: Model = { board: { current: Option.none() } }
const send = (model: Model, message: SpatialNavigation.Message) =>
  Option.getOrThrow(placed.update(model, Board.wrapper.make(message)))
const M = SpatialNavigation.Message

describe('SpatialNavigation placement', () => {
  it('a focus makes an item current, and the same focus again is a no-op', () => {
    const focused = send(fresh, M.Focused({ id: 'a' })).model
    expect(focused.board.current).toEqual(Option.some('a'))
    expect(send(focused, M.Focused({ id: 'a' })).model).toBe(focused)
    expect(placed.helpers.focus('b')(focused).model.board.current).toEqual(Option.some('b'))
  })

  it('an arrow from the current item asks to measure; with nothing current it does nothing', () => {
    const unfocused = send(fresh, M.Arrowed({ direction: 'right' }))
    expect(unfocused.model).toBe(fresh)
    expect(unfocused.commands).toEqual([])
    const focused = send(fresh, M.Focused({ id: 'a' })).model
    const arrowed = send(focused, M.Arrowed({ direction: 'right' }))
    expect(arrowed.model).toBe(focused)
    expect(arrowed.commands?.map(command => [command.name, command.args])).toEqual([
      ['SpatialNavigation.move', { from: 'a', direction: 'right' }],
    ])
  })

  it('a jump asks to focus the item by id, and a move that found nothing changes nothing', () => {
    const jumped = send(fresh, M.Jumped({ id: 'z' }))
    expect(jumped.model).toBe(fresh)
    expect(jumped.commands?.map(command => [command.name, command.args])).toEqual([
      ['SpatialNavigation.focus', { id: 'z' }],
    ])
    expect(send(fresh, M.Stayed()).model).toBe(fresh)
  })
})

describe('keyMessage', () => {
  const items = Behaviors.Collection.of(['a', 'b', 'c', 'd'], {
    id: id => id,
    disabled: id => id === 'a' || id === 'd',
  })
  const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

  it('arrows ask by direction; Home and End take the first and last enabled item', () => {
    expect(SpatialNavigation.keyMessage(items, 'ArrowUp', plain)).toEqual(
      Option.some(M.Arrowed({ direction: 'up' })),
    )
    expect(SpatialNavigation.keyMessage(items, 'ArrowLeft', plain)).toEqual(
      Option.some(M.Arrowed({ direction: 'left' })),
    )
    expect(SpatialNavigation.keyMessage(items, 'Home', plain)).toEqual(
      Option.some(M.Jumped({ id: 'b' })),
    )
    expect(SpatialNavigation.keyMessage(items, 'End', plain)).toEqual(
      Option.some(M.Jumped({ id: 'c' })),
    )
  })

  it('leaves other keys, modified keys, and Home over nothing enabled to the page', () => {
    expect(SpatialNavigation.keyMessage(items, 'Enter', plain)).toEqual(Option.none())
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const)
      expect(
        SpatialNavigation.keyMessage(items, 'ArrowDown', { ...plain, [modifier]: true }),
      ).toEqual(Option.none())
    const none = Behaviors.Collection.of(['a'], { id: id => id, disabled: () => true })
    expect(SpatialNavigation.keyMessage(none, 'Home', plain)).toEqual(Option.none())
  })
})
