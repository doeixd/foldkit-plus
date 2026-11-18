/**
 * The options-level views of Checkbox, Switch, Select and RadioGroup on a real
 * runtime, with the shipped recipes' CSS: what a press changes, where the
 * words and the control sit, that a card is one press target, and what each
 * writes for a screen reader and a form.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Bundles,
  Checkbox,
  CheckboxSlots,
  RadioGroup,
  RadioGroupSlots,
  Recipes,
  Select,
  SelectSlots,
  Switch,
  SwitchSlots,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = (css: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    css +
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'choice-views'
  document.body.append(container)
  return container
}

const Model = Schema.Struct({ terms: Schema.Boolean, push: Schema.Boolean, region: Schema.String })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Terms'; readonly checked: boolean }
  | { readonly _tag: 'Push'; readonly checked: boolean }
  | { readonly _tag: 'Region'; readonly value: string }

const toTerms = (checked: boolean): Message => ({ _tag: 'Terms', checked })
const toPush = (checked: boolean): Message => ({ _tag: 'Push', checked })
const toRegion = (value: string): Message => ({ _tag: 'Region', value })

const checkboxStyle = (selection: Parameters<typeof Recipes.Checkbox>[0] = {}) =>
  Style.forSlots(CheckboxSlots)(Recipes.Checkbox(selection))
const switchStyle = (selection: Parameters<typeof Recipes.Switch>[0] = {}) =>
  Style.forSlots(SwitchSlots)(Recipes.Switch(selection))
const selectStyle = Style.forSlots(SelectSlots)(Recipes.Select({}))

const mount = (
  css: string,
  draw: (model: Model, h: HtmlBuilder<Message>) => Html,
  initial: Partial<Model> = {},
) =>
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container: install(css),
      init: () => ({ model: { terms: false, push: false, region: '', ...initial } }),
      update: (model: Model, message: Message) => ({
        model:
          message._tag === 'Terms'
            ? { ...model, terms: message.checked }
            : message._tag === 'Push'
              ? { ...model, push: message.checked }
              : { ...model, region: message.value },
      }),
      view: (model, h) =>
        h.div([h.Style({ padding: '40px', inlineSize: '320px' })], [draw(model, h)]),
    }),
  )

const one = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!
const drawn = (selector: string) =>
  vi.waitFor(() => expect(document.querySelector(selector)).not.toBeNull())

const terms = (
  h: HtmlBuilder<Message>,
  model: Model,
  more: Partial<Parameters<typeof Checkbox.view<Message>>[0]> = {},
) =>
  Checkbox.view(
    {
      id: 'terms',
      checked: model.terms,
      onToggle: toTerms,
      label: 'Accept the terms',
      style: checkboxStyle(),
      ...more,
    },
    h,
  )

test('a press on the label toggles the checkbox once, and the label names it', async () => {
  const handle = mount(checkboxStyle().css, (model, h) => terms(h, model))
  try {
    await drawn('[role="checkbox"]')
    const box = one('[role="checkbox"]')
    expect(box.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(one('label'))
    await vi.waitFor(() => expect(box.getAttribute('aria-checked')).toBe('true'))
    expect(box.getAttribute('aria-labelledby')).toBe(one('label').id)
    await userEvent.click(box)
    await vi.waitFor(() => expect(box.getAttribute('aria-checked')).toBe('false'))
  } finally {
    handle.dispose()
  }
})

test('the description describes the control, and a name submits the state', async () => {
  const handle = mount(checkboxStyle().css, (model, h) =>
    terms(h, model, { description: 'You can read them first.', name: 'terms', value: 'yes' }),
  )
  try {
    await drawn('[role="checkbox"]')
    const box = one('[role="checkbox"]')
    const description = document.getElementById(box.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toBe('You can read them first.')
    expect(one<HTMLInputElement>('input[type="hidden"]').value).toBe('')
    await userEvent.click(box)
    await vi.waitFor(() => expect(one<HTMLInputElement>('input[type="hidden"]').value).toBe('yes'))
  } finally {
    handle.dispose()
  }
})

test.each([
  ['disabled', { disabled: true }, 'aria-disabled'],
  ['readOnly', { readOnly: true }, 'aria-readonly'],
] as const)(
  'a %s checkbox is written for a screen reader and refuses the press',
  async (_, flag, attribute) => {
    const handle = mount(checkboxStyle().css, (model, h) => terms(h, model, flag))
    try {
      await drawn('[role="checkbox"]')
      const box = one('[role="checkbox"]')
      expect(box.getAttribute(attribute)).toBe('true')
      box.click()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(box.getAttribute('aria-checked')).toBe('false')
    } finally {
      handle.dispose()
    }
  },
)

test('an invalid checkbox is aria-invalid and its row is marked', async () => {
  const handle = mount(checkboxStyle().css, (model, h) => terms(h, model, { invalid: true }))
  try {
    await drawn('[role="checkbox"]')
    expect(one('[role="checkbox"]').getAttribute('aria-invalid')).toBe('true')
    expect(one('[data-position]').getAttribute('data-invalid')).toBe('true')
  } finally {
    handle.dispose()
  }
})

test('position end puts the words before the control, and start after it', async () => {
  const offset = async (position: 'start' | 'end') => {
    const handle = mount(checkboxStyle().css, (model, h) => terms(h, model, { position }))
    try {
      await drawn('[role="checkbox"]')
      return (
        one('[role="checkbox"]').getBoundingClientRect().x - one('label').getBoundingClientRect().x
      )
    } finally {
      handle.dispose()
    }
  }
  expect(await offset('start')).toBeLessThan(0)
  expect(await offset('end')).toBeGreaterThan(100)
})

test('a card is one press target: its padding toggles, and the aside above it does not', async () => {
  const handle = mount(checkboxStyle({ variant: 'card' }).css, (model, h) =>
    terms(h, model, {
      style: checkboxStyle({ variant: 'card' }),
      description: 'Ten editors.',
      labelAside: h.button([h.Id('aside'), h.OnClick(toRegion('aside'))], ['Info']),
    }),
  )
  try {
    await drawn('#aside')
    const root = one('[data-position]')
    const box = root.getBoundingClientRect()
    // The card's bottom-right corner, inside its padding and over no text.
    await userEvent.click(root, { position: { x: box.width - 4, y: box.height - 4 } })
    await vi.waitFor(() =>
      expect(one('[role="checkbox"]').getAttribute('aria-checked')).toBe('true'),
    )
    expect(root.getAttribute('data-checked')).toBe('true')
    await userEvent.click(one('#aside'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(one('[role="checkbox"]').getAttribute('aria-checked')).toBe('true')
  } finally {
    handle.dispose()
  }
})

const pushed = (
  h: HtmlBuilder<Message>,
  model: Model,
  style: ReturnType<typeof switchStyle>,
): Html =>
  Switch.view(
    {
      id: 'push',
      checked: model.push,
      onToggle: toPush,
      label: 'Delete on close',
      description: 'Cannot be undone.',
      position: 'end',
      invalid: true,
      style,
    },
    h,
  )

const onFill = async (tone: 'accent' | 'danger') => {
  const style = switchStyle({ tone })
  const handle = mount(style.css, (model, h) => pushed(h, model, style), { push: true })
  try {
    await drawn('[role="switch"]')
    return getComputedStyle(one('[role="switch"]')).backgroundColor
  } finally {
    handle.dispose()
  }
}

test('a switch toggles from its label and says why it is invalid', async () => {
  const style = switchStyle()
  const handle = mount(style.css, (model, h) => pushed(h, model, style))
  try {
    await drawn('[role="switch"]')
    const control = one('[role="switch"]')
    expect(control.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Cannot be undone.')
    await userEvent.click(one('label'))
    await vi.waitFor(() => expect(control.getAttribute('aria-checked')).toBe('true'))
  } finally {
    handle.dispose()
  }
})

test('the switch has a danger tone that fills differently from the accent', async () => {
  expect(await onFill('danger')).not.toBe(await onFill('accent'))
})

const regions = [
  { value: 'fr', label: 'France', group: 'Europe' },
  { value: 'de', label: 'Germany', group: 'Europe' },
  { value: 'us', label: 'United States', group: 'Americas', disabled: true },
  { value: 'ca', label: 'Canada', group: 'Americas' },
  { value: 'mx', label: 'Mexico' },
]

test('a select draws its options under headings, a placeholder first, and reports a choice', async () => {
  const handle = mount(selectStyle.css, (model, h) =>
    Select.view(
      {
        id: 'region',
        label: 'Region',
        options: regions,
        value: model.region,
        placeholder: 'Choose a region',
        description: 'Where you live.',
        onChange: toRegion,
        style: selectStyle,
      },
      h,
    ),
  )
  try {
    await drawn('select')
    const select = one<HTMLSelectElement>('select')
    expect(Array.from(document.querySelectorAll('optgroup')).map(group => group.label)).toEqual([
      'Europe',
      'Americas',
    ])
    expect(select.options[0]?.textContent).toBe('Choose a region')
    expect(select.value).toBe('')
    expect(select.options[0]?.disabled).toBe(true)
    expect(Array.from(select.options).find(option => option.value === 'us')?.disabled).toBe(true)
    expect(one('label').getAttribute('for')).toBe(select.id)
    expect(
      document.getElementById(select.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Where you live.')
    await userEvent.selectOptions(select, 'de')
    await vi.waitFor(() => expect(select.value).toBe('de'))
    // The option with no group stands outside any heading.
    expect(one('option[value="mx"]').parentElement).toBe(select)
  } finally {
    handle.dispose()
  }
})

const Plans = [
  { value: 'free', label: 'Free', description: 'For one person.' },
  { value: 'team', label: 'Team', description: 'Ten editors.' },
  { value: 'org', label: 'Organization', disabled: true },
]

const Pricing = Bundle.compose({ plan: Schema.Option(Schema.String) }).pipe(
  Bundle.withChild('radio', Bundles.RadioGroup, {
    args: { id: 'plan' },
    onOut: out => model => ({ model: { ...model, plan: Option.some(out.value) } }),
  }),
)

const mountPlans = (
  selection: Parameters<typeof Recipes.RadioGroup>[0],
  more: Partial<Parameters<typeof RadioGroup.view<string, never>>[0]> = {},
) => {
  const style = Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup(selection))
  return Runtime.embed(
    Runtime.makeElement({
      ...Pricing.placements.runtime({ Model: Pricing.Model, initial: { plan: Option.none() } }),
      container: install(style.css),
      view: (model, h) =>
        h.div(
          [h.Style({ padding: '40px', inlineSize: '640px' })],
          [
            RadioGroup.view(
              {
                model: model.radio,
                onMessage: message => Pricing.Message.GotRadioMessage({ message }),
                legend: 'Plan',
                options: Plans,
                value: model.plan,
                name: 'plan',
                style,
                ...more,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

test('a radio group chooses by press, refuses a disabled option and submits the choice', async () => {
  const handle = mountPlans({})
  try {
    await drawn('[role="radiogroup"]')
    const radios = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]'))
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ])
    await userEvent.click(radios[1]!)
    await vi.waitFor(() => expect(radios[1]!.getAttribute('aria-checked')).toBe('true'))
    expect(one<HTMLInputElement>('input[type="hidden"]').value).toBe('team')
    radios[2]!.click()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(radios[2]!.getAttribute('aria-checked')).toBe('false')
    expect(radios[0]!.getAttribute('aria-describedby')).not.toBeNull()
    // The words are the option's label, and its description follows.
    expect(
      Array.from(document.querySelectorAll('[role="radiogroup"] > label')).map(
        row => row.textContent,
      ),
    ).toEqual(['FreeFor one person.', 'TeamTen editors.', 'Organization'])
  } finally {
    handle.dispose()
  }
})

test('an error makes the group invalid and describes it', async () => {
  const handle = mountPlans({}, { error: 'Choose a plan.' })
  try {
    await drawn('[role="radiogroup"]')
    const group = one('[role="radiogroup"]')
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Choose a plan.',
    )
  } finally {
    handle.dispose()
  }
})

test('layout grid sets the rows in columns, and stacked in one', async () => {
  const columns = async (layout: 'stacked' | 'grid') => {
    const handle = mountPlans({ layout })
    try {
      await drawn('[role="radiogroup"]')
      const xs = Array.from(document.querySelectorAll('[role="radiogroup"] > label')).map(
        row => row.getBoundingClientRect().x,
      )
      return new Set(xs).size
    } finally {
      handle.dispose()
    }
  }
  expect(await columns('stacked')).toBe(1)
  expect(await columns('grid')).toBeGreaterThan(1)
})
