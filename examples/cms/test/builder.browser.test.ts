/// <reference types="vite/client" />
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

/** A page long enough to scroll: a Section holding `count` Headings. */
const longPage = (count: number) => {
  const section = NodeId.make('s')
  const headings = Array.from({ length: count }, (_, index) => NodeId.make(`h${index}`))
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

/** Mounts the builder over a page of `count` Headings, with `css` as the page's only stylesheet. */
const mount = (css: string, count = 40) => {
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
          placements.initial({ editor: PageBuilder.replace(PageBuilder.initial, longPage(count)) }),
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

/** The middle of some timings, rounded to a millisecond. */
const median = (times: ReadonlyArray<number>): number =>
  Math.round([...times].sort((left, right) => left - right)[Math.floor(times.length / 2)] ?? NaN)

/** Resolves after the next frame has been drawn. */
const nextFrame = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))

/** How long `act` takes to reach the screen, `times` times over, as a median. */
const timed = async (times: number, act: (index: number) => void): Promise<number> => {
  const taken: Array<number> = []
  for (let index = 0; index < times; index++) {
    const start = performance.now()
    act(index)
    await nextFrame()
    taken.push(performance.now() - start)
  }
  return median(taken)
}

// The budgets in pagebuilder-DESIGN.md §25, measured over 1,000 nodes. Timings
// are machine-bound, so this prints them rather than asserting, and runs only
// when asked: VITE_MEASURE=1 pnpm exec vitest run --project browser examples/cms/test/builder.browser.test.ts
it.skipIf(import.meta.env.VITE_MEASURE === undefined)(
  'measures a hover, a selection and a keystroke over 1,000 nodes',
  async () => {
    unmount = mount(stylesheet, 1000)
    await vi.waitFor(() => expect(canvas()).not.toBeNull(), { timeout: 20_000 })
    const headings = Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Page"] h2'))
    const heading = (index: number) => {
      const found = headings[index]
      if (found === undefined) throw new Error(`no heading ${index}`)
      return found
    }
    const hover = await timed(20, index =>
      heading(index * 7).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
    )
    // The first selection also teaches each layer row which Slots it uses.
    const first = await timed(1, () => heading(0).click())
    const select = await timed(5, index => heading((index + 1) * 13).click())
    const field = document.querySelector<HTMLInputElement>(
      '[aria-label="Properties"] input:not([type="checkbox"])',
    )
    if (field === null) throw new Error('no text field in the inspector')
    const keystroke = await timed(10, () => {
      field.value += 'x'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    console.log(JSON.stringify({ hover, first, select, keystroke }))
    expect(field.value.endsWith('x'.repeat(10))).toBe(true)
  },
  60_000,
)
