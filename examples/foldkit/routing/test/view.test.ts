import { Option } from 'effect'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, Page } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { on } from './helpers.js'

/** Every route, the People page through its `h.submodel` too. */
const trees = [
  AppRoute.Home(),
  AppRoute.People({ searchText: Option.none() }),
  AppRoute.Nested(),
  AppRoute.Person({ personId: 1 }),
  AppRoute.Person({ personId: 99 }),
  AppRoute.FilesIndex(),
  AppRoute.Files({ path: ['documents', 'taxes'] }),
  AppRoute.Files({ path: ['documents', 'resume.pdf'] }),
  AppRoute.Files({ path: ['documents', 'missing.txt'] }),
  AppRoute.NotFound({ path: '/missing' }),
].map(route => Inert.draw(Page, on(route)))

describe('the pages', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    for (const tree of trees) {
      expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
    }
  })

  test.each([
    [AppRoute.Home(), 'Home'],
    [AppRoute.Person({ personId: 3 }), 'People'],
    [AppRoute.FilesIndex(), 'Files'],
    [AppRoute.Files({ path: ['photos'] }), 'Files'],
    [AppRoute.Nested(), 'Nested'],
  ])('marks the nav link of the section %o is in as the current page', (route, section) => {
    const tree = Inert.draw(Page, on(route))
    const current = Inert.all(tree).filter(node => Inert.value(node, 'aria-current') === 'page')
    expect(current.map(Inert.text)).toEqual([section])
  })

  test('marks no nav link on a page no section holds', () => {
    const tree = Inert.draw(Page, on(AppRoute.NotFound({ path: '/missing' })))
    expect(Inert.all(tree).filter(node => Inert.value(node, 'aria-current') !== undefined)).toEqual(
      [],
    )
  })
})
