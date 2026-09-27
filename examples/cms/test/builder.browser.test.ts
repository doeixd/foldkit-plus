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
import { userEvent } from 'vitest/browser'
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

/** Mounts the builder over `page` (by default `count` Headings), with `css` as the page's only stylesheet. */
const mount = (css: string, count = 40, page = longPage(count), width?: string) => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  const container = document.createElement('div')
  container.id = 'builder'
  // The runtime draws in place of its container, so the width goes on what holds it.
  const holder = document.createElement('div')
  if (width !== undefined) holder.style.width = width
  holder.appendChild(container)
  document.body.appendChild(holder)
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({ editor: PageBuilder.replace(PageBuilder.initial, page) }),
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

// The boxes are drawn over the page from where the marked nodes are measured to be
// (dx-and-builder-PLAN.md, 5b): each must sit on its node, wherever the canvas scrolls.
it('draws the selection’s box over the selected node, and keeps it there through a scroll', async () => {
  unmount = mount(stylesheet)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const page = canvas()
  if (page === null) throw new Error('no canvas')
  const headings = Array.from(page.querySelectorAll<HTMLElement>('h2'))
  const box = (label: string) => {
    const found = Array.from(page.children).find(
      child => child.getAttribute('aria-hidden') === 'true' && child.textContent === label,
    )
    if (!(found instanceof HTMLElement)) throw new Error(`no box labelled ${label}`)
    return found
  }
  /** Whether `over` covers `target`, within a pixel. */
  const covers = (over: HTMLElement, target: HTMLElement) => {
    const [a, b] = [over.getBoundingClientRect(), target.getBoundingClientRect()]
    return [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].every(
      difference => Math.abs(difference) <= 1,
    )
  }
  const target = headings[20]
  if (target === undefined) throw new Error('no heading 20')
  target.click()
  await vi.waitFor(() => expect(covers(box('Heading'), target)).toBe(true))
  page.scrollTop += 120
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
  expect(covers(box('Heading'), target)).toBe(true)
  // Pointing at another node marks it, and a box of its own follows.
  const other = headings[22]
  if (other === undefined) throw new Error('no heading 22')
  other.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  const hover = () =>
    Array.from(page.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.getAttribute('aria-hidden') === 'true' &&
        child.textContent === '',
    )
  await vi.waitFor(() => {
    const found = hover()
    expect(found !== undefined && covers(found, other)).toBe(true)
  })
})

// A tile dragged from the palette lands where it is dropped (dx-and-builder-PLAN.md, 5c).
it('adds a Block dragged from the palette where it is dropped, between two Headings', async () => {
  unmount = mount(stylesheet)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const tile = document.querySelector<HTMLElement>('[aria-label="Add Heading"]')
  const page = canvas()
  const headings = () =>
    Array.from(page?.querySelectorAll<HTMLElement>('h2') ?? [], heading => heading.textContent)
  const target = page?.querySelectorAll<HTMLElement>('h2')[2]
  if (tile === null || page === null || target === undefined) throw new Error('no tile or page')
  const centre = (element: HTMLElement, down = 0.5) => {
    const box = element.getBoundingClientRect()
    return { clientX: box.left + box.width / 2, clientY: box.top + box.height * down }
  }
  const at = (element: EventTarget, type: string, where: { clientX: number; clientY: number }) =>
    element.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, buttons: 1, isPrimary: true, ...where }),
    )
  at(tile, 'pointerdown', centre(tile))
  // Past the threshold, then over the last third of the third Heading: after it.
  at(document, 'pointermove', { clientX: centre(tile).clientX + 20, clientY: centre(tile).clientY })
  at(document, 'pointermove', centre(target, 0.9))
  at(target, 'pointerup', centre(target, 0.9))
  await vi.waitFor(() =>
    expect(headings().slice(0, 5)).toEqual([
      'Heading 0',
      'Heading 1',
      'Heading 2',
      'New heading',
      'Heading 3',
    ]),
  )
})

it('edits a heading where it is: the caret kept through each redraw, Backspace a letter, Escape back', async () => {
  unmount = mount(stylesheet, 3)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  const field = () =>
    canvas()?.querySelector<HTMLElement>('[data-composition-node="h1"] [data-composition-field]')
  const editable = () => field()?.getAttribute('contenteditable') === 'plaintext-only'
  // What the page holds, as the inspector shows it.
  const stored = () => document.querySelector<HTMLInputElement>('#HeadingSettings-text')?.value
  const begin = async () => {
    const shown = field()
    if (shown === null || shown === undefined) throw new Error('no heading field')
    await userEvent.dblClick(shown)
    await vi.waitFor(() => expect(editable() && document.activeElement === field()).toBe(true))
  }

  await begin()
  // Each key redraws the page with the new text; the characters land in order at the end.
  await userEvent.keyboard(' again')
  await vi.waitFor(() => expect(stored()).toBe('Heading 1 again'))
  expect(field()?.innerText).toBe('Heading 1 again')
  // A letter, not the block.
  await userEvent.keyboard('{Backspace}')
  await vi.waitFor(() => expect(stored()).toBe('Heading 1 agai'))
  expect(field()).not.toBeNull()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(editable()).toBe(false))
  expect(field()?.textContent).toBe('Heading 1 agai')

  // Escape puts back what the field began with, on the page and in the DOM.
  await begin()
  await userEvent.keyboard('zz')
  await vi.waitFor(() => expect(stored()).toBe('Heading 1 agaizz'))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(editable()).toBe(false))
  expect(field()?.textContent).toBe('Heading 1 agai')
  expect(stored()).toBe('Heading 1 agai')

  // The session committed is one undo step.
  canvas()?.focus()
  await userEvent.keyboard('{Control>}z{/Control}')
  await vi.waitFor(() => expect(field()?.textContent).toBe('Heading 1'))
})

it('draws a look for the width of its frame, not of the window', async () => {
  const hero = NodeId.make('hero')
  unmount = mount(
    stylesheet,
    0,
    Composition.Document.make({
      format: 1,
      roots: [hero],
      nodes: {
        [hero]: {
          block: 'Hero',
          props: { eyebrow: 'Hello', title: 'A hero', lead: 'Two lines apart' },
          // Tight on a phone, roomy from `md` up: of the page's width.
          appearance: { gap: { base: 'xs', md: 'xl' } },
          regions: { actions: [] },
        },
      },
    }),
  )
  const gap = () => {
    const drawn = canvas()?.querySelector<HTMLElement>('header')
    return drawn === null || drawn === undefined ? NaN : parseFloat(getComputedStyle(drawn).rowGap)
  }
  await vi.waitFor(() => expect(gap()).toBeGreaterThan(0))
  const wide = gap()
  document.querySelector<HTMLElement>('[data-viewport="narrow"][aria-pressed]')?.click()
  // The window stays as wide as it was; only the frame is a phone's.
  await vi.waitFor(() => expect(gap()).toBe(wide / 4))
  expect(window.innerWidth).toBeGreaterThan(1000)
})

it('shows one panel at a time when the editor is narrow, chosen by tabs and by selecting', async () => {
  const shown = (label: string) => {
    // Rendered at all: a panel's name may be on an element inside it.
    return document.querySelector(`[aria-label="${label}"]`)?.checkVisibility() === true
  }
  const tabs = () => document.querySelector<HTMLElement>('[aria-label="Panels"]')
  // Wide: every panel, and no tabs.
  unmount = mount(stylesheet, 3)
  await vi.waitFor(() => expect(canvas()).not.toBeNull())
  expect([shown('Add a block'), shown('Layers'), shown('Properties')]).toEqual([true, true, true])
  expect(tabs()?.checkVisibility()).toBe(false)
  unmount()
  document.body.innerHTML = ''

  // Narrow: the palette alone at first; a tab chooses another; a selection chooses Settings.
  unmount = mount(stylesheet, 3, longPage(3), '600px')
  await vi.waitFor(() => expect(tabs()?.checkVisibility()).toBe(true))
  expect([shown('Add a block'), shown('Layers'), shown('Properties')]).toEqual([true, false, false])
  // Stacked by the editor's own width, not the window's: the page takes the editor's width.
  expect(canvas()?.getBoundingClientRect().width).toBeGreaterThan(500)
  document.querySelector<HTMLElement>('button[data-panel="layers"]')?.click()
  await vi.waitFor(() => expect(shown('Layers')).toBe(true))
  expect(shown('Add a block')).toBe(false)
  expect(document.querySelector('button[data-panel="layers"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  )
  canvas()?.querySelector<HTMLElement>('[data-composition-node="h1"] h2')?.click()
  await vi.waitFor(() => expect(shown('Properties')).toBe(true))
  expect(shown('Layers')).toBe(false)
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
