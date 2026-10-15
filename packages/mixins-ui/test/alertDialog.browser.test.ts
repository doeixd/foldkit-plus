/**
 * An alert dialog on a real runtime: an application that drops
 * `Dialog.isDismissal` Messages keeps its dialog open through Escape and a
 * press on the backdrop, and closes it from its own Cancel.
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

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(DialogSlots)(Recipes.Dialog({}))
const Model = Schema.Struct({ dialog: UiDialog.Model })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Got'; readonly message: UiDialog.Message }
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Answered' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** The dialog's next Model, its Commands lifted into this application's Messages. */
const step = (
  next: ReturnType<typeof UiDialog.update>,
): { readonly model: Model; readonly commands: ReadonlyArray<Command<Message>> } => ({
  model: { dialog: next.model },
  commands: mapMessages(next.commands, (message): Message => ({ _tag: 'Got', message })),
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'alert-dialog'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.button([h.OnClick({ _tag: 'Opened' })], ['Remove member']),
        h.submodel({
          slotId: model.dialog.id,
          model: model.dialog,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([style.mixin], { h }, dialog =>
              h.dialog(
                [...dialog.dialog, h.Role('alertdialog')],
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
          toParentMessage: (message: UiDialog.Message): Message => ({ _tag: 'Got', message }),
        }),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: UiDialog.init({ id: 'remove' }) } }),
      update: (model: Model, message: Message) => {
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
      view,
    }),
  )
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog')!
const press = (name: string) =>
  Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === name)!
    .click()

test('Escape and the backdrop leave it open; its own answer closes it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull())
    press('Remove member')
    await vi.waitFor(() => expect(dialog().open).toBe(true))
    expect(dialog().getAttribute('role')).toBe('alertdialog')
    await userEvent.keyboard('{Escape}')
    document.querySelector<HTMLElement>('dialog > div')!.click()
    // Given every chance to close, it has not.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(dialog().open).toBe(true)
    press('Cancel')
    await vi.waitFor(() => expect(dialog().open).toBe(false))
  } finally {
    handle.dispose()
  }
})
