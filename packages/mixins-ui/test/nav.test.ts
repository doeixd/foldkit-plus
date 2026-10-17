/**
 * Nav as markup over `@foldkit/ui`'s nav: a named landmark whose list holds
 * the links, the current one marked, and an indicator and highlight a reader
 * does not count.
 */
import { Nav as UiNav } from '@foldkit/ui'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Nav, NavSlots, Patterns, Recipes } from '../src/index.js'

const style = Style.forSlots(NavSlots)(Recipes.Nav({}))
const pages = ['home', 'docs', 'blog'] as const

const drawn = (check: (html: Parameters<typeof Inert.all>[0]) => void) =>
  Scene.scene<null, never>(
    {
      update: model => ({ model }),
      view: (_model, h) =>
        UiNav.view({
          items: pages,
          ariaLabel: 'Site',
          toHref: page => `/${page}`,
          isItemCurrent: page => page === 'docs',
          toView: Nav.toView([style.mixin], { h }, page => page.toUpperCase()),
        }),
    },
    Scene.given(null),
    Scene.tap(({ html }) => check(html)),
  )

describe('Nav.view', () => {
  it('meets the nav pattern', () => {
    expect(A11y.validate(Patterns.Nav, NavSlots)).toEqual([])
  })

  it('is a named landmark of links, the current one marked', () =>
    drawn(html => {
      expect(Inert.value(Inert.byTag(html, 'nav')[0], 'aria-label')).toBe('Site')
      const links = Inert.byTag(html, 'a')
      expect(links.map(link => Inert.text(link))).toEqual(['HOME', 'DOCS', 'BLOG'])
      expect(links.map(link => Inert.value(link, 'aria-current'))).toEqual([
        undefined,
        'page',
        undefined,
      ])
    }))

  it('keeps the indicator and highlight out of what a reader counts', () =>
    drawn(html => {
      const [indicator, highlight] = Inert.byTag(html, 'li')
      for (const overlay of [indicator, highlight]) {
        expect(Inert.value(overlay, 'role')).toBe('presentation')
        expect(Inert.value(overlay, 'aria-hidden')).toBe('true')
      }
    }))
})

describe('Nav.update', () => {
  const shut = Nav.init('site')
  const open = Nav.update(shut, Nav.Message.Toggled({ panel: 'products' })).model

  it('shows a pressed trigger’s panel, and hides it on a second press', () => {
    expect(open.open).toEqual(Option.some('products'))
    expect(Nav.update(open, Nav.Message.Toggled({ panel: 'products' })).model.open).toEqual(
      Option.none(),
    )
    expect(Nav.update(open, Nav.Message.Toggled({ panel: 'docs' })).model.open).toEqual(
      Option.some('docs'),
    )
  })

  it('returns the Model it was given when nothing changes', () => {
    expect(Nav.update(shut, Nav.Message.Dismissed()).model).toBe(shut)
    expect(Nav.update(shut, Nav.Message.Escaped({ index: 1 })).model).toBe(shut)
    expect(Nav.update(open, Nav.Message.MovedTop({ from: 0, count: 3, move: 'previous' }))).toEqual(
      {
        model: open,
      },
    )
    expect(
      Nav.update(open, Nav.Message.MovedInPanel({ entry: 1, from: 2, count: 3, move: 'last' })),
    ).toEqual({ model: open })
  })
})
