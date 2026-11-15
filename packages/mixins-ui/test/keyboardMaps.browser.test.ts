/// <reference types="@vitest/browser-playwright" />
/**
 * The keys of widgets that have none of their own browser tests, typed with a
 * real keyboard and read back as what moved (focus or state) and whether the
 * page's own handling was kept (`defaultPrevented`). Each table row is
 * `start, key, what must follow`; a key a widget does not claim says so by
 * moving nothing and preventing nothing.
 */
import { Schema } from 'effect'
import { view as checkboxView } from '@foldkit/ui/checkbox'
import { view as switchView } from '@foldkit/ui/switch'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Accordion, Checkbox, Input, Steps, Switch } from '../src/index.js'

let handle: { readonly dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

const container = (id: string) => {
  const element = document.createElement('div')
  element.id = id
  document.body.append(element)
  return element
}

const active = () => document.activeElement?.id ?? document.activeElement?.tagName ?? ''

const byId = (id: string) => document.getElementById(id)!

/**
 * Types `keys` and reports, per keydown, whether anything had prevented its
 * default by the time it reached the window: the element's own handlers have
 * run by then, so a key a widget claims reads `true`.
 */
const typed = async (keys: string): Promise<ReadonlyArray<boolean>> => {
  const seen: Array<boolean> = []
  const listen = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
  window.addEventListener('keydown', listen)
  try {
    await userEvent.keyboard(keys)
  } finally {
    window.removeEventListener('keydown', listen)
  }
  return seen
}

// Checkbox and switch --------------------------------------------------------------

const Flags = Schema.Struct({ box: Schema.Boolean, lamp: Schema.Boolean })
type Flags = typeof Flags.Type
const FlagMessage = defineMessageUnion({
  ToggledBox: { isChecked: Schema.Boolean },
  ToggledLamp: { isChecked: Schema.Boolean },
})
type FlagMessage = typeof FlagMessage.Type

const mountFlags = () =>
  Runtime.embed(
    Runtime.makeElement({
      Model: Flags,
      container: container('flags'),
      init: () => ({ model: { box: false, lamp: false } }),
      update: (model: Flags, message: FlagMessage) =>
        FlagMessage.match(message, {
          ToggledBox: ({ isChecked }) => ({ model: { ...model, box: isChecked } }),
          ToggledLamp: ({ isChecked }) => ({ model: { ...model, lamp: isChecked } }),
        }),
      view: (model: Flags, h: HtmlBuilder<FlagMessage>) =>
        h.div(
          [],
          [
            checkboxView<FlagMessage>(
              {
                id: 'box',
                isChecked: model.box,
                onToggle: isChecked => FlagMessage.ToggledBox({ isChecked }),
                toView: Checkbox.toView([], { h }, resolved =>
                  h.div([], [h.button([...resolved.checkbox, h.Id('box-button')], []), 'Agree']),
                ),
              },
              h,
            ),
            switchView<FlagMessage>(
              {
                id: 'lamp',
                isChecked: model.lamp,
                onToggle: isChecked => FlagMessage.ToggledLamp({ isChecked }),
                toView: Switch.toView([], { h }, resolved =>
                  h.div([], [h.button([...resolved.button, h.Id('lamp-button')], []), 'Lamp']),
                ),
              },
              h,
            ),
          ],
        ),
    }),
  )

const toggledBy = async (id: string, keys: string) => {
  handle = mountFlags()
  await vi.waitFor(() => expect(byId(id)).not.toBeNull())
  const state = () => byId(id).getAttribute('aria-checked')
  byId(id).focus()
  expect(state()).toBe('false')
  await userEvent.keyboard(keys)
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  return state()
}

test.each([
  ['checkbox', 'box-button'],
  ['switch', 'lamp-button'],
] as const)('a %s toggles on Space and back on Space, focus staying on it', async (_name, id) => {
  expect(await toggledBy(id, ' ')).toBe('true')
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(byId(id).getAttribute('aria-checked')).toBe('false'))
  expect(active()).toBe(id)
})

test('a switch also toggles on Enter, which the APG allows it', async () => {
  expect(await toggledBy('lamp-button', '{Enter}')).toBe('true')
})

// Finding: the documented checkbox is a `button` with `role="checkbox"`, and a button's own
// Enter click toggles it. The APG's checkbox has Space alone, and a native checkbox ignores
// Enter. Nothing in the Checkbox bundle stops the key (the site's snippet,
// `examples/site/src/snippets/components.ts` `checkbox-basic`, draws `h.button(resolved.checkbox)`).
test.fails('a checkbox is not toggled by Enter, as the APG gives it Space alone', async () => {
  expect(await toggledBy('box-button', '{Enter}')).toBe('false')
})

// Input ----------------------------------------------------------------------------

const Draft = Schema.Struct({ text: Schema.String })
type Draft = typeof Draft.Type
const DraftMessage = defineMessageUnion({ Typed: { text: Schema.String } })
type DraftMessage = typeof DraftMessage.Type

test('an input claims no key: each is typed into it or left to the browser', async () => {
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: Draft,
      container: container('input-host'),
      init: () => ({ model: { text: '' } }),
      update: (_model: Draft, message: DraftMessage) =>
        DraftMessage.match(message, { Typed: ({ text }) => ({ model: { text } }) }),
      view: (model: Draft, h: HtmlBuilder<DraftMessage>) =>
        Input.view(
          {
            id: 'field',
            value: model.text,
            onInput: text => DraftMessage.Typed({ text }),
            draw: (resolved, h): Html => h.input([...resolved.input.slice(), h.AriaLabel('Name')]),
          },
          h,
        ),
    }),
  )
  await vi.waitFor(() => expect(byId('field')).not.toBeNull())
  const field = () => byId('field') as HTMLInputElement
  field().focus()
  const prevented = await typed(
    'ab {ArrowLeft}{ArrowRight}{Home}{End}{Backspace}{Escape}{Enter}{Tab}',
  )
  expect(prevented.every(each => !each)).toBe(true)
  expect(prevented).toHaveLength(11)
  await vi.waitFor(() => expect(field().value).toBe('ab'))
})

// Accordion ------------------------------------------------------------------------

const Open = Schema.Struct({ open: Schema.Array(Schema.String) })
type Open = typeof Open.Type
const OpenMessage = defineMessageUnion({ Toggled: { id: Schema.String } })
type OpenMessage = typeof OpenMessage.Type

test.each([['Enter'], ['Space']] as const)(
  'an accordion trigger opens and shuts on %s, and claims no arrow, Home or End',
  async name => {
    handle = Runtime.embed(
      Runtime.makeElement({
        Model: Open,
        container: container('accordion-host'),
        init: () => ({ model: { open: [] } }),
        update: (model: Open, message: OpenMessage) =>
          OpenMessage.match(message, {
            Toggled: ({ id }) => ({
              model: { open: Accordion.toggled(model.open, id, { multiple: true }) },
            }),
          }),
        view: (model: Open, h: HtmlBuilder<OpenMessage>) =>
          Accordion.view(
            {
              id: 'faq',
              items: [
                { id: 'a', title: 'First', content: 'aa' },
                { id: 'b', title: 'Second', content: 'bb' },
              ],
              open: model.open,
              onToggle: id => OpenMessage.Toggled({ id }),
            },
            h,
          ),
      }),
    )
    await vi.waitFor(() => expect(byId('faq-a-trigger')).not.toBeNull())
    const expanded = (id: string) => byId(id).getAttribute('aria-expanded')
    byId('faq-a-trigger').focus()
    await userEvent.keyboard(name === 'Enter' ? '{Enter}' : ' ')
    await vi.waitFor(() => expect(expanded('faq-a-trigger')).toBe('true'))
    await userEvent.keyboard(name === 'Enter' ? '{Enter}' : ' ')
    await vi.waitFor(() => expect(expanded('faq-a-trigger')).toBe('false'))
    // No arrow moves among the triggers: the page's own handling is kept, and focus stays.
    const prevented = await typed('{ArrowDown}{ArrowUp}{Home}{End}')
    expect(prevented).toEqual([false, false, false, false])
    expect(active()).toBe('faq-a-trigger')
  },
)

// Steps ----------------------------------------------------------------------------

const Stage = Schema.Struct({ current: Schema.Number, chosen: Schema.Array(Schema.Number) })
type Stage = typeof Stage.Type
const StageMessage = defineMessageUnion({ Selected: { index: Schema.Number } })
type StageMessage = typeof StageMessage.Type

test('a completed step is a button that Enter and Space press; the current and later ones are not', async () => {
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: Stage,
      container: container('steps-host'),
      init: () => ({ model: { current: 2, chosen: [] } }),
      update: (model: Stage, message: StageMessage) =>
        StageMessage.match(message, {
          Selected: ({ index }) => ({ model: { ...model, chosen: [...model.chosen, index] } }),
        }),
      view: (model: Stage, h: HtmlBuilder<StageMessage>) =>
        h.div(
          [],
          [
            Steps.view(
              {
                label: 'Checkout',
                current: model.current,
                onSelect: index => StageMessage.Selected({ index }),
                steps: [
                  { title: 'Cart' },
                  { title: 'Address' },
                  { title: 'Pay' },
                  { title: 'Done' },
                ],
              },
              h,
            ),
            h.p([h.Id('chosen')], [model.chosen.join(',')]),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.querySelectorAll('ol > li')).toHaveLength(4))
  const buttons = () => Array.from(document.querySelectorAll<HTMLElement>('ol button'))
  expect(buttons()).toHaveLength(2)
  buttons()[0]!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(byId('chosen').textContent).toBe('0'))
  buttons()[1]!.focus()
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(byId('chosen').textContent).toBe('0,1'))
  // Tab walks the two buttons and then leaves the list: nothing else holds a tab stop.
  buttons()[0]!.focus()
  await userEvent.keyboard('{Tab}')
  expect(document.activeElement).toBe(buttons()[1])
  await userEvent.keyboard('{Tab}')
  expect(buttons()).not.toContain(document.activeElement)
})
