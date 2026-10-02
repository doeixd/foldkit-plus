import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Page } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const tree = Inert.draw(Page, {
  count: 3,
  renderedAt: '2026-07-26T00:00:00.000Z',
  renderedOn: 'Server',
})

describe('the page', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
    expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
  })
})
