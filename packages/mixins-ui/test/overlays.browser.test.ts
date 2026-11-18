/**
 * The overlays on a real page, placed as Bundles: a press on the backdrop
 * and Escape dismiss a Dialog, a Sheet and a Popover; an alert dialog
 * (`dismissible: false`) ignores both and closes from its answer; and each
 * closes by animating, its panel kept drawn and marked `data-leave` until the
 * exit has run, as it was drawn in. Panels carry a shadow.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiPopover from '@foldkit/ui/popover'
import { Bundle } from 'foldkit-bundle'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Bundles,
  Dialog,
  DialogSlots,
  Popover,
  PopoverSlots,
  Recipes,
  Sheet,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const dialogStyle = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
const sheetStyle = Style.forSlots(DialogSlots)(Recipes.Sheet({}))
const popoverStyle = Style.forSlots(PopoverSlots)(Recipes.Popover({}))

const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Answered: {} }),
  Bundle.withChild('dialog', Bundles.Dialog, {
    args: { id: 'ask', isAnimated: true },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('alert', Bundles.Dialog, {
    args: { id: 'alert', isAnimated: true, dismissible: false },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('sheet', Bundles.Sheet, { args: { id: 'panel-sheet' }, onOut: Bundle.ignore }),
  Bundle.withChild('popover', Bundles.Popover, {
    args: { id: 'more', isAnimated: true },
    onOut: Bundle.ignore,
  }),
)
type Message = typeof App.Message.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    dialogStyle.css +
    sheetStyle.css +
    popoverStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'overlays-browser'
  document.body.appendChild(container)
  const dialog = (
    h: HtmlBuilder<Message>,
    model: UiDialog.Model,
    wrap: (message: UiDialog.Message) => Message,
    title: string,
    role: 'dialog' | 'alertdialog',
  ) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiDialog.view,
      viewInputs: {
        toView: Dialog.toView([dialogStyle.mixin], { h, role }, parts =>
          h.dialog(
            parts.dialog,
            parts.isVisible
              ? [
                  h.div(parts.backdrop),
                  h.div(parts.panel, [
                    h.h2(parts.title, [title]),
                    h.button(
                      [h.Id(`${model.id}-answer`), h.OnClick(App.Message.Answered())],
                      ['OK'],
                    ),
                  ]),
                ]
              : [],
          ),
        ),
      },
      toParentMessage: wrap,
    })
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: App.Model,
      container,
      init: () => App.placements.initial({}),
      update: App.placements.update((model: typeof App.Model.Type) =>
        App.children.alert.helpers.close()(model),
      ),
      view: (model: typeof App.Model.Type, h: HtmlBuilder<Message>) => {
        const open = (id: string, message: Message) =>
          h.button([h.Id(id), h.OnClick(message)], [id])
        return h.div(
          [],
          [
            open(
              'open-dialog',
              App.Message.GotDialogMessage({ message: UiDialog.Message.RequestedOpen() }),
            ),
            open(
              'open-alert',
              App.Message.GotAlertMessage({ message: UiDialog.Message.RequestedOpen() }),
            ),
            open(
              'open-sheet',
              App.Message.GotSheetMessage({
                message: Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() }),
              }),
            ),
            dialog(
              h,
              model.dialog,
              message => App.Message.GotDialogMessage({ message }),
              'Dialog panel',
              'dialog',
            ),
            dialog(
              h,
              model.alert,
              message => App.Message.GotAlertMessage({ message }),
              'Alert panel',
              'alertdialog',
            ),
            Sheet.view(
              {
                model: model.sheet,
                onMessage: message => App.Message.GotSheetMessage({ message }),
                mixins: [sheetStyle.mixin],
                draw: parts =>
                  h.dialog(
                    parts.dialog,
                    parts.isVisible
                      ? [
                          h.div(parts.backdrop),
                          h.div(parts.panel, [h.h2(parts.title, ['Sheet panel'])]),
                        ]
                      : [],
                  ),
              },
              h,
            ),
            h.submodel({
              slotId: model.popover.id,
              model: model.popover,
              view: UiPopover.view,
              viewInputs: {
                anchor: Popover.anchor(),
                toView: Popover.toView([popoverStyle.mixin], { h }, parts =>
                  h.div(
                    [],
                    [
                      h.button([...parts.button, h.Id('open-popover')], ['Popover']),
                      ...(parts.isVisible
                        ? [
                            h.div(parts.backdrop, []),
                            h.div(parts.layer, [h.div(parts.panel, [h.p([], ['Popover panel'])])]),
                          ]
                        : []),
                    ],
                  ),
                ),
              },
              toParentMessage: message => App.Message.GotPopoverMessage({ message }),
            }),
          ],
        )
      },
    }),
  )
  return handle
}

const text = (content: string) =>
  [...document.querySelectorAll('h2, p')].find(element => element.textContent === content)
const shown = (content: string) => vi.waitFor(() => expect(text(content)).toBeTruthy())
const gone = (content: string) =>
  vi.waitFor(() => expect(text(content)).toBeUndefined(), { timeout: 4000 })
const click = async (id: string) => {
  const found = await vi.waitFor(() => {
    const element = document.getElementById(id)
    expect(element).not.toBeNull()
    return element!
  })
  await userEvent.click(found)
}
/** A press in the corner, away from every panel: on the backdrop or the popover's layer. */
const pressOutside = () => userEvent.click(document.body, { position: { x: 4, y: 4 } })

/** The panel is marked as leaving for a moment before it goes: the exit ran, not a cut. */
const leaves = async (content: string) => {
  const marked = await vi
    .waitFor(
      () => {
        const panel = text(content)?.closest('[data-leave]') ?? text(content)?.parentElement
        expect(panel?.hasAttribute('data-leave')).toBe(true)
      },
      { timeout: 2000, interval: 5 },
    )
    .then(
      () => true,
      () => false,
    )
  await gone(content)
  return marked
}

test('a Dialog closes on Escape and on a press on its backdrop, each by an exit that runs', async () => {
  const handle = mount()
  try {
    await click('open-dialog')
    await shown('Dialog panel')
    const panel = text('Dialog panel')!.closest('div')!
    expect(getComputedStyle(panel).boxShadow).not.toBe('none')
    await userEvent.keyboard('{Escape}')
    expect(await leaves('Dialog panel')).toBe(true)
    await click('open-dialog')
    await shown('Dialog panel')
    await pressOutside()
    expect(await leaves('Dialog panel')).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('an alert dialog ignores Escape and the backdrop, and closes from its answer', async () => {
  const handle = mount()
  try {
    await click('open-alert')
    await shown('Alert panel')
    await userEvent.keyboard('{Escape}')
    await pressOutside()
    // Long enough for an exit that was going to run to have started.
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(text('Alert panel')).toBeTruthy()
    await click('alert-answer')
    expect(await leaves('Alert panel')).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('a Sheet closes on Escape and on a press on its backdrop, by an exit that runs', async () => {
  const handle = mount()
  try {
    await click('open-sheet')
    await shown('Sheet panel')
    await userEvent.keyboard('{Escape}')
    expect(await leaves('Sheet panel')).toBe(true)
    await click('open-sheet')
    await shown('Sheet panel')
    await pressOutside()
    expect(await leaves('Sheet panel')).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('a Popover closes on Escape and on a press outside, and its panel carries a shadow', async () => {
  const handle = mount()
  try {
    await click('open-popover')
    await shown('Popover panel')
    const panel = text('Popover panel')!.closest('div')!
    expect(getComputedStyle(panel).boxShadow).not.toBe('none')
    await userEvent.keyboard('{Escape}')
    expect(await leaves('Popover panel')).toBe(true)
    await click('open-popover')
    await shown('Popover panel')
    await pressOutside()
    expect(await leaves('Popover panel')).toBe(true)
  } finally {
    handle.dispose()
  }
})
