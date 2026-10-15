/**
 * A navigation menu on a real runtime: with `Nav.fluid` the indicator sits
 * under the current link and the highlight follows the pointer, and without
 * it the current link draws its own line and the overlays show nothing.
 */
import { Nav as UiNav } from '@foldkit/ui'
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Nav, NavSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(NavSlots)(Recipes.Nav({}))
const pages = ['home', 'docs', 'blog'] as const
const Model = Schema.Struct({})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (fluid: boolean) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'nav-browser'
  // An empty spot away from the links, to move the pointer off them.
  const spot = document.createElement('div')
  spot.style.blockSize = '200px'
  document.body.append(container, spot)
  const view = (_model: Model, h: HtmlBuilder<never>) =>
    UiNav.view({
      items: pages,
      ariaLabel: 'Site',
      toHref: page => `#${page}`,
      isItemCurrent: page => page === 'docs',
      toView: Nav.toView([style.mixin, ...(fluid ? Nav.fluid : [])], { h }, page => page),
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: model => ({ model }),
      view,
    }),
  )
}

const link = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('a')).find(each => each.textContent === name)!
const part = (index: number) => document.querySelector('ul')!.children[index] as HTMLElement

/** Whether `overlay` spans `target` across, to the pixel. */
const spans = (overlay: HTMLElement, target: HTMLElement) => {
  const over = overlay.getBoundingClientRect()
  const under = target.getBoundingClientRect()
  return Math.abs(over.left - under.left) < 1 && Math.abs(over.width - under.width) < 1
}

test('the indicator sits under the current link, and the highlight follows the pointer', async () => {
  const handle = mount(true)
  try {
    await userEvent.hover(document.body.lastElementChild!)
    await vi.waitFor(() => expect(spans(part(0), link('docs'))).toBe(true))
    await vi.waitFor(() => expect(getComputedStyle(link('docs')).boxShadow).toBe('none'))
    await userEvent.hover(link('blog'))
    await vi.waitFor(() => {
      expect(getComputedStyle(part(1)).opacity).toBe('1')
      expect(spans(part(1), link('blog'))).toBe(true)
    })
  } finally {
    handle.dispose()
  }
})

test('without Nav.fluid the current link marks itself and the overlays show nothing', async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => expect(link('docs')).toBeTruthy())
    expect(getComputedStyle(link('docs')).boxShadow).not.toBe('none')
    expect(getComputedStyle(link('home')).boxShadow).toBe('none')
    expect(getComputedStyle(part(0)).display).toBe('none')
    expect(getComputedStyle(part(1)).display).toBe('none')
  } finally {
    handle.dispose()
  }
})
