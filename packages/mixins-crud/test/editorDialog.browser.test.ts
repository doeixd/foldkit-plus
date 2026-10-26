/// <reference types="@vitest/browser-playwright" />
/**
 * An `EditorView` drawn in the Dialog an application places, in a real
 * browser: opening it puts focus in the form, Tab stays inside, Escape closes it
 * through the application's own Message, and focus goes back to the button
 * that opened it. Each is the Dialog's rule; the editor only has to draw
 * inside it.
 */
import { Dialog as UiDialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import { Dialog } from 'foldkit-mixins-ui'
import { mapMessages, type Command } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { EditorView } from '../src/index.js'

const Post = Form.make(
  'Post',
  Form.input(Schema.Struct({ title: Schema.String, body: Schema.String })),
)
const PostForm = FormView.define(Post)

const Model = Schema.Struct({ dialog: UiDialog.Model, form: Post.bundle.Model })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'GotDialog'; readonly message: UiDialog.Message }
  | { readonly _tag: 'GotForm'; readonly message: typeof Post.Message.Type }

const Editor = EditorView.forMessages<Message>().define()

const step = (
  model: Model,
  next: ReturnType<typeof UiDialog.update>,
): { readonly model: Model; readonly commands: ReadonlyArray<Command<Message>> } => ({
  model: { ...model, dialog: next.model },
  commands: mapMessages(next.commands, (message): Message => ({ _tag: 'GotDialog', message })),
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.button([h.Id('open'), h.OnClick({ _tag: 'Opened' })], ['Edit post']),
      h.submodel({
        slotId: model.dialog.id,
        model: model.dialog,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView([], { h }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      Editor(
                        {
                          id: 'editor',
                          status: 'Editing',
                          title: 'Edit post',
                          form: h.submodel({
                            slotId: 'post-form',
                            model: model.form,
                            view: FormView.submodel(Post, PostForm),
                            viewInputs: {},
                            toParentMessage: (message: typeof Post.Message.Type): Message => ({
                              _tag: 'GotForm',
                              message,
                            }),
                          }),
                          onClose: { _tag: 'Closed' },
                        },
                        h,
                      ),
                    ]),
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: (message: UiDialog.Message): Message => ({ _tag: 'GotDialog', message }),
      }),
    ],
  )

const mount = () => {
  const container = document.createElement('div')
  container.id = 'editor-dialog'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: UiDialog.init({ id: 'edit' }), form: Post.initial } }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Opened':
            return step(model, UiDialog.open(model.dialog))
          case 'Closed':
            return step(model, UiDialog.close(model.dialog))
          case 'GotDialog':
            return step(model, UiDialog.update(model.dialog, message.message))
          case 'GotForm':
            return {
              model: {
                ...model,
                form: Post.bundle.update(model.form, message.message, undefined).model,
              },
            }
        }
      },
      view,
    }),
  )
}

afterEach(() => document.body.replaceChildren())

const dialog = () => document.querySelector<HTMLDialogElement>('dialog')!
const opener = () => document.getElementById('open')!

test('focus enters the editor, stays in it, and returns to its opener when Escape closes it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(opener()).not.toBeNull())
    await userEvent.click(opener())
    await vi.waitFor(() => expect(dialog().open).toBe(true))
    await vi.waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true))
    // Round the dialog's controls and further: focus never leaves it.
    for (let press = 0; press < 6; press += 1) {
      await userEvent.keyboard('{Tab}')
      expect(dialog().contains(document.activeElement)).toBe(true)
    }
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(dialog().open).toBe(false))
    await vi.waitFor(() => expect(document.activeElement).toBe(opener()))
  } finally {
    handle.dispose()
  }
})

test('the editor’s close button closes it through the application’s Message', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(opener()).not.toBeNull())
    await userEvent.click(opener())
    await vi.waitFor(() => expect(dialog().open).toBe(true))
    const close = Array.from(dialog().querySelectorAll('button')).find(
      button => button.textContent === 'Close',
    )!
    // The unstyled panel never reads as stable to Playwright's locator: press it directly.
    close.click()
    await vi.waitFor(() => expect(dialog().open).toBe(false))
    await vi.waitFor(() => expect(document.activeElement).toBe(opener()))
  } finally {
    handle.dispose()
  }
})
