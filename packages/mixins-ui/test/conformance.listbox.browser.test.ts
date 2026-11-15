/**
 * The APG listbox, run over `ListboxView` in a real browser: single and
 * multiple, vertical and horizontal, both reading directions, a disabled
 * option, and the roles, names and states Chrome reads from it.
 */
import { Option, Schema } from 'effect'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'
import {
  checkNames,
  defineActivation,
  defineNameSabotage,
  defineRefusal,
  defineScenarios,
  defineSelfChecks,
  listScenarios,
  press,
  settle,
  type Adapter,
  type Direction,
  type ListSpec,
  type Mounted,
  type NamesSpec,
  type Orientation,
} from './conformance.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))

const LABELS = ['Amber', 'Azure', 'Blue', 'Coral', 'Denim', 'Emerald']
const DISABLED = ['Coral']

interface Setup {
  /** The option active when the list opens, and the chosen one. */
  readonly start: string
  readonly direction: Direction
  readonly orientation: Orientation
  readonly multiple: boolean
}

const Model = Schema.Struct({
  listbox: UpstreamListbox.Model,
  chosen: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
type Message = UpstreamListbox.Message

const Single = ListboxView.create<string>()
const Multiple = ListboxView.Multi.create<string>()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const adapter: Adapter<Setup> = {
  name: 'Listbox',
  mount: async setup => {
    const sheet = document.createElement('style')
    sheet.dataset['test'] = ''
    sheet.textContent =
      Style.stylesheet(
        Layers.standard.declare,
        Layers.standard.in('reset', Defaults.reset),
        Layers.standard.in('theme', Theme.root(theme)),
      ) +
      style.css +
      ':root{--fk-knob-motion:0}'
    document.head.append(sheet)
    const container = document.createElement('div')
    container.id = 'listbox-conformance'
    document.body.appendChild(container)
    const orientation = setup.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'
    const view = (model: Model, h: HtmlBuilder<Message>) => {
      const inputs = {
        anchor: { placement: 'bottom-start' as const, gap: 4, padding: 8, portal: false },
        items: LABELS,
        isItemDisabled: (item: string) => DISABLED.includes(item),
        itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
        buttonContent: h.span([], ['Colour']),
        toView: Listbox.toView([style.mixin], { h }),
        direction: setup.direction,
      }
      return h.div(
        [],
        [
          setup.multiple
            ? Multiple.view(model.listbox, { ...inputs, selectedValues: model.chosen }, h)
            : Single.view(
                model.listbox,
                { ...inputs, maybeSelectedValue: Option.fromNullishOr(model.chosen[0]) },
                h,
              ),
        ],
      )
    }
    let chosenNow: ReadonlyArray<string> = [setup.start]
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        slow: false,
        init: () => ({
          model: {
            listbox: setup.multiple
              ? UpstreamListbox.Multi.init({ id: 'lb', orientation })
              : UpstreamListbox.init({ id: 'lb', orientation }),
            chosen: [setup.start],
          },
        }),
        update: (model: Model, message: Message) => {
          const next = setup.multiple
            ? Multiple.update(model.listbox, message)
            : Single.update(model.listbox, message)
          const value = next.outMessage?.value
          const chosen =
            value === undefined
              ? model.chosen
              : setup.multiple
                ? model.chosen.includes(value)
                  ? model.chosen.filter(each => each !== value)
                  : [...model.chosen, value]
                : [value]
          chosenNow = chosen
          return { model: { listbox: next.model, chosen }, commands: next.commands ?? [] }
        },
        view,
      }),
    )
    const mounted: Mounted = {
      dispose: () => handle.dispose(),
      items: () =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')),
      current: () => {
        const id = document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant')
        const found = id === null || id === undefined ? null : document.getElementById(id)
        return found === null ? undefined : found
      },
      labelOf: item => item.textContent!.trim(),
      state: () => ({
        selected: [...chosenNow].sort().join(','),
        open: String(document.querySelector('[role="listbox"]') !== null),
      }),
      root: () => document.querySelector<HTMLElement>('[role="listbox"]')!,
    }
    // Opened from the button with the key the pattern gives it: the chosen option is then the active one.
    await vi.waitFor(() => expect(document.getElementById('lb-button')).not.toBeNull())
    document.getElementById('lb-button')!.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    return mounted
  },
}

const spec = (orientation: Orientation, multiple: boolean): ListSpec<Setup> => ({
  pattern: 'listbox',
  labels: LABELS,
  disabled: DISABLED,
  orientation,
  wraps: true,
  pages: true,
  typeahead: true,
  selection: 'explicit',
  setup: (start, direction) => ({ start, direction, orientation, multiple }),
})

describe('keys', () => {
  defineScenarios(adapter, listScenarios(spec('vertical', false), 'ltr'))
  // Vertical arrows are not mirrored.
  defineScenarios(adapter, listScenarios(spec('vertical', false), 'rtl'))
  defineScenarios(adapter, listScenarios(spec('horizontal', false), 'ltr'))
  defineScenarios(adapter, listScenarios(spec('horizontal', false), 'rtl'))
})

describe('multiple', () => {
  defineScenarios(adapter, listScenarios(spec('vertical', true), 'ltr'))
  defineScenarios(adapter, listScenarios(spec('horizontal', true), 'rtl'))
})

describe('activation', () => {
  const setup = (multiple: boolean): Setup => ({
    start: 'Amber',
    direction: 'ltr',
    orientation: 'vertical',
    multiple,
  })
  defineActivation(adapter, {
    name: 'activating an option chooses it and closes the list',
    setup: setup(false),
    reach: ['ArrowDown'],
    target: 'Azure',
    state: { selected: 'Azure', open: 'false' },
  })
  defineActivation(adapter, {
    name: 'activating an option of a multiple list toggles it and keeps the list open',
    setup: setup(true),
    reach: ['ArrowDown'],
    target: 'Azure',
    state: { selected: 'Amber,Azure', open: 'true' },
  })
  defineRefusal(adapter, {
    name: 'a press on a disabled option chooses nothing',
    setup: setup(false),
    target: 'Coral',
  })
})

const namesOf = (multiple: boolean, orientation: Orientation): NamesSpec => {
  const button = () => document.getElementById('lb-button')!
  return {
    root: {
      role: 'listbox',
      // The listbox is named by the button that opened it.
      name: 'Colour',
      attributes: {
        'aria-orientation': orientation,
        'aria-multiselectable': multiple ? 'true' : null,
      },
      properties: { orientation, ...(multiple ? { multiselectable: 'true' } : {}) },
    },
    item: { role: 'option' },
    states: [
      {
        attribute: 'aria-selected',
        property: 'selected',
        on: m => m.items(),
        values: ['true', 'false'],
      },
      {
        attribute: 'aria-expanded',
        property: 'expanded',
        on: () => [button()],
        values: ['true'],
      },
      {
        attribute: 'aria-disabled',
        property: 'disabled',
        on: m => m.items().filter(item => DISABLED.includes(m.labelOf(item))),
        values: ['true'],
      },
    ],
    relationships: [
      { attribute: 'aria-controls', on: () => [button()], targetRole: 'listbox' },
      {
        attribute: 'aria-labelledby',
        on: m => [m.root()],
        targetRole: 'button',
        targetName: () => 'Colour',
      },
      {
        attribute: 'aria-activedescendant',
        on: m => [m.root()],
        targetRole: 'option',
        targetName: () => 'Amber',
      },
    ],
  }
}

describe('names and relationships', () => {
  const names = (multiple: boolean, orientation: Orientation) =>
    test(`a ${multiple ? 'multiple' : 'single'} ${orientation} listbox is named, stated and related as the APG asks, in Chrome`, async () => {
      const mounted = await adapter.mount({
        start: 'Amber',
        direction: 'ltr',
        orientation,
        multiple,
      })
      try {
        await checkNames(mounted, namesOf(multiple, orientation))
      } finally {
        mounted.dispose()
      }
    })
  names(false, 'vertical')
  names(false, 'horizontal')
  names(true, 'vertical')
})

describe('the suite can fail', () => {
  defineSelfChecks(adapter, [
    ...listScenarios(spec('vertical', false), 'ltr'),
    ...listScenarios(spec('horizontal', false), 'rtl'),
  ])
  defineNameSabotage(
    adapter,
    { start: 'Amber', direction: 'ltr', orientation: 'vertical', multiple: true },
    namesOf(true, 'vertical'),
  )
})

test('Escape closes the list and returns focus to the button', async () => {
  const mounted = await adapter.mount({
    start: 'Amber',
    direction: 'ltr',
    orientation: 'vertical',
    multiple: false,
  })
  try {
    await press('Escape')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    await settle()
    expect(document.activeElement).toBe(document.getElementById('lb-button'))
  } finally {
    mounted.dispose()
  }
})
