/**
 * A single-choice Segmented control with a real keyboard: one tab stop, the
 * arrows, Home and End move the choice and focus together, a disabled option
 * is skipped, right to left swaps the horizontal pair, and a disabled group
 * takes nothing.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Recipes, Segmented, SegmentedSlots } from '../src/index.js'

const style = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))

const Model = Schema.Struct({ pressed: Schema.String })
type Model = typeof Model.Type
const Pressed = Schema.TaggedStruct('Pressed', { value: Schema.String })
type Message = typeof Pressed.Type

const labels = ['Day', 'Week', 'Month', 'Year'] as const

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

const mount = (
  fixture: { dir?: 'rtl'; disabled?: boolean; name?: string; fluid?: boolean } = {},
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) + style.css
  document.head.append(sheet)
  if (fixture.dir !== undefined) document.documentElement.dir = fixture.dir
  const container = document.createElement('div')
  container.id = 'segmented-radio'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { pressed: 'Day' } }),
      update: (model: Model, { value }: Message) =>
        value === model.pressed ? { model } : { model: { pressed: value } },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.button([h.Id('before')], ['before']),
            Segmented.view(
              {
                id: 'range',
                label: 'Range',
                options: labels.map(label => ({
                  value: label,
                  label,
                  disabled: label === 'Week',
                })),
                pressed: [model.pressed],
                onPress: value => Pressed.make({ value }),
                direction: fixture.dir ?? 'ltr',
                style,
                ...(fixture.fluid === true ? { mixins: Segmented.fluid } : {}),
                ...(fixture.disabled === true ? { disabled: true } : {}),
                ...(fixture.name === undefined ? {} : { name: fixture.name }),
              },
              h,
            ),
            h.button([h.Id('after')], ['after']),
          ],
        ),
    }),
  )
}

const radio = (label: string) => document.getElementById(`range-${label}`)!
/** A press, as `click()`: a steady-copy button is not one the locator can press. */
const choose = (label: string) => {
  radio(label).focus()
  radio(label).click()
}
const ready = () => vi.waitFor(() => expect(document.getElementById('range-Day')).not.toBeNull())
const chosen = () =>
  Array.from(document.querySelectorAll('[role="radio"]'))
    .filter(each => each.getAttribute('aria-checked') === 'true')
    .map(each => each.textContent)

test('a single choice is a radio group with the chosen option the one tab stop', async () => {
  const handle = mount()
  try {
    await ready()
    expect(document.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Range')
    expect(chosen()).toEqual(['Day'])
    expect(labels.map(label => radio(label).tabIndex)).toEqual([0, -1, -1, -1])
    // Tab goes through the group in one stop.
    document.getElementById('before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(radio('Day'))
    await userEvent.tab()
    expect(document.activeElement).toBe(document.getElementById('after'))
  } finally {
    handle.dispose()
  }
})

test('the tab stop follows the choice', async () => {
  const handle = mount()
  try {
    await ready()
    choose('Month')
    await vi.waitFor(() =>
      expect(labels.map(label => radio(label).tabIndex)).toEqual([-1, -1, 0, -1]),
    )
  } finally {
    handle.dispose()
  }
})

const keys = [
  ['ltr', 'ArrowRight', 'Month'],
  ['ltr', 'ArrowDown', 'Month'],
  ['ltr', 'ArrowLeft', 'Year'],
  ['ltr', 'ArrowUp', 'Year'],
  ['rtl', 'ArrowLeft', 'Month'],
  ['rtl', 'ArrowRight', 'Year'],
  ['rtl', 'ArrowDown', 'Month'],
  ['ltr', 'End', 'Year'],
] as const

test.each(keys)('%s: %s from Day lands on %s, over the disabled Week', async (dir, key, lands) => {
  const handle = mount(dir === 'rtl' ? { dir } : {})
  try {
    await ready()
    radio('Day').focus()
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(document.activeElement).toBe(radio(lands)))
    expect(chosen()).toEqual([lands])
  } finally {
    handle.dispose()
  }
})

test('Home returns to the first option', async () => {
  const handle = mount()
  try {
    await ready()
    choose('Year')
    await vi.waitFor(() => expect(chosen()).toEqual(['Year']))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(document.activeElement).toBe(radio('Day')))
    expect(chosen()).toEqual(['Day'])
  } finally {
    handle.dispose()
  }
})

test('a disabled group takes no press and no tab stop', async () => {
  const handle = mount({ disabled: true })
  try {
    await ready()
    expect(document.querySelector('[role="radiogroup"]')!.getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(labels.map(label => (radio(label) as HTMLButtonElement).disabled)).toEqual([
      true,
      true,
      true,
      true,
    ])
    document.getElementById('before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(document.getElementById('after'))
  } finally {
    handle.dispose()
  }
})

test('the chosen value is submitted under the name', async () => {
  const handle = mount({ name: 'range' })
  try {
    await ready()
    const hidden = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="range"]')).map(
        input => input.value,
      )
    expect(hidden()).toEqual(['Day'])
    choose('Month')
    await vi.waitFor(() => expect(hidden()).toEqual(['Month']))
  } finally {
    handle.dispose()
  }
})

test('the chosen radio takes the pressed look, and the fluid pill follows it', async () => {
  const handle = mount({ fluid: true })
  try {
    await ready()
    const weight = (label: string) => getComputedStyle(radio(label)).fontWeight
    expect(Number(weight('Day'))).toBeGreaterThan(Number(weight('Month')))
    choose('Month')
    await vi.waitFor(() => expect(chosen()).toEqual(['Month']))
    const group = document.querySelector<HTMLElement>('[role="radiogroup"]')!
    // The measured box is the chosen option's: where it starts.
    await vi.waitFor(() =>
      expect(
        Number.parseFloat(group.style.getPropertyValue('--fk-segmented-chosen-x')),
      ).toBeCloseTo(radio('Month').offsetLeft, 0),
    )
  } finally {
    handle.dispose()
  }
})
