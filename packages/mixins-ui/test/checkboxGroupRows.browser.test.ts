/**
 * What a checkbox group's rows hold, on a real runtime with the shipped
 * recipe's CSS: a mark before the words that a press on chooses, a trailing
 * mark that stays pressable on its own, words of the application's own
 * drawing named by `label`, and `variant: card`, where a press anywhere on
 * the card chooses it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CheckboxGroup, CheckboxGroupSlots, Recipes } from '../src/index.js'

const Model = Schema.Struct({ checked: Schema.Array(Schema.String), pressed: Schema.Number })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly value: string } | { readonly _tag: 'Info' }
const toggled = (value: string): Message => ({ _tag: 'Toggled', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (variant: 'plain' | 'card') => {
  const style = Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({ variant }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) +
    style.css +
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'checkbox-rows'
  document.body.append(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ inlineSize: '360px', padding: '24px' })],
      [
        CheckboxGroup.view(
          {
            id: 'plans',
            legend: 'Plans',
            options: [
              {
                value: 'team',
                label: 'Team',
                description: h.em([h.Id('rich')], ['Ten editors']),
                icon: h.span([h.Id('mark')], ['T']),
                trailing: h.button([h.Id('info'), h.OnClick({ _tag: 'Info' })], ['Info']),
              },
              { value: 'org', label: 'Organization', content: h.strong([], ['Org (annual)']) },
            ],
            checked: model.checked,
            onToggle: toggled,
            style,
          },
          h,
        ),
        h.p([h.Id('pressed')], [String(model.pressed)]),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { checked: [], pressed: 0 } }),
      update: (model: Model, message: Message) => ({
        model:
          message._tag === 'Info'
            ? { ...model, pressed: model.pressed + 1 }
            : { ...model, checked: CheckboxGroup.toggled(model.checked, message.value) },
      }),
      view,
    }),
  )
}

const box = (value: string) => document.getElementById(`plans-${value}`)!
const drawn = () => vi.waitFor(() => expect(document.getElementById('plans-team')).not.toBeNull())

test('a press on the mark before the words chooses the option', async () => {
  const handle = mount('plain')
  try {
    await drawn()
    await userEvent.click(document.getElementById('mark')!)
    await vi.waitFor(() => expect(box('team').getAttribute('aria-checked')).toBe('true'))
    expect(document.getElementById('mark')!.closest('label')?.getAttribute('for')).toBe(
      'plans-team',
    )
  } finally {
    handle.dispose()
  }
})

test('rich words are drawn, and `label` still names a box whose words are the application’s', async () => {
  const handle = mount('plain')
  try {
    await drawn()
    expect(document.getElementById('rich')?.textContent).toBe('Ten editors')
    expect(document.getElementById('plans-team')?.getAttribute('aria-describedby')).toBe(
      document.getElementById('rich')!.parentElement!.id,
    )
    expect(box('org').getAttribute('aria-label')).toBe('Organization')
    expect(box('team').hasAttribute('aria-label')).toBe(false)
    expect(document.querySelector('label[for="plans-org"] strong')?.textContent).toBe(
      'Org (annual)',
    )
  } finally {
    handle.dispose()
  }
})

test('a card is one press target, and its trailing button is pressable on its own', async () => {
  const handle = mount('card')
  try {
    await drawn()
    const option = box('team').parentElement!
    const area = option.getBoundingClientRect()
    await userEvent.click(option, { position: { x: area.width - 4, y: area.height - 4 } })
    await vi.waitFor(() => expect(box('team').getAttribute('aria-checked')).toBe('true'))
    await userEvent.click(document.getElementById('info')!)
    await vi.waitFor(() => expect(document.getElementById('pressed')!.textContent).toBe('1'))
    expect(box('team').getAttribute('aria-checked')).toBe('true')
    expect(getComputedStyle(option).borderStartStartRadius).not.toBe('0px')
  } finally {
    handle.dispose()
  }
})
