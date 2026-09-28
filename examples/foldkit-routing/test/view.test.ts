import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, Page } from '../src/main.js'
import { PeoplePage } from '../src/page/people.js'
import { stylesheet } from '../src/style.js'
import { on, peoplePageWith } from './helpers.js'

/**
 * Every route but People, which the page draws through `h.submodel`: an inert
 * draw has no runtime frame to place it in, so the People page is drawn alone.
 */
const trees = [
  ...[
    AppRoute.Home(),
    AppRoute.Nested(),
    AppRoute.Person({ personId: 1 }),
    AppRoute.Person({ personId: 99 }),
    AppRoute.FilesIndex(),
    AppRoute.Files({ path: ['documents', 'taxes'] }),
    AppRoute.Files({ path: ['documents', 'resume.pdf'] }),
    AppRoute.Files({ path: ['documents', 'missing.txt'] }),
    AppRoute.NotFound({ path: '/missing' }),
  ].map(route => Inert.draw(Page, on(route))),
  Inert.draw(PeoplePage, peoplePageWith('designer')),
]

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the pages', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      trees.flatMap(tree =>
        [...cssOf(Inert.all(tree)).matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
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
