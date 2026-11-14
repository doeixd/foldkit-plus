/// <reference types="@vitest/browser-playwright" />
/**
 * A custom property set on the region around a popup's trigger reaches its
 * panel when the anchor portals it out of that region: the Listbox, Combobox
 * and Menu opened for real with `portal: true`, whose panels upstream moves to
 * the document, read the region's property there. A panel that sets the
 * property itself keeps its own value.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import * as UpstreamMenu from '@foldkit/ui/menu'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Anchor, ComboboxView, ListboxView, MenuView } from '../src/index.js'

const Listboxes = ListboxView.create<string>()
const Comboboxes = ComboboxView.create<string>()
const Menus = MenuView.create<string>()
const items = ['Hourly', 'Daily']

const Model = Schema.Struct({
  listbox: UpstreamListbox.Model,
  combobox: UpstreamCombobox.Model,
  menu: UpstreamMenu.Model,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotListbox: { message: UpstreamListbox.Message },
  GotCombobox: { message: UpstreamCombobox.Message },
  GotMenu: { message: UpstreamMenu.Message },
})
type Message = typeof Message.Type
type H = HtmlBuilder<Message>

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.getElementById('foldkit-portal-root')?.remove()
  document.documentElement.style.removeProperty('--shared')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const anchor = { placement: 'bottom-start', gap: 4, padding: 8, portal: true } as const

const view = (model: Model, h: H) =>
  h.div(
    [h.Id('region'), h.Style({ '--region': 'set', '--own': 'region', '--shared': 'x' })],
    [
      h.submodel({
        slotId: model.listbox.id,
        model: model.listbox,
        view: Listboxes.view,
        viewInputs: {
          anchor,
          items,
          maybeSelectedValue: Option.none(),
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          buttonContent: h.span([], ['Frequency']),
          itemsAttributes: [],
        },
        toParentMessage: message => Message.GotListbox({ message }),
      }),
      h.submodel({
        slotId: model.combobox.id,
        model: model.combobox,
        view: Comboboxes.view,
        viewInputs: {
          anchor,
          items,
          restingInputValue: '',
          maybeSelectedValue: Option.none(),
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          itemToValue: (item: string) => item,
          itemToDisplayText: (item: string) => item,
          ariaLabel: 'Period',
        },
        toParentMessage: message => Message.GotCombobox({ message }),
      }),
      h.submodel({
        slotId: model.menu.id,
        model: model.menu,
        view: Menus.view,
        viewInputs: {
          anchor,
          items,
          itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
          buttonContent: h.span([], ['Actions']),
        },
        toParentMessage: message => Message.GotMenu({ message }),
      }),
    ],
  )

const mount = () => {
  document.documentElement.style.setProperty('--shared', 'x')
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = '#frequency-items, #period-items, #actions-items { --own: panel }'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popup-region'
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
        }),
      view,
    }),
  )
}

const property = (element: HTMLElement, name: string) =>
  getComputedStyle(element).getPropertyValue(name).trim()

test.each([
  { popup: 'listbox', trigger: 'frequency-button', panel: 'frequency-items', typed: '' },
  { popup: 'combobox', trigger: 'period-input', panel: 'period-items', typed: 'D' },
  { popup: 'menu', trigger: 'actions-button', panel: 'actions-items', typed: '' },
])(
  'the $popup panel, portaled out of its region, still reads the region',
  async ({ trigger, panel, typed }) => {
    mount()
    const opener = await vi.waitFor(() => {
      const found = document.getElementById(trigger)
      expect(found).not.toBeNull()
      return found!
    })
    await (typed === '' ? userEvent.click(opener) : userEvent.type(opener, typed))
    const items = await vi.waitFor(() => {
      const found = document.getElementById(panel)
      expect(found).not.toBeNull()
      return found!
    })
    expect(items.closest('#region')).toBeNull()
    await vi.waitFor(() => expect(property(items, '--region')).toBe('set'))
    // The panel sets `--own` itself, so the region's value does not replace it.
    expect(property(items, '--own')).toBe('panel')
    // Only what differs from the document is written: the theme's tokens stay inherited.
    expect(items.style.getPropertyValue('--shared')).toBe('')
  },
)

test('the Anchor Mount, portaling its panel, carries the region too', async () => {
  document.documentElement.style.setProperty('--shared', 'x')
  document.body.innerHTML = `<div id="region" style="--region: set; --shared: x">
    <button id="trigger">open</button><div id="panel">panel</div></div>`
  const panel = document.getElementById('panel')!
  const fiber = Effect.runFork(
    Stream.runDrain(
      Anchor.Anchor({
        buttonId: 'trigger',
        anchor: { placement: 'bottom-start', portal: true },
      }).f(panel, Mount.liveViewStateChanges) as Stream.Stream<never>,
    ),
  )
  try {
    await vi.waitFor(() => expect(panel.closest('#region')).toBeNull())
    await vi.waitFor(() => expect(property(panel, '--region')).toBe('set'))
    expect(panel.style.getPropertyValue('--shared')).toBe('')
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})
