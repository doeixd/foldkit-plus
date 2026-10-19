/**
 * A radio group laid out by a real browser: its options stack unless the
 * group says it is a row, as upstream's groups are vertical by default.
 */
import { Option, Schema } from 'effect'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { RadioGroup, RadioGroupSlots, Recipes } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const optionTops = (orientation: 'vertical' | 'horizontal'): ReadonlyArray<number> => {
  const piece = Recipes.RadioGroup({}).group
  if (piece === undefined) throw new Error('no group piece')
  const one = Style.forSlots(RadioGroupSlots)({ group: piece })
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + one.css
  document.head.append(sheet)
  const classes = [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
  const holder = document.createElement('div')
  holder.innerHTML = `<div role="radiogroup" aria-orientation="${orientation}" class="${classes}"><label>Monthly</label><label>Yearly</label></div>`
  document.body.append(holder)
  return Array.from(holder.querySelectorAll('label'), label => label.getBoundingClientRect().top)
}

test('a vertical group stacks its options', () => {
  const [first, second] = optionTops('vertical')
  expect(second).toBeGreaterThan(first!)
})

test('a horizontal group lays its options in a row', () => {
  const [first, second] = optionTops('horizontal')
  expect(second).toBe(first)
})

const Plans = RadioGroupUi.create<'monthly' | 'yearly'>()
const Model = Schema.Struct({
  radio: RadioGroupUi.Model,
  value: Schema.Literals(['monthly', 'yearly']),
})
type Model = typeof Model.Type

/** A group of two cards on a real runtime, Yearly chosen, in a `scheme` page. */
const cards = (scheme: 'light' | 'dark') => {
  const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
  const style = Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({ variant: 'card' }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: scheme })),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'radio-cards'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { radio: RadioGroupUi.init({ id: 'plan' }), value: 'yearly' as const },
      }),
      update: (model: Model, message: RadioGroupUi.Message) => {
        const next = Plans.update(model.radio, message)
        return {
          model: { radio: next.model, value: next.outMessage?.value ?? model.value },
          commands: next.commands ?? [],
        }
      },
      view: (model: Model, h: HtmlBuilder<RadioGroupUi.Message>) =>
        Plans.view(
          model.radio,
          {
            options: ['monthly', 'yearly'],
            selectedValue: Option.some(model.value),
            ariaLabel: 'Plan',
            toView: RadioGroup.toView([style.mixin], { h }, ({ group, options }) =>
              h.div(
                group,
                options.map(option =>
                  h.label(
                    [...option.card, h.Id(option.value)],
                    [
                      h.button(option.option, []),
                      h.span(option.label, [option.value]),
                      h.span(option.description, [`Billed ${option.value}`]),
                    ],
                  ),
                ),
              ),
            ),
          },
          h,
        ),
    }),
  )
}

/** The lightness of a computed OKLab or OKLCH color, 0 to 1. */
const lightness = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

test.each(['light', 'dark'] as const)(
  'in a %s scheme the chosen card stands out from the other, in border and fill',
  async scheme => {
    const handle = cards(scheme)
    try {
      await vi.waitFor(() => expect(document.getElementById('yearly')).not.toBeNull())
      const chosen = getComputedStyle(document.getElementById('yearly')!)
      const other = getComputedStyle(document.getElementById('monthly')!)
      // The chosen card is rimmed in the accent its checked radio is.
      const radio = getComputedStyle(document.querySelector('#yearly [role="radio"]')!)
      expect(chosen.borderTopColor).toBe(radio.borderTopColor)
      expect(other.borderTopColor).not.toBe(radio.borderTopColor)
      expect(
        Math.abs(lightness(chosen.backgroundColor) - lightness(other.backgroundColor)),
      ).toBeGreaterThan(0.03)
    } finally {
      handle.dispose()
    }
  },
)

test("a press on a card's words or its description chooses its radio", async () => {
  const handle = cards('light')
  try {
    await vi.waitFor(() => expect(document.getElementById('monthly')).not.toBeNull())
    const radio = (id: string) => document.querySelector(`#${id} [role="radio"]`)!
    await userEvent.click(document.querySelector('#monthly span')!)
    await vi.waitFor(() => expect(radio('monthly').getAttribute('aria-checked')).toBe('true'))
    await userEvent.click(document.querySelector('#yearly span:last-child')!)
    await vi.waitFor(() => expect(radio('yearly').getAttribute('aria-checked')).toBe('true'))
    expect(radio('monthly').getAttribute('aria-checked')).toBe('false')
  } finally {
    handle.dispose()
  }
})
