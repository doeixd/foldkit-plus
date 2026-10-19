/**
 * Cascade Select in a real browser: the open panel shows in the top layer
 * under its trigger and takes focus, its columns stand side by side (the
 * other way right to left), the keys choose a path and give focus back to
 * the trigger, and Escape, a press outside and Tab close it. A window too
 * narrow for the columns drills in, and the panel stays on the screen.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as CascadeSelect from '../src/cascadeSelect.js'
import { CascadeSelectSlots, type Node } from '../src/cascadeSelect.js'
import * as Recipes from '../src/recipes/cascadeSelect.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(CascadeSelectSlots)(Recipes.CascadeSelect({}))

const nodes: ReadonlyArray<Node> = [
  {
    id: 'ca',
    label: 'Canada',
    children: [
      {
        id: 'on',
        label: 'Ontario',
        children: [
          { id: 'tor', label: 'Toronto' },
          { id: 'ott', label: 'Ottawa' },
        ],
      },
      { id: 'qc', label: 'Quebec', children: [{ id: 'mtl', label: 'Montreal' }] },
    ],
  },
  { id: 'mx', label: 'Mexico' },
]
const config = { nodes }

afterEach(async () => {
  await page.viewport(1440, 900)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (direction: 'ltr' | 'rtl' = 'ltr', layout: 'columns' | 'drill' = 'columns') => {
  document.documentElement.dir = direction
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `cascade-${direction}`
  document.body.appendChild(container)
  const update = CascadeSelect.update(config)
  return Runtime.embed(
    Runtime.makeElement({
      Model: CascadeSelect.Model,
      container,
      init: () => ({ model: CascadeSelect.init({ id: 'place' }) }),
      update,
      view: (model: CascadeSelect.Model, h: HtmlBuilder<CascadeSelect.Message>) =>
        h.div(
          [h.Style({ padding: '40px', display: 'flex', gap: '16px' })],
          [
            CascadeSelect.view(
              {
                model,
                config,
                onMessage: message => message,
                label: 'Place',
                direction,
                layout,
                style,
              },
              h,
            ),
            h.button([h.Id('after')], ['After']),
          ],
        ),
    }),
  )
}

const trigger = () => document.querySelector<HTMLElement>('[role="combobox"]')!
const tree = () => document.querySelector<HTMLElement>('[role="tree"]')
const columns = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tree"] > [role="group"]'))

/** Opens the panel by a press, and waits until the anchor has placed and focused it. */
const opened = async () => {
  await vi.waitFor(() => expect(document.querySelector('[role="combobox"]')).not.toBeNull())
  await userEvent.click(trigger())
  await vi.waitFor(() => expect(document.activeElement).toBe(tree()))
}

test('opens in the top layer under its trigger, and takes focus', async () => {
  const mounted = mount()
  try {
    await opened()
    const layer = tree()!.parentElement!
    expect(layer.matches(':popover-open')).toBe(true)
    const below = trigger().getBoundingClientRect()
    const panel = tree()!.getBoundingClientRect()
    expect(panel.top).toBeGreaterThanOrEqual(below.bottom)
    expect(panel.left).toBeCloseTo(below.left, 0)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  } finally {
    mounted.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  '%s, the columns stand side by side along the reading',
  async direction => {
    const mounted = mount(direction)
    try {
      await opened()
      // In: right to left, the arrow toward the children is ArrowLeft.
      await userEvent.keyboard(direction === 'rtl' ? '{ArrowLeft}' : '{ArrowRight}')
      await vi.waitFor(() => expect(columns()).toHaveLength(3))
      const [first, second] = columns().map(column => column.getBoundingClientRect()) as [
        DOMRect,
        DOMRect,
      ]
      if (direction === 'ltr') expect(second.left).toBeGreaterThanOrEqual(first.right - 1)
      else expect(second.right).toBeLessThanOrEqual(first.left + 1)
      expect(second.top).toBeCloseTo(first.top, 0)
    } finally {
      mounted.dispose()
    }
  },
)

test('the keys choose a path, close, and give focus back to the trigger', async () => {
  const mounted = mount()
  try {
    await opened()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}')
    await vi.waitFor(() =>
      expect(tree()!.getAttribute('aria-activedescendant')).toBe('place-item-0-0-1'),
    )
    // The active row is lit, the branches above it on the path quietly tinted.
    const active = document.getElementById('place-item-0-0-1')!
    const resting = document.getElementById('place-item-0-0-0')!
    expect(getComputedStyle(active).backgroundColor).not.toBe(
      getComputedStyle(resting).backgroundColor,
    )
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(tree()).toBeNull())
    expect(trigger().textContent).toContain('Canada / Ontario / Ottawa')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
  } finally {
    mounted.dispose()
  }
})

test('Escape closes and gives focus back; a press outside closes', async () => {
  const mounted = mount()
  try {
    await opened()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(tree()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
    await opened()
    await userEvent.click(document.body, { position: { x: 900, y: 700 } })
    await vi.waitFor(() => expect(tree()).toBeNull())
  } finally {
    mounted.dispose()
  }
})

test('a press on the trigger while open closes it, opening nothing again', async () => {
  const mounted = mount()
  try {
    await opened()
    const { left, top, width, height } = trigger().getBoundingClientRect()
    const body = document.body.getBoundingClientRect()
    await userEvent.click(document.body, {
      position: { x: left + width / 2 - body.left, y: top + height / 2 - body.top },
    })
    await vi.waitFor(() => expect(tree()).toBeNull())
    // Long enough for a click that reached the trigger to have opened it again.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(tree()).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  } finally {
    mounted.dispose()
  }
})

test('Tab moves on and closes the panel behind it', async () => {
  const mounted = mount()
  try {
    await opened()
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(tree()).toBeNull())
    expect(document.activeElement).not.toBe(trigger())
  } finally {
    mounted.dispose()
  }
})

test('a drilled panel, wider than its one column, gives the column its width', async () => {
  const mounted = mount('ltr', 'drill')
  try {
    await opened()
    const [column] = columns()
    // The panel's least width is more than a column's: the column fills it, leaving no strip.
    expect(columns()).toHaveLength(1)
    expect(column!.getBoundingClientRect().width).toBeCloseTo(tree()!.clientWidth, 0)
  } finally {
    mounted.dispose()
  }
})

/** The open panel's box against the window's: inside it, on both sides. */
const onScreen = () => {
  const panel = tree()!.getBoundingClientRect()
  expect(panel.left).toBeGreaterThanOrEqual(0)
  expect(panel.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
}

test.each([
  [390, 'drill', 1],
  [1280, 'columns', 3],
] as const)('at %ipx the columns %s in, %i shown, on the screen', async (width, layout, shown) => {
  await page.viewport(width, 800)
  const mounted = mount()
  try {
    await opened()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await vi.waitFor(() =>
      expect(tree()!.getAttribute('aria-activedescendant')).toBe('place-item-0-0-0'),
    )
    await vi.waitFor(() => expect(tree()!.dataset['layout']).toBe(layout))
    expect(columns()).toHaveLength(shown)
    onScreen()
  } finally {
    mounted.dispose()
  }
})

test('a window narrowed while the columns are open keeps the panel on the screen', async () => {
  await page.viewport(1280, 800)
  const mounted = mount()
  try {
    await opened()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await vi.waitFor(() => expect(columns()).toHaveLength(3))
    await page.viewport(390, 800)
    await vi.waitFor(onScreen)
    // Measured when it opened, so still the columns: the panel scrolls them.
    expect(tree()!.dataset['layout']).toBe('columns')
    expect(tree()!.scrollWidth).toBeGreaterThan(tree()!.clientWidth)
  } finally {
    mounted.dispose()
  }
})
