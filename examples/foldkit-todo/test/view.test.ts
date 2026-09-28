import { SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Message, type Model, Page, initialModel, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { editingModel, modelWithTodos } from './fixtures.js'

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

const models: ReadonlyArray<readonly [string, Model]> = [
  ['empty', initialModel],
  ['listing', modelWithTodos],
  ['editing', editingModel],
  ['filtered to nothing', modifyFields(initialModel, { filter: () => 'Completed' as const })],
]

const buttonNamed = (tree: Html, name: string): InertNode => {
  const found = Inert.byTag(tree, 'button').find(button => Inert.text(button) === name)
  if (found === undefined) throw new Error(`no button named ${name}`)
  return found
}

describe('the todo view', () => {
  test('counts the active todos in the document title', () => {
    expect(view(modelWithTodos, SlotView.inertBuilder<Message>()).title).toBe('Todos (2)')
  })

  test.each(models)('draws every element through a Slot when %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Page, model))).toEqual([])
  })

  test('fills only the selected filter with the accent', () => {
    const tree = Inert.draw(Page, modifyFields(modelWithTodos, { filter: () => 'Active' as const }))
    const accented = ['All', 'Active', 'Completed'].filter(name =>
      cssOf([buttonNamed(tree, name)]).includes('--_fk-tone-fill:var(--fk-accent-default)'),
    )
    expect(accented).toEqual(['Active'])
  })

  test('strikes through a completed todo only', () => {
    const struck = Inert.bySlot(Inert.draw(Page, modelWithTodos), 'todoText')
      .filter(node => Inert.value(node, 'data-state') === 'completed')
      .map(Inert.text)
    expect(struck).toEqual(['Done task'])
    expect(cssOf(Inert.bySlot(Inert.draw(Page, modelWithTodos), 'todoText'))).toContain(
      '[data-state="completed"]',
    )
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      models.flatMap(([, model]) =>
        [...cssOf(Inert.all(Inert.draw(Page, model))).matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        ),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
