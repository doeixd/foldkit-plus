/**
 * A resizable split laid out and dragged in a real browser: right to left its
 * first panel is on the right, so a drag to the left grows it, as a drag to
 * the right does left to right. A split nests in another either way, a
 * collapsible panel collapses on Enter or a double-click and eases there,
 * and the handle's accent line and grip are drawn where they should be.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as Recipes from '../src/recipes/resizable.js'
import * as Resizable from '../src/resizable.js'
import { ResizableSlots } from '../src/resizable.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ResizableSlots)(Recipes.Resizable({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (direction: 'ltr' | 'rtl') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `resizable-${direction}`
  document.body.appendChild(container)
  const view = (model: Resizable.Model, h: HtmlBuilder<Resizable.Message>) =>
    h.div(
      // No `dir` here: the view draws its own `direction`.
      [h.Style({ inlineSize: '600px', blockSize: '100px' })],
      [
        Resizable.view(
          {
            model,
            onMessage: message => message,
            direction,
            label: 'Resize the list',
            first: h.p([h.Id('first')], ['one']),
            second: h.p([h.Id('second')], ['two']),
            style,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model: Resizable.Model,
      container,
      init: () => ({ model: Resizable.init(0.5) }),
      update: (model: Resizable.Model, message: Resizable.Message) => ({
        model: Resizable.update(model, message),
      }),
      view,
    }),
  )
}

const handle = () => document.querySelector<HTMLElement>('[role="separator"]')
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** Drags the handle by `dx` pixels, once the group has been measured. */
const drag = async (dx: number) => {
  const separator = await vi.waitFor(() => {
    const found = handle()
    expect(found).not.toBeNull()
    return found!
  })
  // The Resize Mount reports the group's size on its first observation.
  await frame()
  await frame()
  const { left, top } = separator.getBoundingClientRect()
  const at = (type: string, x: number) =>
    separator.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: top }),
    )
  at('pointerdown', left)
  at('pointermove', left + dx)
  at('pointerup', left + dx)
}

test.each([
  ['ltr', 60, 60],
  ['ltr', -60, 40],
  ['rtl', -60, 60],
  ['rtl', 60, 40],
] as const)('%s, a drag of %ipx sets the first panel to %i%', async (direction, dx, percent) => {
  const mounted = mount(direction)
  try {
    await drag(dx)
    await vi.waitFor(() => expect(handle()?.getAttribute('aria-valuenow')).toBe(String(percent)))
  } finally {
    mounted.dispose()
  }
})

test('right to left, the first panel is on the right', async () => {
  const mounted = mount('rtl')
  try {
    await vi.waitFor(() => expect(document.getElementById('first')).not.toBeNull())
    const first = document.getElementById('first')!.getBoundingClientRect()
    const second = document.getElementById('second')!.getBoundingClientRect()
    expect(first.left).toBeGreaterThan(second.left)
  } finally {
    mounted.dispose()
  }
})

// Two splits, one inside the other's second panel: side by side outside, one over the other inside.
const Nested = Schema.Struct({ outer: Resizable.Model, inner: Resizable.Model })
type Nested = typeof Nested.Type
const Got = defineMessageUnion({
  Outer: { message: Resizable.Message },
  Inner: { message: Resizable.Message },
})
type Got = typeof Got.Type
const collapse = { collapsible: 'first' as const }

const mountNested = (selection: Parameters<typeof Recipes.Resizable>[0] = {}) => {
  const look = Style.forSlots(ResizableSlots)(Recipes.Resizable(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    look.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'resizable-nested'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Nested,
      container,
      init: () => ({ model: { outer: Resizable.init(0.5), inner: Resizable.init(0.5) } }),
      update: (model: Nested, message: Got) => ({
        model: Got.match(message, {
          Outer: ({ message: inner }) =>
            modifyFields(model, { outer: () => Resizable.update(model.outer, inner, collapse) }),
          Inner: ({ message: inner }) =>
            modifyFields(model, { inner: () => Resizable.update(model.inner, inner) }),
        }),
      }),
      view: (model: Nested, h: HtmlBuilder<Got>) =>
        h.div(
          [h.Style({ inlineSize: '600px', blockSize: '300px' })],
          [
            Resizable.view(
              {
                model: model.outer,
                onMessage: message => Got.Outer({ message }),
                ...collapse,
                label: 'Resize the sidebar',
                first: h.p([h.Id('side')], ['side']),
                second: Resizable.view(
                  {
                    model: model.inner,
                    onMessage: message => Got.Inner({ message }),
                    orientation: 'vertical',
                    label: 'Resize the editor',
                    first: h.p([h.Id('top')], ['top']),
                    second: h.p([h.Id('bottom')], ['bottom']),
                    style: look,
                  },
                  h,
                ),
                style: look,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const handles = () => Array.from(document.querySelectorAll<HTMLElement>('[role="separator"]'))
const ready = async () => {
  await vi.waitFor(() => expect(handles()).toHaveLength(2))
  await frame()
  await frame()
}

test('a split nests one over the other in a panel of one side by side, each dragged alone', async () => {
  const mounted = mountNested()
  try {
    await ready()
    const [outer, inner] = handles() as [HTMLElement, HTMLElement]
    // The inner split fills its panel: half of 300px over half.
    const top = document.getElementById('top')!.parentElement!.getBoundingClientRect()
    const bottom = document.getElementById('bottom')!.parentElement!.getBoundingClientRect()
    expect(top.width).toBeCloseTo(300, -1)
    expect(top.height).toBeCloseTo(150, -1)
    expect(bottom.top).toBeGreaterThanOrEqual(top.bottom)
    const { left, top: y } = inner.getBoundingClientRect()
    const at = (type: string, dy: number) =>
      inner.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          button: 0,
          clientX: left,
          clientY: y + dy,
        }),
      )
    at('pointerdown', 0)
    at('pointermove', 60)
    at('pointerup', 60)
    await vi.waitFor(() => expect(inner.getAttribute('aria-valuenow')).toBe('70'))
    expect(outer.getAttribute('aria-valuenow')).toBe('50')
  } finally {
    mounted.dispose()
  }
})

test('Enter collapses the first panel, easing there, and Enter puts it back', async () => {
  const mounted = mountNested()
  try {
    await ready()
    const [outer] = handles() as [HTMLElement]
    const side = document.getElementById('side')!.parentElement!
    expect(getComputedStyle(side).transitionDuration).not.toBe('0s')
    outer.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(outer.getAttribute('aria-valuenow')).toBe('0'))
    await vi.waitFor(() => expect(side.getBoundingClientRect().width).toBeLessThan(1))
    expect(side.hasAttribute('data-collapsed')).toBe(true)
    // Only the panel that collapses: the one after the handle stays as it is.
    expect(outer.nextElementSibling!.hasAttribute('data-collapsed')).toBe(false)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(side.getBoundingClientRect().width).toBeCloseTo(300, -1))
  } finally {
    mounted.dispose()
  }
})

test('a double-click collapses, and a drag follows the pointer at once', async () => {
  const mounted = mountNested()
  try {
    await ready()
    const [outer] = handles() as [HTMLElement]
    // Synthetic: the claim is what a double-click does, not where it lands.
    outer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await vi.waitFor(() => expect(outer.getAttribute('aria-valuenow')).toBe('0'))
    const side = document.getElementById('side')!.parentElement!
    const { left, top } = outer.getBoundingClientRect()
    outer.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        button: 0,
        clientX: left,
        clientY: top,
      }),
    )
    await vi.waitFor(() => expect(getComputedStyle(side).transitionDuration).toBe('0s'))
    outer.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
        button: 0,
        clientX: left,
        clientY: top,
      }),
    )
    await vi.waitFor(() => expect(getComputedStyle(side).transitionDuration).not.toBe('0s'))
  } finally {
    mounted.dispose()
  }
})

test('the handle turns to a thicker accent line under the pointer', async () => {
  const mounted = mountNested()
  try {
    await ready()
    const [outer] = handles() as [HTMLElement]
    const probe = document.createElement('div')
    probe.style.background = 'var(--fk-accent-default)'
    document.body.append(probe)
    await userEvent.hover(document.body, { position: { x: 1000, y: 700 } })
    // At rest once a hover the shared pointer left on it (another file's) has faded.
    await vi.waitFor(() => {
      const resting = getComputedStyle(outer)
      expect(resting.backgroundColor).not.toBe(getComputedStyle(probe).backgroundColor)
      expect(resting.boxShadow).toBe('none')
    })
    // On the line, by a point of the page: a pixel-wide box reads as hidden to
    // the locator. Above the middle, where the inner split's handle meets it.
    const line = outer.getBoundingClientRect()
    const body = document.body.getBoundingClientRect()
    const x = line.left + line.width / 2
    const y = line.top + 40
    expect(document.elementFromPoint(x, y)).toBe(outer)
    await userEvent.hover(document.body, { position: { x: x - body.left, y: y - body.top } })
    await vi.waitFor(() =>
      expect(getComputedStyle(outer).backgroundColor).toBe(getComputedStyle(probe).backgroundColor),
    )
    expect(getComputedStyle(outer).boxShadow).not.toBe('none')
  } finally {
    await userEvent.hover(document.body, { position: { x: 1000, y: 700 } })
    mounted.dispose()
  }
})

test('a grip of dots sits on the line, across it, only when chosen', async () => {
  let mounted = mountNested({ handle: 'grip' })
  try {
    await ready()
    const [outer, inner] = handles() as [HTMLElement, HTMLElement]
    const grip = outer.firstElementChild!.getBoundingClientRect()
    const line = outer.getBoundingClientRect()
    expect(grip.width).toBeGreaterThan(line.width * 4)
    expect(grip.left + grip.width / 2).toBeCloseTo(line.left + line.width / 2, 0)
    expect(grip.top + grip.height / 2).toBeCloseTo(line.top + line.height / 2, 0)
    expect(grip.height).toBeGreaterThan(grip.width)
    // One over the other, the grip lies along the horizontal line.
    const across = inner.firstElementChild!.getBoundingClientRect()
    expect(across.width).toBeGreaterThan(across.height)
    expect(getComputedStyle(outer.firstElementChild!).backgroundImage).toContain('radial-gradient')
  } finally {
    mounted.dispose()
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    document.body.replaceChildren()
  }
  mounted = mountNested()
  try {
    await ready()
    expect(getComputedStyle(handles()[0]!.firstElementChild!).display).toBe('none')
  } finally {
    mounted.dispose()
  }
})
