/**
 * The dialog on a real page: the open panel sits in the middle of the
 * viewport, which `@foldkit/ui` covers with the dialog element; and an alert
 * dialog, whose application drops `Dialog.isDismissal` Messages, stays open
 * through Escape and a press on the backdrop and closes from its own Cancel.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import { mapMessages, type Command } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Dialog, DialogSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const style = Style.forSlots(DialogSlots)(Recipes.Dialog({}))

const Model = Schema.Struct({ dialog: UiDialog.Model })
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (model: Model, h: HtmlBuilder<UiDialog.Message>) =>
  UiDialog.view(
    model.dialog,
    {
      toView: Dialog.toView([style.mixin], { h }, dialog =>
        h.dialog(
          dialog.dialog,
          dialog.isVisible
            ? [
                h.div(dialog.backdrop),
                h.div(dialog.panel, [h.h2(dialog.title, ['Delete this project?'])]),
              ]
            : [],
        ),
      ),
    },
    h,
  )

test('the open panel sits in the middle of the viewport', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'dialog-browser'
  document.body.appendChild(container)
  const opened = UiDialog.open(UiDialog.init({ id: 'centered' }))
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: opened.model } }),
      update: (model: Model, message: UiDialog.Message) => ({
        model: { dialog: UiDialog.update(model.dialog, message).model },
      }),
      view,
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('h2')).toBeTruthy())
    const panel = document.querySelector('h2')!.parentElement!.getBoundingClientRect()
    const middle = (panel.top + panel.bottom) / 2
    expect(Math.abs(middle - window.innerHeight / 2)).toBeLessThan(2)
  } finally {
    handle.dispose()
  }
})

type AlertMessage =
  | { readonly _tag: 'Got'; readonly message: UiDialog.Message }
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Answered' }

/** The dialog's next Model, its Commands lifted into the alert's Messages. */
const step = (
  next: ReturnType<typeof UiDialog.update>,
): { readonly model: Model; readonly commands: ReadonlyArray<Command<AlertMessage>> } => ({
  model: { dialog: next.model },
  commands: mapMessages(next.commands, (message): AlertMessage => ({ _tag: 'Got', message })),
})

const mountAlert = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'alert-dialog'
  document.body.appendChild(container)
  const alertView = (model: Model, h: HtmlBuilder<AlertMessage>) =>
    h.div(
      [],
      [
        h.button([h.OnClick({ _tag: 'Opened' })], ['Remove member']),
        h.submodel({
          slotId: model.dialog.id,
          model: model.dialog,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([style.mixin], { h, role: 'alertdialog' }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.h2(dialog.title, ['Remove Ada?']),
                        h.button([h.OnClick({ _tag: 'Answered' })], ['Cancel']),
                      ]),
                    ]
                  : [],
              ),
            ),
          },
          toParentMessage: (message: UiDialog.Message): AlertMessage => ({ _tag: 'Got', message }),
        }),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: UiDialog.init({ id: 'remove' }) } }),
      update: (model: Model, message: AlertMessage) => {
        switch (message._tag) {
          case 'Got':
            // Escape and the backdrop dismiss nothing: only an answer closes it.
            return Dialog.isDismissal(message.message)
              ? { model }
              : step(UiDialog.update(model.dialog, message.message))
          case 'Opened':
            return step(UiDialog.open(model.dialog))
          case 'Answered':
            return step(UiDialog.close(model.dialog))
        }
      },
      view: alertView,
    }),
  )
}

const dialogElement = () => document.querySelector<HTMLDialogElement>('dialog')!
const press = (name: string) =>
  Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === name)!
    .click()

test('an alert dialog stays open through Escape and the backdrop; its answer closes it', async () => {
  const handle = mountAlert()
  try {
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull())
    press('Remove member')
    await vi.waitFor(() => expect(dialogElement().open).toBe(true))
    expect(dialogElement().getAttribute('role')).toBe('alertdialog')
    await userEvent.keyboard('{Escape}')
    document.querySelector<HTMLElement>('dialog > div')!.click()
    // Given every chance to close, it has not.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(dialogElement().open).toBe(true)
    press('Cancel')
    await vi.waitFor(() => expect(dialogElement().open).toBe(false))
  } finally {
    handle.dispose()
  }
})
