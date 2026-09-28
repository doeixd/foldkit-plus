import { Option } from 'effect'
import { Transition } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, type Model, Page, PaintingStatus, routeTitle } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { logging, on } from './helpers.js'

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

const painting = (paintingId: number) => AppRoute.Painting({ paintingId })

const models: ReadonlyArray<readonly [string, Model]> = [
  ['home, with a logged cold load', logging(Transition.coldLoad<AppRoute>(AppRoute.Home()))],
  ['the gallery loading', on(AppRoute.Gallery())],
  ['the gallery ready', modifyFields(on(AppRoute.Gallery()), { catalogStatus: () => 'Ready' })],
  ['a painting loading', on(painting(1))],
  [
    'a painting shown',
    modifyFields(on(painting(6)), {
      paintingStatus: () => PaintingStatus.Ready({ paintingId: 6 }),
    }),
  ],
  ['a missing painting', on(painting(99))],
  ['the studio', on(AppRoute.Studio())],
  [
    'the studio with a saved draft',
    modifyFields(on(AppRoute.Studio()), { maybeSavedDraft: () => Option.some('A sketch') }),
  ],
  ['a missing page', on(AppRoute.NotFound({ path: '/missing' }))],
]

describe('the page', () => {
  test.each(models)('draws every element through a Slot on %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Page, model))).toEqual([])
  })

  test.each(models)('sets no fixed inline style on %s', (_, model) => {
    expect(Inert.fixedInline(Inert.draw(Page, model))).toEqual([])
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

  test.each([
    [AppRoute.Home(), 'Home'],
    [AppRoute.Gallery(), 'Gallery'],
    [painting(3), 'Gallery'],
    [AppRoute.Studio(), 'Studio'],
  ])('marks the nav link of the section %o is in as the current page', (route, section) => {
    const current = Inert.all(Inert.draw(Page, on(route))).filter(
      node => Inert.value(node, 'aria-current') === 'page',
    )
    expect(current.map(Inert.text)).toEqual([section])
  })

  test('marks no nav link on a missing page', () => {
    const tree = Inert.draw(Page, on(AppRoute.NotFound({ path: '/missing' })))
    expect(Inert.all(tree).filter(node => Inert.value(node, 'aria-current') !== undefined)).toEqual(
      [],
    )
  })

  test.each([
    [AppRoute.Home(), 'Route Transitions'],
    [AppRoute.Gallery(), 'Gallery | Route Transitions'],
    [painting(2), 'Painting 2 | Route Transitions'],
    [AppRoute.Studio(), 'Studio | Route Transitions'],
    [AppRoute.NotFound({ path: '/x' }), 'Not found | Route Transitions'],
  ])('titles %o', (route, title) => {
    expect(routeTitle(route)).toBe(title)
  })

  test.each([
    [PaintingStatus.Loading({ paintingId: 2 }), ['loading']],
    [PaintingStatus.Ready({ paintingId: 1 }), ['loading']],
    [PaintingStatus.Ready({ paintingId: 2 }), ['article']],
  ])('on painting 2, while the painting is %o, shows %o', (paintingStatus, shown) => {
    const tree = Inert.draw(
      Page,
      modifyFields(on(painting(2)), { paintingStatus: () => paintingStatus }),
    )
    expect(['loading', 'article'].filter(slot => Inert.bySlot(tree, slot).length > 0)).toEqual(
      shown,
    )
  })

  test('paints each swatch with its own painting’s gradient', () => {
    const tree = Inert.draw(
      Page,
      modifyFields(on(AppRoute.Gallery()), { catalogStatus: () => 'Ready' }),
    )
    const gradients = Inert.bySlot(tree, 'swatch').map(
      node => Inert.style(node)['--painting-gradient'],
    )
    expect(gradients).toHaveLength(6)
    expect(new Set(gradients).size).toBe(6)
  })
})

describe('a log entry', () => {
  test.each([
    [
      Transition.coldLoad<AppRoute>(AppRoute.Home()),
      '#1 Cold load → Home',
      ['coldLoad:Cold load', 'entered:Entered Home'],
    ],
    [
      Transition.coldLoad<AppRoute>(painting(3)),
      '#1 Cold load → Painting 3',
      ['coldLoad:Cold load', 'entered:Entered Painting'],
    ],
    [
      Transition.make<AppRoute>(AppRoute.Home(), AppRoute.Gallery()),
      '#1 Home → Gallery',
      ['entered:Entered Gallery', 'exited:Exited Home'],
    ],
    [
      Transition.make<AppRoute>(AppRoute.Studio(), AppRoute.NotFound({ path: '/x' })),
      '#1 Studio → Not found',
      ['entered:Entered NotFound', 'exited:Exited Studio'],
    ],
    [
      Transition.make<AppRoute>(painting(1), painting(2)),
      '#1 Painting 1 → Painting 2',
      ['stayed:Stayed on Painting: 1 → 2'],
    ],
    [
      Transition.make<AppRoute>(painting(1), painting(1)),
      '#1 Painting 1 → Painting 1',
      ['stayed:Stayed on Painting: 1 → 1'],
    ],
    [
      Transition.make<AppRoute>(AppRoute.Home(), AppRoute.Home()),
      '#1 Home → Home',
      ['within:Stayed within route'],
    ],
    [
      Transition.make<AppRoute>(
        AppRoute.NotFound({ path: '/a' }),
        AppRoute.NotFound({ path: '/b' }),
      ),
      '#1 Not found → Not found',
      ['within:Stayed within route'],
    ],
  ])('narrates %o', (transition, summary, badges) => {
    const tree = Inert.draw(Page, logging(transition))
    expect(Inert.bySlot(tree, 'logSummary').map(Inert.text)).toEqual([summary])
    expect(
      Inert.bySlot(tree, 'badge').map(
        node => `${Inert.value(node, 'data-tone')}:${Inert.text(node)}`,
      ),
    ).toEqual(badges)
  })

  test('colours each badge by its tone', () => {
    const css = cssOf(
      Inert.bySlot(
        Inert.draw(Page, logging(Transition.coldLoad<AppRoute>(AppRoute.Home()))),
        'badge',
      ),
    )
    for (const tone of ['coldLoad', 'entered', 'exited', 'stayed', 'within']) {
      expect(css).toContain(`[data-tone="${tone}"]`)
    }
  })
})
