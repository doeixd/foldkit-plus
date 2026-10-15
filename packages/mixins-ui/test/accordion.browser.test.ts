/**
 * An accordion on a real runtime, its open sections in the Model: a press
 * opens a section's panel to its content's height and shuts it to nothing,
 * with no measured height; the chevron turns; the open title turns semibold
 * in the width it already had; a shut panel's content cannot be reached.
 * A trigger is pressed with `click()`: vitest's locator reads a steady
 * label's hidden copy into the name, which Chrome does not (`steady`).
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Accordion, AccordionSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(AccordionSlots)(Recipes.Accordion({}))
const Model = Schema.Struct({ open: Schema.Array(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly id: string }
const Toggled = (id: string): Message => ({ _tag: 'Toggled', id })

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    // Still, so a size is read where it ends rather than mid-flight.
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'accordion-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ inlineSize: '20rem' })],
      [
        Accordion.view(
          {
            id: 'settings',
            items: [
              {
                id: 'billing',
                title: 'Billing',
                content: h.p([], [h.a([h.Href('#seats')], ['Seats'])]),
              },
              { id: 'team', title: 'Team', content: 'Invite, remove, and assign roles.' },
            ],
            open: model.open,
            onToggle: Toggled,
            style,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { open: [] } }),
      update: (model: Model, message: Message) => ({
        model: { open: Accordion.toggled(model.open, message.id) },
      }),
      view,
    }),
  )
}

const trigger = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    button.textContent?.includes(name),
  )!
const panelOf = (name: string) =>
  document.getElementById(trigger(name).getAttribute('aria-controls')!)!

test('a press opens a panel to its content and shuts it to nothing', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(panelOf('Team').getBoundingClientRect().height).toBe(0)
    trigger('Team').click()
    await vi.waitFor(() =>
      expect(panelOf('Team').getBoundingClientRect().height).toBeGreaterThan(10),
    )
    expect(trigger('Team').getAttribute('aria-expanded')).toBe('true')
    trigger('Team').click()
    await vi.waitFor(() => expect(panelOf('Team').getBoundingClientRect().height).toBe(0))
  } finally {
    handle.dispose()
  }
})

test('the chevron turns a quarter as the section opens', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const chevron = () =>
      getComputedStyle(trigger('Team').querySelector('[aria-hidden="true"]')!).rotate
    expect(chevron()).toBe('-45deg')
    trigger('Team').click()
    await vi.waitFor(() => expect(chevron()).toBe('45deg'))
  } finally {
    handle.dispose()
  }
})

test('the open title is semibold in the width it had shut', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Billing')).toBeDefined())
    const label = () => trigger('Billing').querySelector('[data-label]')!
    const shut = label().getBoundingClientRect().width
    trigger('Billing').click()
    await vi.waitFor(() => expect(getComputedStyle(label()).fontWeight).toBe('600'))
    expect(label().getBoundingClientRect().width).toBe(shut)
  } finally {
    handle.dispose()
  }
})

test('a shut panel takes no focus: Tab passes from its trigger to the next', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Billing')).toBeDefined())
    trigger('Billing').focus()
    await userEvent.tab()
    // The link inside the shut Billing panel is skipped.
    expect(document.activeElement).toBe(trigger('Team'))
  } finally {
    handle.dispose()
  }
})
