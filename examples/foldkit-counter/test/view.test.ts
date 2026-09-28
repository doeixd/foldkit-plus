import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Counter, type Message, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const tree = Inert.draw(Counter, { count: 0 })

describe('the counter view', () => {
  test('puts the count in the document title', () => {
    expect(view({ count: 3 }, SlotView.inertBuilder<Message>()).title).toBe('Counter: 3')
  })

  test('draws every element through a Slot, so a Style can reach all of it', () => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test('draws each button as a solid Button recipe', () => {
    const buttons = Inert.byTag(tree, 'button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(Inert.css([button])).toContain('background:var(--_fk-tone-fill)')
    }
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
    expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
  })
})
