import { SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, test } from 'vitest'

import type { Message } from '../src/message.js'
import type { Model } from '../src/model.js'
import { stylesheet } from '../src/style.js'
import { Board, view } from '../src/view/index.js'
import {
  addingCardModel,
  boardModel,
  keyboardDraggingModel,
  pointerDraggingModel,
} from './fixtures.js'

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

const models: ReadonlyArray<readonly [string, Model]> = [
  ['at rest', boardModel],
  ['adding a card', addingCardModel],
  ['dragging with the pointer', pointerDraggingModel],
  ['dragging with the keyboard', keyboardDraggingModel],
]

const columnNamed = (tree: Html, name: string): InertNode => {
  const found = Inert.bySlot(tree, 'column').find(
    column => Inert.value(column, 'aria-label') === name,
  )
  if (found === undefined) throw new Error(`no column named ${name}`)
  return found
}

/** What a column's list shows, in order: a card's title, or `placeholder`. */
const listed = (tree: Html, name: string): ReadonlyArray<string> =>
  Inert.children(Inert.bySlot(columnNamed(tree, name), 'cardList')[0]).map(item =>
    Inert.bySlot(item, 'dropPlaceholder').length > 0
      ? 'placeholder'
      : Inert.text(Inert.bySlot(item, 'cardTitle')[0]),
  )

const statesOf = (nodes: ReadonlyArray<InertNode>): ReadonlyArray<unknown> =>
  nodes.map(node => Inert.value(node, 'data-state'))

describe('the board view', () => {
  test('is titled Kanban Board', () => {
    expect(view(boardModel, SlotView.inertBuilder<Message>()).title).toBe('Kanban Board')
  })

  test.each(models)('draws every element through a Slot when %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Board, model))).toEqual([])
  })

  test('a pointer drag lifts the card into the ghost and marks the drop with a placeholder', () => {
    const tree = Inert.draw(Board, pointerDraggingModel)
    expect(listed(tree, 'To Do')).toEqual(['Fix bug', 'Ship it'])
    expect(listed(tree, 'In Progress')).toEqual(['placeholder', 'Review PR'])
    expect(statesOf(Inert.bySlot(tree, 'column'))).toEqual(['idle', 'drop-target', 'idle'])
    const [ghost] = Inert.bySlot(tree, 'ghost')
    expect(Inert.text(ghost)).toBe('Write testsCover the drop.')
    expect(Inert.style(ghost)['transform']).toBe('translate3d(40px, 60px, 0)')
  })

  test('a keyboard drag shows the card itself where it would drop', () => {
    const tree = Inert.draw(Board, keyboardDraggingModel)
    expect(listed(tree, 'To Do')).toEqual(['Fix bug', 'Ship it'])
    expect(listed(tree, 'In Progress')).toEqual(['Review PR', 'Write tests'])
    expect(Inert.bySlot(tree, 'ghost')).toEqual([])
    const moved = Inert.bySlot(tree, 'card').filter(
      card => Inert.value(card, 'data-state') === 'keyboard-dragged',
    )
    expect(moved.map(Inert.text)).toEqual(['Write testsCover the drop.'])
  })

  test('at rest every card and column is idle, with no ghost', () => {
    const tree = Inert.draw(Board, boardModel)
    expect(new Set(statesOf(Inert.bySlot(tree, 'card')))).toEqual(new Set(['idle']))
    expect(statesOf(Inert.bySlot(tree, 'column'))).toEqual(['idle', 'idle', 'idle'])
    expect(Inert.bySlot(tree, 'ghost')).toEqual([])
  })

  test.each([
    ['card', 'keyboard-dragged', keyboardDraggingModel],
    ['column', 'drop-target', pointerDraggingModel],
  ] as const)('styles the %s by its data-state', (slot, state, model) => {
    expect(cssOf(Inert.bySlot(Inert.draw(Board, model), slot))).toContain(`[data-state="${state}"]`)
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      models.flatMap(([, model]) =>
        [...cssOf(Inert.all(Inert.draw(Board, model))).matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        ),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
