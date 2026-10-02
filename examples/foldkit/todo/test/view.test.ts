import { SlotView } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Message, type Model, Page, initialModel, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { editingModel, modelWithTodos } from './fixtures.js'

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
      Inert.css([buttonNamed(tree, name)]).includes('--_fk-tone-fill:var(--fk-accent-default)'),
    )
    expect(accented).toEqual(['Active'])
  })

  test('strikes through a completed todo only', () => {
    const struck = Inert.bySlot(Inert.draw(Page, modelWithTodos), 'todoText')
      .filter(node => Inert.value(node, 'data-state') === 'completed')
      .map(Inert.text)
    expect(struck).toEqual(['Done task'])
    expect(Inert.css(Inert.bySlot(Inert.draw(Page, modelWithTodos), 'todoText'))).toContain(
      '[data-state="completed"]',
    )
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    const tree = Inert.draw(Page, modelWithTodos)
    expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
    expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
  })
})
