/**
 * Every route drawn inert, closed and with its overlays open: every element
 * the page draws is in a Slot, so a Style can reach it, and every theme token
 * the drawn Styles read is in the stylesheet.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { Command, Mount, click, selector } from 'foldkit/scene'
import {
  Calendar as UiCalendar,
  Combobox,
  DatePicker,
  Dialog,
  Listbox,
  Menu,
  Popover,
} from '@foldkit/ui'
import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, Message, type Model, update } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { Message as UiMessage } from '../src/ui/message.js'
import { drawn, modelForRoute } from './helpers.js'

/** The Model after `messages`, their Commands left unrun: a state drawn, not a flow tested. */
const after = (route: AppRoute, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((model, message) => update(model, message).model, modelForRoute(route))

const ui = (message: UiMessage): Message => Message.GotUiMessage({ message })

/** The Combobox page's comboboxes each attach two Mounts when drawn. */
const comboboxMounts = [
  ...Array.from({ length: 5 }, () =>
    Mount.resolve(
      Combobox.AttachComboboxPreventBlur,
      Combobox.Message.CompletedAttachComboboxPreventBlur(),
    ),
  ),
  Mount.resolve(
    Combobox.AttachComboboxSelectOnFocus,
    Combobox.Message.CompletedAttachComboboxSelectOnFocus(),
  ),
]

/** An open dialog acquires its focus trap and scroll lock through a Mount. */
const dialogMount = Mount.resolve(
  Dialog.AcquireResources,
  Dialog.Message.SucceededAcquireResources(),
)

const closedRoutes: ReadonlyArray<AppRoute> = [
  AppRoute.Home(),
  AppRoute.Animation(),
  AppRoute.Button(),
  AppRoute.Calendar(),
  AppRoute.Checkbox(),
  AppRoute.DatePicker(),
  AppRoute.Dialog(),
  AppRoute.Disclosure(),
  AppRoute.DragAndDrop(),
  AppRoute.Fieldset(),
  AppRoute.FileDrop(),
  AppRoute.HoverIntent(),
  AppRoute.Input(),
  AppRoute.Listbox(),
  AppRoute.Menu(),
  AppRoute.Meter(),
  AppRoute.Popover(),
  AppRoute.Progress(),
  AppRoute.RadioGroup(),
  AppRoute.Select(),
  AppRoute.Slider(),
  AppRoute.Switch(),
  AppRoute.Tabs(),
  AppRoute.Textarea(),
  AppRoute.Toast(),
  AppRoute.Tooltip(),
  AppRoute.VirtualList(),
  AppRoute.NotFound({ path: '/missing' }),
]

const trees: ReadonlyMap<string, Html> = new Map<string, Html>([
  ...closedRoutes.map(route => [route._tag, drawn(modelForRoute(route))] as const),
  ['Combobox', drawn(modelForRoute(AppRoute.Combobox()), ...comboboxMounts)],
  [
    'open menu',
    drawn(
      modelForRoute(AppRoute.Menu()),
      click(selector(`#${Menu.buttonId('menu-basic-demo')}`)),
      Command.resolve(Menu.FocusItems, Menu.Message.CompletedFocusItems()),
      Mount.resolve(Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()),
      Mount.resolve(Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()),
    ),
  ],
  [
    'open grouped listbox',
    drawn(
      modelForRoute(AppRoute.Listbox()),
      click(selector(`#${Listbox.buttonId('listbox-grouped-demo')}`)),
      Command.resolve(Listbox.FocusItems, Listbox.Message.CompletedFocusItems()),
      Mount.resolve(Listbox.AnchorListbox, Listbox.Message.CompletedAnchorListbox()),
      Mount.resolve(
        Listbox.PortalListboxBackdrop,
        Listbox.Message.CompletedPortalListboxBackdrop(),
      ),
    ),
  ],
  [
    'open popover',
    drawn(
      modelForRoute(AppRoute.Popover()),
      click(selector(`#${Popover.buttonId('popover-basic-demo')}`)),
      Mount.resolve(Popover.AnchorPopover, Popover.Message.CompletedAnchorPopover()),
      Mount.resolve(
        Popover.PortalPopoverBackdrop,
        Popover.Message.CompletedPortalPopoverBackdrop(),
      ),
    ),
  ],
  [
    'open date picker',
    drawn(
      modelForRoute(AppRoute.DatePicker()),
      click(selector(`#${DatePicker.triggerId('date-picker-basic-demo')}`)),
      Mount.resolve(Popover.AnchorPopover, Popover.Message.CompletedAnchorPopover()),
      Mount.resolve(
        Popover.PortalPopoverBackdrop,
        Popover.Message.CompletedPortalPopoverBackdrop(),
      ),
    ),
  ],
  [
    'calendar months',
    drawn(
      modelForRoute(AppRoute.Calendar()),
      click(selector('#calendar-basic-demo-heading')),
      Command.resolve(UiCalendar.FocusGrid, UiCalendar.Message.CompletedFocusGrid()),
    ),
  ],
  ['open dialog', drawn(after(AppRoute.Dialog(), ui(UiMessage.ClickedOpenDialog())), dialogMount)],
  [
    'open settings and confirmation',
    drawn(
      after(
        AppRoute.Dialog(),
        ui(UiMessage.ClickedOpenProjectSettings()),
        ui(UiMessage.ClickedDeleteProject()),
      ),
      dialogMount,
      dialogMount,
    ),
  ],
  [
    'open toasts',
    drawn(
      after(
        AppRoute.Toast(),
        ui(UiMessage.ClickedShowInfoToast()),
        ui(UiMessage.ClickedShowErrorToast()),
      ),
    ),
  ],
  [
    'open mobile menu',
    drawn(after(AppRoute.Button(), Message.ClickedOpenMobileMenu()), dialogMount),
  ],
])

/**
 * What `@foldkit/ui` draws itself and takes no attributes for, so no Slot can
 * reach it: an item, group or heading of a Menu, Listbox or Combobox, which
 * take only a class name and are styled from their container's Slot; the
 * Toast region and its entries; the grid a Disclosure or Animation animates
 * the height of, and the element inside it; the Date Picker's wrapper around
 * its trigger and panel; and an icon's drawing.
 */
const COMPONENT_ROLES = new Set([
  'menuitem',
  'option',
  'group',
  'presentation',
  'separator',
  'region',
  'status',
  'alert',
])

const isHeightGrid = (node: InertNode): boolean =>
  Inert.style(node)['grid-template-rows'] !== undefined

const slotOf = (node: InertNode): unknown => Inert.value(node, 'data-fk-slot')

const isComponentOwned = (node: InertNode, parent: Option.Option<InertNode>): boolean =>
  node.sel === 'path' ||
  COMPONENT_ROLES.has(String(Inert.value(node, 'role'))) ||
  isHeightGrid(node) ||
  Option.exists(parent, above => isHeightGrid(above) || slotOf(above) === 'picker')

const isSlotted = (node: InertNode): boolean => slotOf(node) !== undefined

/** Every element no Slot drew and `@foldkit/ui` does not own, by tag and role. */
const unslotted = (root: Html): ReadonlyArray<string> => {
  const found: Array<string> = []
  const walk = (node: InertNode, parent: Option.Option<InertNode>): void => {
    if (node.sel === undefined) return
    if (!isSlotted(node) && !isComponentOwned(node, parent)) {
      found.push(
        `${node.sel}[role=${String(Inert.value(node, 'role'))}] "${Inert.text(node).slice(0, 40)}"`,
      )
    }
    Inert.children(node).forEach(child => walk(child, Option.some(node)))
  }
  if (root !== null) walk(root, Option.none())
  return found
}

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

const treeNamed = (name: string): Html => {
  const tree = trees.get(name)
  if (tree === undefined) throw new Error(`no tree named ${name}`)
  return tree
}

/** What each open state draws only while open, so its Slot check is not of a closed page. */
const opened: ReadonlyArray<readonly [name: string, role: string]> = [
  ['open menu', 'menu'],
  ['open grouped listbox', 'listbox'],
  ['open date picker', 'grid'],
  ['open toasts', 'alert'],
]

const openedByLabel: ReadonlyArray<readonly [name: string, label: string]> = [
  ['open popover', 'Analytics'],
  ['calendar months', 'Jan'],
  ['open dialog', 'Confirm Action'],
  ['open settings and confirmation', 'Delete project?'],
  ['open mobile menu', 'Close menu'],
]

describe('the pages', () => {
  test.each(opened)('%s draws its %s', (name, role) => {
    expect(Inert.byRole(treeNamed(name), role)).not.toEqual([])
  })

  test.each(openedByLabel)('%s draws %s', (name, label) => {
    expect(Inert.byLabel(treeNamed(name), label)).not.toEqual([])
  })

  test.each([...trees])('%s draws every element through a Slot', (_name, tree) => {
    expect(unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      [...trees.values()].flatMap(tree =>
        [...cssOf(Inert.all(tree)).matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
