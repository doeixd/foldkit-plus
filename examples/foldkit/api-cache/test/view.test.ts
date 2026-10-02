import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { TabPanel } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { cachedFirstPostModel, loadedStatsModel } from './fixtures.js'

const trees = [Inert.draw(TabPanel, cachedFirstPostModel), Inert.draw(TabPanel, loadedStatsModel)]

describe('the tab panels', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    for (const tree of trees) {
      expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
    }
  })
})
