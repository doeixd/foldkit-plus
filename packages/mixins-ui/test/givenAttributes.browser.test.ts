/**
 * The attributes an application gives a popup's parts (`itemsAttributes`,
 * `buttonAttributes`, `inputAttributes`), bound in the application's own view
 * with `childAttributes` as their type asks, reach the drawn part once: the
 * Listbox, Combobox and Menu open, their parts carry the given attribute, and
 * the given handler sends the application's Message (#374).
 */
import { Option, Schema } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import * as UpstreamMenu from '@foldkit/ui/menu'
import * as Command from 'foldkit/command'
import { type ChildAttribute, type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ComboboxView, ListboxView, MenuView } from '../src/index.js'

const Listboxes = ListboxView.create<string>()
const Comboboxes = ComboboxView.create<string>()
const Menus = MenuView.create<string>()
const items = ['Hourly', 'Daily']

const Model = Schema.Struct({
  listbox: UpstreamListbox.Model,
  combobox: UpstreamCombobox.Model,
  menu: UpstreamMenu.Model,
  pressed: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotListbox: { message: UpstreamListbox.Message },
  GotCombobox: { message: UpstreamCombobox.Message },
  GotMenu: { message: UpstreamMenu.Message },
  Pressed: { part: Schema.String },
})
type Message = typeof Message.Type
type H = HtmlBuilder<Message>

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

/** What the application gives a part: a tab stop, a mark and a handler of its own. */
const given = (h: H, part: string): ReadonlyArray<ChildAttribute> =>
  childAttributes([
    h.Tabindex(0),
    h.DataAttribute('given', part),
    h.OnDoubleClick(Message.Pressed({ part })),
  ])

const view = (model: Model, h: H): Html =>
  h.div(
    [],
    [
      h.submodel({
        slotId: model.listbox.id,
        model: model.listbox,
        view: Listboxes.view,
        viewInputs: {
          anchor: { portal: false },
          items,
          maybeSelectedValue: Option.none(),
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          buttonContent: h.span([], ['Frequency']),
          buttonAttributes: given(h, 'listbox-button'),
          itemsAttributes: given(h, 'listbox-items'),
        },
        toParentMessage: message => Message.GotListbox({ message }),
      }),
      h.submodel({
        slotId: model.combobox.id,
        model: model.combobox,
        view: Comboboxes.view,
        viewInputs: {
          anchor: { portal: false },
          items,
          restingInputValue: '',
          maybeSelectedValue: Option.none(),
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          itemToValue: (item: string) => item,
          itemToDisplayText: (item: string) => item,
          ariaLabel: 'Period',
          inputAttributes: given(h, 'combobox-input'),
          itemsAttributes: given(h, 'combobox-items'),
        },
        toParentMessage: message => Message.GotCombobox({ message }),
      }),
      h.submodel({
        slotId: model.menu.id,
        model: model.menu,
        view: Menus.view,
        viewInputs: {
          anchor: { portal: false },
          items,
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          buttonContent: h.span([], ['Actions']),
          buttonAttributes: given(h, 'menu-button'),
          itemsAttributes: given(h, 'menu-items'),
        },
        toParentMessage: message => Message.GotMenu({ message }),
      }),
      h.p([h.AriaLabel('pressed')], [model.pressed.join(' ')]),
    ],
  )

const mount = () => {
  const container = document.createElement('div')
  container.id = 'given-attributes'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          listbox: UpstreamListbox.init({ id: 'frequency' }),
          combobox: UpstreamCombobox.init({ id: 'period' }),
          menu: UpstreamMenu.init({ id: 'actions' }),
          pressed: [],
        },
      }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          GotListbox: ({ message }) => {
            const next = Listboxes.update(model.listbox, message)
            return {
              model: modifyFields(model, { listbox: () => next.model }),
              commands: Command.mapMessages(next.commands ?? [], message =>
                Message.GotListbox({ message }),
              ),
            }
          },
          GotCombobox: ({ message }) => {
            const next = Comboboxes.update(model.combobox, message)
            return {
              model: modifyFields(model, { combobox: () => next.model }),
              commands: Command.mapMessages(next.commands ?? [], message =>
                Message.GotCombobox({ message }),
              ),
            }
          },
          GotMenu: ({ message }) => {
            const next = Menus.update(model.menu, message)
            return {
              model: modifyFields(model, { menu: () => next.model }),
              commands: Command.mapMessages(next.commands ?? [], message =>
                Message.GotMenu({ message }),
              ),
            }
          },
          Pressed: ({ part }) => ({
            model: modifyFields(model, { pressed: () => [...model.pressed, part] }),
          }),
        }),
      view,
    }),
  )
}

const part = (name: string) =>
  vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-given="${name}"]`)
    expect(found).not.toBeNull()
    return found!
  })

const pressed = () => document.querySelector('[aria-label="pressed"]')!.textContent

const doubleClick = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

test.each([
  { popup: 'listbox', trigger: 'listbox-button', panel: 'listbox-items', typed: '' },
  { popup: 'combobox', trigger: 'combobox-input', panel: 'combobox-items', typed: 'D' },
  { popup: 'menu', trigger: 'menu-button', panel: 'menu-items', typed: '' },
])('the $popup opens with the attributes given its parts', async ({ trigger, panel, typed }) => {
  mount()
  const opener = await part(trigger)
  expect(opener.tabIndex).toBe(0)
  doubleClick(opener)
  await vi.waitFor(() => expect(pressed()).toBe(trigger))
  await (typed === '' ? userEvent.click(opener) : userEvent.type(opener, typed))
  const items = await part(panel)
  // The given tab stop comes after the panel's own `-1`, so it wins.
  expect(items.tabIndex).toBe(0)
  doubleClick(items)
  await vi.waitFor(() => expect(pressed()).toBe(`${trigger} ${panel}`))
})
