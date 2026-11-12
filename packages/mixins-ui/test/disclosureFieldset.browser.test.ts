/**
 * The Disclosure and Fieldset recipes on a real runtime, over `@foldkit/ui`'s
 * own views. A disclosure opened by a press turns its chevron up, and a
 * bordered one squares its button's lower corners onto the panel, a state
 * rule its variant's own corners would otherwise beat; `animatePanel` still
 * shuts the panel to nothing. A disabled fieldset dims its legend whatever
 * the variant, and a boxed one holds its floated legend inside the box.
 */
import { view as disclosureView } from '@foldkit/ui/disclosure'
import { view as fieldsetView } from '@foldkit/ui/fieldset'
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Disclosure, DisclosureSlots, Fieldset, FieldsetSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({}))
const Model = Schema.Struct({ open: Schema.Boolean })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly open: boolean }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = (css: string, still = true) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    css +
    // Still, so a turn is read where it ends.
    (still ? ':root{--fk-knob-motion:0}' : '')
  document.head.append(sheet)
}

/** An empty spot well below the controls, where the pointer rests between presses. */
const spot = (h: HtmlBuilder<Message>): Html =>
  h.div([h.Id('spot'), h.Style({ blockSize: '6rem', marginBlockStart: '12rem' })], [])

const park = () => userEvent.hover(document.getElementById('spot')!)

const embed = (id: string, view: (model: Model, h: HtmlBuilder<Message>) => Html) => {
  const container = document.createElement('div')
  container.id = id
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { open: false } }),
      update: (_model: Model, message: Message) => ({ model: { open: message.open } }),
      view,
    }),
  )
}

const mountDisclosure = (selection: Parameters<typeof Recipes.Disclosure>[0], still = true) => {
  const style = Style.forSlots(DisclosureSlots)(Recipes.Disclosure(selection))
  install(style.css, still)
  return embed('disclosure-browser', (model, h) =>
    h.div(
      [h.Style({ inlineSize: '20rem' })],
      [
        disclosureView<Message>(
          {
            id: 'details',
            isOpen: model.open,
            onToggle: open => ({ _tag: 'Toggled', open }),
            toView: attributes => {
              const resolved = Disclosure.resolve(attributes, [style.mixin], {
                input: undefined,
                h,
              })
              return h.div(
                [],
                [
                  h.button(resolved.button, ['Details']),
                  resolved.animatePanel(h.div(resolved.panel, ['Shipped in two days.'])),
                ],
              )
            },
          },
          h,
        ),
        spot(h),
      ],
    ),
  )
}

const button = () => document.getElementById('details-button')!
const panel = () => document.getElementById('details-panel')!
// The grid `animatePanel` draws round the panel: it clips, the panel keeps its height.
const shown = () => panel().parentElement!.parentElement!.getBoundingClientRect().height
const chevron = () => getComputedStyle(button(), '::after').rotate

test('a press turns the chevron up and opens the panel, and a second shuts it to nothing', async () => {
  const handle = mountDisclosure({})
  try {
    await vi.waitFor(() => expect(button()).not.toBeNull())
    await park()
    expect(chevron()).toBe('45deg')
    expect(shown()).toBe(0)
    button().click()
    await vi.waitFor(() => expect(chevron()).toBe('225deg'))
    await vi.waitFor(() => expect(shown()).toBeGreaterThan(10))
    button().click()
    await vi.waitFor(() => expect(shown()).toBe(0))
    expect(chevron()).toBe('45deg')
  } finally {
    handle.dispose()
  }
})

// What moves the panel's height: upstream writes the transition inline on this grid.
const heightDuration = () =>
  getComputedStyle(panel().parentElement!.parentElement!).transitionDuration

const preferReducedMotion = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

test.each([
  ['reduced motion', 'reduce', '0s'],
  ['a still theme', 'no-preference', '0s'],
] as const)('the panel height does not slide under %s', async (_name, preference, expected) => {
  const handle = mountDisclosure({}, preference === 'no-preference')
  try {
    await vi.waitFor(() => expect(button()).not.toBeNull())
    await park()
    await preferReducedMotion(preference === 'reduce' ? 'reduce' : 'no-preference')
    await vi.waitFor(() => expect(heightDuration()).toBe(expected))
  } finally {
    await preferReducedMotion('no-preference')
    handle.dispose()
  }
})

test('the panel height still slides at the default motion', async () => {
  const handle = mountDisclosure({}, false)
  try {
    await vi.waitFor(() => expect(button()).not.toBeNull())
    await park()
    await preferReducedMotion('no-preference')
    expect(parseFloat(heightDuration())).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test('a bordered button squares its lower corners onto the panel only while open', async () => {
  const handle = mountDisclosure({ variant: 'bordered' })
  try {
    await vi.waitFor(() => expect(button()).not.toBeNull())
    await park()
    const corners = () => {
      const css = getComputedStyle(button())
      return [css.borderTopLeftRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius]
    }
    const [round] = corners()
    expect(parseFloat(round!)).toBeGreaterThan(0)
    expect(corners()).toEqual([round, round, round])
    button().click()
    await vi.waitFor(() => expect(corners()).toEqual([round, '0px', '0px']))
    expect(getComputedStyle(panel()).borderBottomWidth).toBe('1px')
  } finally {
    handle.dispose()
  }
})

test('no chevron is drawn when the button brings its own icon', async () => {
  const handle = mountDisclosure({ indicator: 'none' })
  try {
    await vi.waitFor(() => expect(button()).not.toBeNull())
    expect(getComputedStyle(button(), '::after').content).toBe('none')
  } finally {
    handle.dispose()
  }
})

const mountFieldset = (variant: 'plain' | 'bordered' | 'filled', isDisabled: boolean) => {
  const style = Style.forSlots(FieldsetSlots)(Recipes.Fieldset({ variant }))
  install(style.css)
  return embed('fieldset-browser', (_model, h) =>
    h.div(
      [h.Style({ inlineSize: '24rem' })],
      [
        fieldsetView<Message>(
          {
            id: 'shipping',
            isDisabled,
            hasDescription: true,
            toView: attributes => {
              const resolved = Fieldset.resolve(attributes, [style.mixin], { input: undefined, h })
              return h.fieldset(resolved.fieldset, [
                h.legend(resolved.legend, ['Shipping']),
                h.p(resolved.description, ['Where the parcel goes.']),
                h.input([h.Id('street'), h.Type('text')]),
              ])
            },
          },
          h,
        ),
      ],
    ),
  )
}

const legend = () => document.getElementById('shipping-legend')!
const description = () => document.getElementById('shipping-description')!
const fieldset = () => document.getElementById('shipping')!

test.each(['plain', 'bordered', 'filled'] as const)(
  'a disabled %s fieldset dims its legend and description, and an enabled one does not',
  async variant => {
    const disabled = mountFieldset(variant, true)
    try {
      await vi.waitFor(() => expect(legend()).not.toBeNull())
      const dim = getComputedStyle(legend()).opacity
      expect(Number(dim)).toBeLessThan(1)
      expect(Number(dim)).toBeGreaterThan(0)
      expect(getComputedStyle(description()).opacity).toBe(dim)
    } finally {
      disabled.dispose()
    }
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    document.body.replaceChildren()
    const enabled = mountFieldset(variant, false)
    try {
      await vi.waitFor(() => expect(legend()).not.toBeNull())
      expect(getComputedStyle(legend()).opacity).toBe('1')
    } finally {
      enabled.dispose()
    }
  },
)

test.each(['bordered', 'filled'] as const)(
  'a %s fieldset holds its legend inside the box, the description just below it',
  async variant => {
    const handle = mountFieldset(variant, false)
    try {
      await vi.waitFor(() => expect(legend()).not.toBeNull())
      const box = fieldset().getBoundingClientRect()
      const css = getComputedStyle(fieldset())
      const inner = box.top + parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop)
      const words = legend().getBoundingClientRect()
      expect(words.top).toBeCloseTo(inner, 0)
      expect(words.left).toBeGreaterThan(box.left)
      const below = description().getBoundingClientRect().top - words.bottom
      expect(below).toBeGreaterThan(0)
      expect(below).toBeLessThan(8)
      const street = document.getElementById('street')!.getBoundingClientRect()
      expect(street.top - description().getBoundingClientRect().bottom).toBeGreaterThan(below)
    } finally {
      handle.dispose()
    }
  },
)
