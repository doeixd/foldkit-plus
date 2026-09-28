import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, Page } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const trees = [AppRoute.Home(), AppRoute.About(), AppRoute.NotFound({ path: '/missing' })].map(
  route => [route._tag, Inert.draw(Page, { route, count: 3 })] as const,
)

describe('the pages', () => {
  test.each(trees)(
    '%s draws every element through a Slot, so a Style can reach all of it',
    (_, tree) => {
      expect(Inert.unslotted(tree)).toEqual([])
    },
  )

  test.each(trees)(
    '%s ships every theme token the drawn styles read in the stylesheet',
    (_, tree) => {
      expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
    },
  )
})
