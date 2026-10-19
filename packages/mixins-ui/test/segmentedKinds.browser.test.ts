/**
 * Segmented controls with icons, in each size and width, and underlined, on
 * a real runtime: pressing an option with an icon moves nothing beside it,
 * an icon alone is a square named by its label, the underline's indicator
 * is a line at the pressed option's foot, a full-width control shares its
 * container's width equally, and the sizes step up the ladder.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import * as Segmented from '../src/segmented.js'
import { SegmentedSlots } from '../src/segmented.js'
import { Segmented as SegmentedRecipe } from '../src/recipes/segmented.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({ pressed: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Pressed: { value: Schema.String } })
type Message = typeof Message.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Fixture {
  readonly recipe?: Parameters<typeof SegmentedRecipe>[0]
  readonly icons?: 'with' | 'only'
  readonly fluid?: boolean
  readonly pressed?: string
  /** The width of the box around it. */
  readonly width?: string
}

const labels = ['List', 'Board', 'Calendar']

const mount = (fixture: Fixture) => {
  const style = Style.forSlots(SegmentedSlots)(SegmentedRecipe(fixture.recipe ?? {}))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css +
    // Nothing that would measure again, so only the change under test moves anything.
    '* { transition: none !important; }'
  document.head.append(sheet)
  const box = document.createElement('div')
  box.style.width = fixture.width ?? '30rem'
  const container = document.createElement('div')
  container.id = 'segmented-kinds'
  box.append(container)
  document.body.append(box)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { pressed: fixture.pressed ?? 'Board' } }),
      update: (model: Model, { value }: Message) =>
        value === model.pressed ? { model } : { model: { pressed: value } },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Segmented.view(
          {
            label: 'View',
            options: labels.map(label => ({
              value: label,
              label,
              ...(fixture.icons === undefined
                ? {}
                : {
                    icon: h.svg([h.Attribute('viewBox', '0 0 16 16')], []),
                    iconOnly: fixture.icons === 'only',
                  }),
            })),
            pressed: [model.pressed],
            onPress: value => Message.Pressed({ value }),
            style,
            ...(fixture.fluid === true ? { mixins: Segmented.fluid } : {}),
          },
          h,
        ),
    }),
  )
  return { handle, press: (name: string) => option(name).click() }
}

const option = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[aria-pressed]')).find(
    each => each.textContent === name || each.getAttribute('aria-label') === name,
  )!
const indicator = () => document.querySelector('[role="group"]')!.children[0] as HTMLElement
const rect = (element: Element) => element.getBoundingClientRect()

test('pressing an option with an icon moves nothing beside it', async () => {
  const { handle, press } = mount({ icons: 'with', pressed: 'List' })
  try {
    await vi.waitFor(() => expect(option('Calendar')).toBeTruthy())
    const before = rect(option('Calendar')).left
    press('Board')
    await vi.waitFor(() => expect(option('Board').getAttribute('aria-pressed')).toBe('true'))
    expect(getComputedStyle(option('Board')).fontWeight).toBe('600')
    expect(rect(option('Calendar')).left).toBe(before)
  } finally {
    handle.dispose()
  }
})

test('an icon alone is a square, named by its label', async () => {
  const { handle } = mount({ icons: 'only' })
  try {
    await vi.waitFor(() => expect(option('Board')).toBeTruthy())
    const { width, height } = rect(option('Board'))
    expect(Math.abs(width - height)).toBeLessThan(0.5)
    expect(option('Board').textContent).toBe('')
  } finally {
    handle.dispose()
  }
})

test('underlined, the indicator is a line at the pressed option’s foot', async () => {
  const { handle } = mount({ recipe: { tray: 'underline' }, fluid: true })
  try {
    await vi.waitFor(() => {
      const line = rect(indicator())
      const under = rect(option('Board'))
      expect(line.height).toBeGreaterThan(0)
      expect(line.height).toBeLessThan(4)
      expect(Math.abs(line.bottom - under.bottom)).toBeLessThan(0.5)
      expect(Math.abs(line.left - under.left)).toBeLessThan(0.5)
      expect(Math.abs(line.width - under.width)).toBeLessThan(0.5)
    })
  } finally {
    handle.dispose()
  }
})

test('full width, the options share the container’s width equally', async () => {
  const { handle } = mount({ recipe: { width: 'fill' }, width: '30rem' })
  try {
    await vi.waitFor(() => expect(option('List')).toBeTruthy())
    const group = rect(document.querySelector('[role="group"]')!)
    expect(Math.abs(group.width - 480)).toBeLessThan(0.5)
    const widths = labels.map(label => rect(option(label)).width)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.5)
  } finally {
    handle.dispose()
  }
})

test('a tray is as wide as its options, not its container', async () => {
  const { handle } = mount({ width: '40rem' })
  try {
    await vi.waitFor(() => expect(option('List')).toBeTruthy())
    const group = rect(document.querySelector('[role="group"]')!)
    expect(Math.abs(group.right - rect(option('Calendar')).right)).toBeLessThan(8)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['sm', 'md'],
  ['md', 'lg'],
] as const)('a %s option is shorter than a %s one', async (small, large) => {
  const heightAt = async (size: 'sm' | 'md' | 'lg') => {
    const { handle } = mount({ recipe: { size } })
    try {
      await vi.waitFor(() => expect(option('List')).toBeTruthy())
      return rect(option('List')).height
    } finally {
      handle.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  expect(await heightAt(small)).toBeLessThan(await heightAt(large))
})
