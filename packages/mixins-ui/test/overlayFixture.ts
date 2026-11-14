/**
 * One page that stacks the shipped overlays on the real runtime, for the
 * overlay lifecycle tests: two Dialogs (the second opened from the first), a
 * Menu and a Popover inside the first, and plain buttons beside them.
 *
 * Every id the tests read is spelled out in `ids`. The page's own buttons
 * send Messages; the Dialogs, Menu and Popover are the shipped components.
 */
import { Effect, Option, Schema } from 'effect'
import { Dialog as UiDialog, Popover as UiPopover } from '@foldkit/ui'
import { mapMessages } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { defineMessageUnion } from 'foldkit/message'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { expect, vi } from 'vitest'
import {
  Dialog,
  DialogSlots,
  Menu,
  MenuSlots,
  Popover,
  PopoverSlots,
  Recipes,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard

export const ids = {
  openOuter: 'open-outer',
  openInner: 'open-inner',
  outsideButton: 'outside-button',
  fallbackButton: 'fallback-button',
  closeOuter: 'close-outer',
  closeInner: 'close-inner',
  closeAndFocus: 'close-and-focus',
  removeTrigger: 'remove-trigger',
  outerPanel: 'outer-panel',
  innerPanel: 'inner-panel',
  outerDialog: 'outer',
  innerDialog: 'inner',
  menuButton: 'menu-button',
  menuPanel: 'menu-items',
  popoverButton: 'pop-button',
  popoverPanel: 'pop-panel',
  popoverInside: 'pop-inside',
  dialogText: 'dialog-text',
} as const

const ROWS: ReadonlyArray<Menu.Row> = [{ label: 'Rename' }, { label: 'Open the second dialog' }]
const OPEN_SECOND = 'Open the second dialog'

export const Model = Schema.Struct({
  outer: UiDialog.Model,
  inner: UiDialog.Model,
  menu: Menu.Model,
  popover: UiPopover.Model,
  triggerPresent: Schema.Boolean,
})
export type Model = typeof Model.Type

export type Message =
  | { readonly _tag: 'Outer'; readonly message: UiDialog.Message }
  | { readonly _tag: 'Inner'; readonly message: UiDialog.Message }
  | { readonly _tag: 'Menu'; readonly message: Menu.Message }
  | { readonly _tag: 'Popover'; readonly message: UiPopover.Message }
  | { readonly _tag: 'OpenOuter' }
  | { readonly _tag: 'OpenInner' }
  | { readonly _tag: 'CloseOuter' }
  | { readonly _tag: 'CloseInner' }
  | { readonly _tag: 'RemoveTrigger' }
  | { readonly _tag: 'CloseAndFocusOutside' }
  | { readonly _tag: 'Settled' }

const Settled = defineMessageUnion({ Settled: {} })

/** Focuses the page's own button, as an action that closes a Dialog and moves on would. */
const FocusOutside = Command.define('Overlay.FocusOutside', {
  messages: [Settled.Settled],
  execute: Dom.focus(`#${ids.outsideButton}`).pipe(Effect.ignore, Effect.as(Settled.Settled())),
})

export interface Options {
  /** Animated Dialogs leave over `leaveMs`, so a test can act during the exit. */
  readonly animated?: boolean
  readonly leaveMs?: number
  /** The outer Dialog names `ids.fallbackButton` for focus its opener cannot take. */
  readonly focusFallback?: boolean
}

/** Test CSS after the recipes: unlayered, so it beats them. */
const extra = (options: Options): string =>
  options.animated === true
    ? `#${ids.outerPanel}, #${ids.innerPanel}, #${ids.menuPanel} { transition-duration: ${options.leaveMs ?? 600}ms !important; transition-property: opacity !important; }
#${ids.outerPanel}[data-closed], #${ids.innerPanel}[data-closed], #${ids.menuPanel}[data-closed] { opacity: 0; }`
    : ''

export const mount = (options: Options = {}) => {
  const dialogStyle = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
  const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
  const popoverStyle = Style.forSlots(PopoverSlots)(Recipes.Popover({}))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    dialogStyle.css +
    menuStyle.css +
    popoverStyle.css +
    extra(options)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'overlay-lifecycle'
  document.body.appendChild(container)
  const isAnimated = options.animated === true

  const dialogOf =
    (id: string, panel: string, title: string, close: string, content: boolean) =>
    (
      model: UiDialog.Model,
      h: HtmlBuilder<Message>,
      toParent: (message: UiDialog.Message) => Message,
      closeMessage: Message,
      menuAndPopover: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>,
    ) =>
      h.submodel({
        slotId: id,
        model,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView(
            [dialogStyle.mixin],
            { h, isLeaving: Dialog.isLeaving(model) },
            dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(
                        [...dialog.panel, h.Id(panel)],
                        [
                          h.h2(dialog.title, [title]),
                          h.p([h.Id(ids.dialogText), h.Tabindex(-1)], ['Some words.']),
                          h.button([h.Id(close), h.OnClick(closeMessage)], ['Close']),
                          ...(content ? menuAndPopover(h) : []),
                        ],
                      ),
                    ]
                  : [],
              ),
          ),
        },
        toParentMessage: toParent,
      })

  const view = (model: Model, h: HtmlBuilder<Message>) => {
    const outer = dialogOf(ids.outerDialog, ids.outerPanel, 'Outer', ids.closeOuter, true)
    const inner = dialogOf(ids.innerDialog, ids.innerPanel, 'Inner', ids.closeInner, false)
    return h.div(
      [],
      [
        ...(model.triggerPresent
          ? [
              h.button(
                [h.Key(ids.openOuter), h.Id(ids.openOuter), h.OnClick({ _tag: 'OpenOuter' })],
                ['Open outer'],
              ),
            ]
          : []),
        h.button([h.Key(ids.outsideButton), h.Id(ids.outsideButton)], ['Outside']),
        h.button([h.Key(ids.fallbackButton), h.Id(ids.fallbackButton)], ['Fallback']),
        outer(
          model.outer,
          h,
          (message): Message => ({ _tag: 'Outer', message }),
          { _tag: 'CloseOuter' },
          inside => [
            inside.button(
              [inside.Id(ids.openInner), inside.OnClick({ _tag: 'OpenInner' })],
              ['Open inner'],
            ),
            inside.button(
              [inside.Id(ids.removeTrigger), inside.OnClick({ _tag: 'RemoveTrigger' })],
              ['Remove the trigger'],
            ),
            inside.button(
              [inside.Id(ids.closeAndFocus), inside.OnClick({ _tag: 'CloseAndFocusOutside' })],
              ['Close and move on'],
            ),
            Menu.view(
              {
                model: model.menu,
                rows: ROWS,
                buttonContent: inside.span([], ['Menu']),
                onMessage: (message): Message => ({ _tag: 'Menu', message }),
                opensAt: 'button',
                mixins: [menuStyle.mixin],
              },
              inside,
            ),
            inside.submodel({
              slotId: 'pop',
              model: model.popover,
              view: UiPopover.view,
              viewInputs: {
                anchor: Popover.anchor(),
                toView: Popover.toView([popoverStyle.mixin], { h: inside }, popover =>
                  inside.div(
                    [],
                    [
                      inside.button(popover.button, ['Popover']),
                      ...(popover.isVisible
                        ? [
                            inside.div(popover.backdrop, []),
                            inside.div(popover.layer, [
                              inside.div(popover.panel, [
                                inside.button([inside.Id(ids.popoverInside)], ['In the popover']),
                              ]),
                            ]),
                          ]
                        : []),
                    ],
                  ),
                ),
              },
              toParentMessage: (message: UiPopover.Message): Message => ({
                _tag: 'Popover',
                message,
              }),
            }),
          ],
        ),
        inner(
          model.inner,
          h,
          (message): Message => ({ _tag: 'Inner', message }),
          { _tag: 'CloseInner' },
          () => [],
        ),
      ],
    )
  }

  const dialogInit = (id: string) => UiDialog.init({ id, isAnimated })

  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      slow: false,
      init: () => ({
        model: {
          outer: dialogInit(ids.outerDialog),
          inner: dialogInit(ids.innerDialog),
          menu: Menu.init('menu', ROWS, { isAnimated }),
          popover: UiPopover.init({ id: 'pop' }),
          triggerPresent: true,
        },
      }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Outer': {
            const next = Dialog.update(
              model.outer,
              message.message,
              options.focusFallback === true ? { focusFallback: ids.fallbackButton } : {},
            )
            return {
              model: { ...model, outer: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Outer',
                message: inner,
              })),
            }
          }
          case 'Inner': {
            const next = UiDialog.update(model.inner, message.message)
            return {
              model: { ...model, inner: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Inner',
                message: inner,
              })),
            }
          }
          case 'Menu': {
            const next = Menu.update(model.menu, message.message)
            const chose = Option.exists(
              Option.fromNullishOr(next.outMessage),
              out => out.value === OPEN_SECOND,
            )
            const menuCommands = mapMessages(next.commands, (inner): Message => ({
              _tag: 'Menu',
              message: inner,
            }))
            if (!chose) return { model: { ...model, menu: next.model }, commands: menuCommands }
            const opened = UiDialog.open(model.inner)
            return {
              model: { ...model, menu: next.model, inner: opened.model },
              commands: [
                ...menuCommands,
                ...mapMessages(opened.commands, (inner): Message => ({
                  _tag: 'Inner',
                  message: inner,
                })),
              ],
            }
          }
          case 'Popover': {
            const next = UiPopover.update(model.popover, message.message)
            return {
              model: { ...model, popover: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Popover',
                message: inner,
              })),
            }
          }
          case 'OpenOuter': {
            const next = Dialog.open(model.outer)
            return {
              model: { ...model, outer: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Outer',
                message: inner,
              })),
            }
          }
          case 'OpenInner': {
            const next = UiDialog.open(model.inner)
            return {
              model: { ...model, inner: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Inner',
                message: inner,
              })),
            }
          }
          case 'CloseOuter': {
            const next = UiDialog.close(model.outer)
            return {
              model: { ...model, outer: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Outer',
                message: inner,
              })),
            }
          }
          case 'CloseInner': {
            const next = UiDialog.close(model.inner)
            return {
              model: { ...model, inner: next.model },
              commands: mapMessages(next.commands, (inner): Message => ({
                _tag: 'Inner',
                message: inner,
              })),
            }
          }
          case 'CloseAndFocusOutside': {
            const next = UiDialog.close(model.outer)
            return {
              model: { ...model, outer: next.model },
              commands: [
                ...mapMessages(next.commands, (inner): Message => ({
                  _tag: 'Outer',
                  message: inner,
                })),
                Command.mapMessage(FocusOutside(), (): Message => ({ _tag: 'Settled' })),
              ],
            }
          }
          case 'Settled':
            return { model }
          case 'RemoveTrigger':
            return { model: { ...model, triggerPresent: false } }
        }
      },
      view,
    }),
  )
  return handle
}

export const byId = (id: string) => document.getElementById(id)
/** Whether the Dialog element of `id` is open. */
export const isOpen = (id: string): boolean => {
  const element = byId(id)
  return element instanceof HTMLDialogElement && element.open
}
export const active = () => document.activeElement?.id || document.activeElement?.tagName
export const present = async (id: string) =>
  vi.waitFor(() => {
    const found = byId(id)
    expect(found).not.toBeNull()
    return found!
  })
export const gone = (id: string) => vi.waitFor(() => expect(byId(id)).toBeNull(), { timeout: 5000 })
/** Whether the element, or an ancestor, is `inert`. */
export const isInert = (id: string): boolean => byId(id)?.closest('[inert]') !== null
export const scrollLocked = (): boolean => document.documentElement.style.overflow === 'hidden'

export const cleanup = () => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
}
