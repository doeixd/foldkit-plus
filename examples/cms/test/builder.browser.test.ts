/**
 * The page builder in a real browser, at a desktop size: what jsdom cannot
 * lay out. Each test pins something first found by eye.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { BuilderView } from 'foldkit-mixins-builder'
import { Composition, NodeId } from 'foldkit-composition'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { PageBuilder, PageEditing } from '../src/site.js'
import { stylesheet } from '../src/sheet.js'
import { theme } from '../src/style.js'

const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageEditing)))
const Slot = Bundle.declare(Drawn, 'editor')
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Editor = Page.at(Slot)
const placements = Page.assemble(Editor)

/** A page long enough to scroll: a Section holding forty Headings. */
const longPage = () => {
  const section = NodeId.make('s')
  const headings = Array.from({ length: 40 }, (_, index) => NodeId.make(`h${index}`))
  return Composition.Document.make({
    format: 1,
    roots: [section],
    nodes: {
      [section]: {
        block: 'Section',
        props: { heading: '' },
        regions: { body: headings },
      },
      ...Object.fromEntries(
        headings.map((id, index) => [
          id,
          { block: 'Heading', props: { text: `Heading ${index}` }, regions: {} },
        ]),
      ),
    },
  })
}

/** Mounts the builder over `page`, with `css` as the page's only stylesheet. */
const mount = (css: string) => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  const container = document.createElement('div')
  container.id = 'builder'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () =>
          placements.initial({ editor: PageBuilder.replace(PageBuilder.initial, longPage()) }),
        update: placements.update(),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [Editor.view(model, h, BuilderView.inputs())]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  return () => {
    handle.dispose()
    style.remove()
    // What was injected, so the next test's page counts its stylesheets afresh.
    document.querySelector('style[data-foldkit-styles]')?.remove()
  }
}

let unmount = () => {}
afterEach(() => {
  unmount()
  document.body.innerHTML = ''
})

const canvas = () => document.querySelector<HTMLElement>('[aria-label="Page"]')

it('reads its announcements out without showing them', async () => {
  unmount = mount(stylesheet)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  // The `live` Slot holds LiveAnnounce's regions, which hold each `aria-live` element.
  const live = document.querySelector('[aria-live]')?.parentElement?.parentElement
  if (live === null || live === undefined) throw new Error('no live region')
  const box = live.getBoundingClientRect()
  // Visually hidden: one pixel, clipped away.
  expect(box.width).toBeLessThanOrEqual(1)
  expect(box.height).toBeLessThanOrEqual(1)
  expect(getComputedStyle(live).clipPath).toBe('inset(50%)')
})

it('fills the window, the page scrolling inside its canvas rather than the window scrolling', async () => {
  unmount = mount(stylesheet)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const page = canvas()
  if (page === null) throw new Error('no canvas')
  expect(page.scrollHeight).toBeGreaterThan(page.clientHeight)
  expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight)
})

// A Style brings its own rules when it draws (dx-and-builder-PLAN.md, 1b), so one
// left out of the stylesheet still applies.
it('draws a Style that the stylesheet leaves out', async () => {
  const L = Layers.standard
  const foundations = Style.stylesheet(
    L.declare,
    L.in('reset', Defaults.reset),
    L.in('tokens', Theme.root(Theme.tokens)),
    L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  )
  unmount = mount(foundations)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const page = canvas()
  if (page === null) throw new Error('no canvas')
  // BuilderStyle makes the canvas scroll on its own.
  expect(getComputedStyle(page).overflow).toBe('auto')
})

// The rows are drawn once and reused (dx-and-builder-PLAN.md, 3d): what the
// tree's keyboard gives each row must still follow the selection.
it('moves the selection and the tab stop with the keyboard, over reused rows', async () => {
  unmount = mount(stylesheet)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]'))
  const marked = (attribute: string, value: string) =>
    rows().flatMap((row, index) => (row.getAttribute(attribute) === value ? [index] : []))

  rows()[1]?.click()
  await vi.waitFor(() => expect(marked('aria-selected', 'true')).toEqual([1]))
  rows()[1]?.focus()
  for (const expected of [2, 3]) {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    )
    await vi.waitFor(() => expect(marked('aria-selected', 'true')).toEqual([expected]))
    expect(marked('tabindex', '0')).toEqual([expected])
  }
})
