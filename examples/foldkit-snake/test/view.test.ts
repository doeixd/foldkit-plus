import { SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { GAME } from '../src/constants.js'
import { Snake } from '../src/domain/index.js'
import { Game, type Message, type Model, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

// The snake lies on row 10, head at x 10, body at x 9 and 8.
const model: Model = {
  snake: Snake.create({ x: 10, y: 10 }),
  apple: { x: 15, y: 15 },
  direction: 'Right',
  nextDirection: 'Right',
  gameState: 'Playing',
  points: 30,
  highScore: 0,
}

const tree = Inert.draw(Game, model)

const cells = Inert.bySlot(tree, 'cell')

const cellAt = (drawn: ReadonlyArray<InertNode>, x: number, y: number): unknown =>
  Inert.value(drawn[y * GAME.GRID_SIZE + x], 'data-cell')

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the snake view', () => {
  test('puts the points in the document title', () => {
    expect(view(model, SlotView.inertBuilder<Message>()).title).toBe('Snake | 30 pts')
  })

  test('draws every element through a Slot, so a Style can reach all of it', () => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test('draws the board as rows of cells', () => {
    expect(Inert.bySlot(tree, 'row')).toHaveLength(GAME.GRID_SIZE)
    expect(cells).toHaveLength(GAME.GRID_SIZE * GAME.GRID_SIZE)
  })

  test.each([
    { at: 'the head', x: 10, y: 10, cell: 'Head' },
    { at: 'the first body segment', x: 9, y: 10, cell: 'Body' },
    { at: 'the last body segment', x: 8, y: 10, cell: 'Body' },
    { at: 'the apple', x: 15, y: 15, cell: 'Apple' },
    { at: 'the corner', x: 0, y: 0, cell: 'Empty' },
    { at: 'past the tail', x: 7, y: 10, cell: 'Empty' },
  ])('marks $at as $cell', ({ x, y, cell }) => {
    expect(cellAt(cells, x, y)).toBe(cell)
  })

  test.each([
    { under: 'the head', apple: { x: 10, y: 10 }, cell: 'Head' },
    { under: 'the body', apple: { x: 9, y: 10 }, cell: 'Body' },
  ])('draws $under over an apple beneath it, as upstream does', ({ apple, cell }) => {
    const drawn = Inert.bySlot(
      Inert.draw(Game, modifyFields(model, { apple: () => apple })),
      'cell',
    )
    expect(cellAt(drawn, apple.x, apple.y)).toBe(cell)
    expect(drawn.filter(node => Inert.value(node, 'data-cell') === 'Apple')).toEqual([])
  })

  test.each([
    { cell: 'Empty', token: 'empty' },
    { cell: 'Head', token: 'head' },
    { cell: 'Body', token: 'body' },
    { cell: 'Apple', token: 'apple' },
  ])('colors a $cell cell from its own token', ({ cell, token }) => {
    expect(cssOf(cells.slice(0, 1))).toContain(
      `[data-cell="${cell}"]{background:var(--fk-game-${token})}`,
    )
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      [...cssOf(Inert.all(tree)).matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
