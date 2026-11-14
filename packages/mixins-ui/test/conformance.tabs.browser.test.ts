/**
 * The APG tabs pattern, run over `Tabs` in a real browser: automatic and
 * manual activation, both reading directions and both axes, a disabled tab, a
 * closable tab's Delete, the one tab stop, and the roles, names and relations
 * Chrome reads from it (a panel named by its tab).
 */
import { Option, Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Recipes, Tabs, TabsSlots } from '../src/index.js'
import {
  checkNames,
  defineActivation,
  defineRefusal,
  defineScenarios,
  defineTabStop,
  listScenarios,
  type Adapter,
  type Direction,
  type ListSpec,
  type Mounted,
  type Orientation,
  type Scenario,
} from './conformance.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(TabsSlots)(Recipes.Tabs({}))

const LABELS = ['Overview', 'Activity', 'Billing', 'Settings', 'Team']
const DISABLED = ['Billing']

interface Setup {
  readonly labels: ReadonlyArray<string>
  readonly disabled: ReadonlyArray<string>
  /** The chosen tab, which holds focus. */
  readonly start: string
  readonly direction: Direction
  readonly orientation: Orientation
  readonly activation: 'Automatic' | 'Manual'
  readonly closable: boolean
}

const Model = Schema.Struct({
  tabs: UiTabs.Model,
  values: Schema.Array(Schema.String),
  value: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  Closed: { value: Schema.String },
})
type Message = typeof Message.Type
const Bundle = UiTabs.create()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.body.removeAttribute('dir')
})

const adapter: Adapter<Setup> = {
  name: 'Tabs',
  mount: async setup => {
    const sheet = document.createElement('style')
    sheet.dataset['test'] = ''
    sheet.textContent =
      Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
      style.css +
      '* { transition: none !important; }'
    document.head.append(sheet)
    document.body.dir = setup.direction
    const before = document.createElement('button')
    before.textContent = 'Before'
    document.body.appendChild(before)
    const container = document.createElement('div')
    container.id = 'tabs-conformance'
    document.body.appendChild(container)
    const view = (model: Model, h: HtmlBuilder<Message>) =>
      h.submodel({
        slotId: model.tabs.id,
        model: model.tabs,
        view: Bundle.view,
        viewInputs: {
          tabs: model.values,
          selectedValue: model.value,
          ariaLabel: 'Files',
          orientation: setup.orientation === 'vertical' ? 'Vertical' : 'Horizontal',
          isTabDisabled: (value: string) => setup.disabled.includes(value),
          toView: Tabs.toView<string, Message>(
            [style.mixin, Tabs.readingKeys],
            {
              h,
              ...(setup.closable ? { close: { onClose: value => Message.Closed({ value }) } } : {}),
            },
            ({ tablist, tabs, activeIndex }) =>
              h.div(
                [],
                [
                  h.div(
                    tablist,
                    tabs.map(tab =>
                      h.div(tab.item, [
                        h.button(tab.tab, [h.span([], [tab.value])]),
                        ...Option.match(tab.close, {
                          onNone: () => [],
                          onSome: close => [h.button(close, [])],
                        }),
                      ]),
                    ),
                  ),
                  ...(tabs[activeIndex] === undefined
                    ? []
                    : [h.div(tabs[activeIndex].panel, [`The ${tabs[activeIndex].value} panel`])]),
                ],
              ),
          ),
        },
        toParentMessage: message => Message.GotTabs({ message }),
      })
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        slow: false,
        init: () => ({
          model: {
            tabs: UiTabs.init({ id: 'files', activationMode: setup.activation }),
            values: setup.labels,
            value: setup.start,
          },
        }),
        update: (model: Model, message: Message): Return<Model, Message> =>
          Message.match(message, {
            GotTabs: ({ message }) => {
              const next = Bundle.update(model.tabs, message)
              return {
                model: modifyFields(model, {
                  tabs: () => next.model,
                  value: value => next.outMessage?.value ?? value,
                }),
                commands: Command.mapMessages(next.commands, message =>
                  Message.GotTabs({ message }),
                ),
              }
            },
            Closed: ({ value }) => {
              const after = Tabs.closing(model.values, model.value, value)
              return {
                model: modifyFields(model, {
                  values: () => after.tabs,
                  value: current => Option.getOrElse(after.selected, () => current),
                }),
                commands: Command.mapMessages(
                  Option.toArray(
                    Option.map(after.focus, index => UiTabs.FocusTab({ id: model.tabs.id, index })),
                  ),
                  message => Message.GotTabs({ message }),
                ),
              }
            },
          }),
        view,
      }),
    )
    const root = () => document.querySelector<HTMLElement>('[role="tablist"]')!
    const items = () => Array.from(root().querySelectorAll<HTMLElement>('[role="tab"]'))
    const labelOf = (item: HTMLElement) => item.textContent!.trim()
    await vi.waitFor(() => expect(items().length).toBe(setup.labels.length))
    items()
      .find(item => labelOf(item) === setup.start)!
      .focus()
    const mounted: Mounted = {
      dispose: () => handle.dispose(),
      items,
      current: () => {
        const active = document.activeElement
        return active instanceof HTMLElement && active.getAttribute('role') === 'tab'
          ? active
          : undefined
      },
      labelOf,
      state: () => ({
        selected: items()
          .filter(item => item.getAttribute('aria-selected') === 'true')
          .map(labelOf)
          .join(','),
        tabs: items().map(labelOf).join(','),
      }),
      root,
      entry: () => before,
    }
    return mounted
  },
}

const spec = (orientation: Orientation, activation: 'Automatic' | 'Manual'): ListSpec<Setup> => ({
  pattern: 'tabs',
  labels: LABELS,
  disabled: DISABLED,
  orientation,
  wraps: true,
  pages: true,
  typeahead: false,
  selection: activation === 'Automatic' ? 'follows' : 'explicit',
  setup: (start, direction) => ({
    labels: LABELS,
    disabled: DISABLED,
    start,
    direction,
    orientation,
    activation,
    closable: false,
  }),
})

/** The pattern's table with the mode in each name, since two modes share the same keys. */
const named = (
  mode: string,
  scenarios: ReadonlyArray<Scenario<Setup>>,
): ReadonlyArray<Scenario<Setup>> =>
  scenarios.map(scenario => ({ ...scenario, name: `${scenario.name} [${mode}]` }))

describe('keys', () => {
  for (const activation of ['Automatic', 'Manual'] as const) {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const mode = `${activation.toLowerCase()}, ${orientation}`
      defineScenarios(adapter, named(mode, listScenarios(spec(orientation, activation), 'ltr')))
      defineScenarios(adapter, named(mode, listScenarios(spec(orientation, activation), 'rtl')))
    }
  }
})

describe('closable', () => {
  const closable = (start: string, closableTabs: boolean): Setup => ({
    labels: ['One', 'Two', 'Three'],
    disabled: [],
    start,
    direction: 'ltr',
    orientation: 'horizontal',
    activation: 'Automatic',
    closable: closableTabs,
  })
  defineScenarios(adapter, [
    {
      name: 'Delete closes the chosen tab, and focus and choice go to the tab after it',
      setup: closable('Two', true),
      start: 'Two',
      keys: ['Delete'],
      focus: 'Three',
      state: { selected: 'Three', tabs: 'One,Three' },
      prevented: true,
    },
    {
      name: 'Delete on the last tab goes to the one before it',
      setup: closable('Three', true),
      start: 'Three',
      keys: ['Delete'],
      focus: 'Two',
      state: { selected: 'Two', tabs: 'One,Two' },
      prevented: true,
    },
    {
      name: 'Delete closes nothing where tabs are not closable',
      setup: closable('Two', false),
      start: 'Two',
      keys: ['Delete'],
      focus: 'Two',
      state: { selected: 'Two', tabs: 'One,Two,Three' },
    },
  ])
})

describe('activation', () => {
  const setup = (activation: 'Automatic' | 'Manual'): Setup => ({
    labels: LABELS,
    disabled: DISABLED,
    start: 'Overview',
    direction: 'ltr',
    orientation: 'horizontal',
    activation,
    closable: false,
  })
  // Manual tabs move focus first; Enter, Space and a press then choose alike.
  defineActivation(adapter, {
    name: 'activating a focused tab chooses it (manual)',
    setup: setup('Manual'),
    reach: ['ArrowRight'],
    target: 'Activity',
    state: { selected: 'Activity' },
  })
  defineActivation(adapter, {
    name: 'a press on a tab chooses it (automatic)',
    setup: setup('Automatic'),
    reach: [],
    target: 'Activity',
    by: ['click'],
    state: { selected: 'Activity' },
  })
  defineRefusal(adapter, {
    name: 'a press on a disabled tab chooses nothing',
    setup: setup('Automatic'),
    target: 'Billing',
  })
})

defineTabStop(adapter, {
  name: 'Tab enters on the chosen tab, leaves past the tablist, and Shift+Tab comes back (automatic)',
  setup: {
    labels: LABELS,
    disabled: DISABLED,
    start: 'Overview',
    direction: 'ltr',
    orientation: 'horizontal',
    activation: 'Automatic',
    closable: false,
  },
  start: 'Overview',
  move: 'ArrowRight',
  moved: 'Activity',
})

defineTabStop(adapter, {
  name: 'Tab enters on the focused tab, which manual activation has not chosen',
  setup: {
    labels: LABELS,
    disabled: DISABLED,
    start: 'Overview',
    direction: 'ltr',
    orientation: 'horizontal',
    activation: 'Manual',
    closable: false,
  },
  start: 'Overview',
  move: 'ArrowRight',
  moved: 'Activity',
})

describe('names and relationships', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`a ${orientation} tablist is named, stated and related as the APG asks, in Chrome`, async () => {
      const mounted = await adapter.mount({
        labels: LABELS,
        disabled: DISABLED,
        start: 'Activity',
        direction: 'ltr',
        orientation,
        activation: 'Automatic',
        closable: false,
      })
      try {
        await checkNames(mounted, {
          root: {
            role: 'tablist',
            name: 'Files',
            attributes: { 'aria-orientation': orientation },
            properties: { orientation },
          },
          item: { role: 'tab' },
          states: [
            {
              attribute: 'aria-selected',
              property: 'selected',
              on: m => m.items(),
              values: ['true', 'false'],
            },
            {
              attribute: 'aria-disabled',
              property: 'disabled',
              on: m => m.items().filter(item => DISABLED.includes(m.labelOf(item))),
              values: ['true'],
            },
          ],
          relationships: [
            // The chosen tab names the panel it shows, which it names back.
            {
              attribute: 'aria-controls',
              on: m => m.items().filter(item => item.getAttribute('aria-selected') === 'true'),
              targetRole: 'tabpanel',
              targetName: (m, tab) => m.labelOf(tab),
            },
            {
              attribute: 'aria-labelledby',
              on: () => Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]')),
              targetRole: 'tab',
              targetName: () => 'Activity',
            },
          ],
        })
      } finally {
        mounted.dispose()
      }
    })
  }
})
