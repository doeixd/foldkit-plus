/**
 * Audit of #558 item 4 against the shipped Dialog on a real runtime: two
 * modal dialogs nested, which Escape closes first, where focus returns, and
 * what a trigger removed before its dialog closes leaves. A test named
 * "today" pins current behaviour that a finding in
 * `docs/design/558-audit-FINDINGS.md` calls a gap.
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
import { Dialog, DialogSlots, Recipes } from '../../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(DialogSlots)(Recipes.Dialog({}))

const Model = Schema.Struct({
  outer: UiDialog.Model,
  inner: UiDialog.Model,
  trigger: Schema.Boolean,
})
type Model = typeof Model.Type

type Message =
  | { readonly _tag: 'GotOuter'; readonly message: UiDialog.Message }
  | { readonly _tag: 'GotInner'; readonly message: UiDialog.Message }
  | { readonly _tag: 'OpenedOuter' }
  | { readonly _tag: 'OpenedInner' }
  | { readonly _tag: 'HidTrigger' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const dialogView =
  (
    title: string,
    content: (h: HtmlBuilder<Message>) => ReadonlyArray<ReturnType<HtmlBuilder<Message>['div']>>,
  ) =>
  (h: HtmlBuilder<Message>) =>
    Dialog.toView([style.mixin], { h }, dialog =>
      h.dialog(
        dialog.dialog,
        dialog.isVisible
          ? [
              h.div(dialog.backdrop),
              h.div(dialog.panel, [h.h2(dialog.title, [title]), ...content(h)]),
            ]
          : [],
      ),
    )

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'dialog-nesting'
  document.body.append(container)
  const lift =
    (_tag: 'GotOuter' | 'GotInner') =>
    (next: ReturnType<typeof UiDialog.update>, model: Model, field: 'outer' | 'inner') => ({
      model: { ...model, [field]: next.model },
      commands: mapMessages(next.commands, (message): Message => ({
        _tag,
        message,
      })) as ReadonlyArray<Command<Message>>,
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          outer: UiDialog.init({ id: 'outer' }),
          inner: UiDialog.init({ id: 'inner' }),
          trigger: true,
        },
      }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'GotOuter':
            return lift('GotOuter')(UiDialog.update(model.outer, message.message), model, 'outer')
          case 'GotInner':
            return lift('GotInner')(UiDialog.update(model.inner, message.message), model, 'inner')
          case 'OpenedOuter':
            return lift('GotOuter')(UiDialog.open(model.outer), model, 'outer')
          case 'OpenedInner':
            return lift('GotInner')(UiDialog.open(model.inner), model, 'inner')
          case 'HidTrigger':
            return { model: { ...model, trigger: false } }
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            ...(model.trigger
              ? [h.button([h.Id('open-outer'), h.OnClick({ _tag: 'OpenedOuter' })], ['Open outer'])]
              : []),
            h.submodel({
              slotId: model.outer.id,
              model: model.outer,
              view: UiDialog.view,
              viewInputs: {
                toView: dialogView('Outer', h => [
                  h.button(
                    [h.Id('open-inner'), h.OnClick({ _tag: 'OpenedInner' })],
                    ['Open inner'],
                  ),
                  h.button(
                    [h.Id('hide-trigger'), h.OnClick({ _tag: 'HidTrigger' })],
                    ['Hide trigger'],
                  ),
                ])(h),
              },
              toParentMessage: (message: UiDialog.Message): Message => ({
                _tag: 'GotOuter',
                message,
              }),
            }),
            h.submodel({
              slotId: model.inner.id,
              model: model.inner,
              view: UiDialog.view,
              viewInputs: { toView: dialogView('Inner', () => [])(h) },
              toParentMessage: (message: UiDialog.Message): Message => ({
                _tag: 'GotInner',
                message,
              }),
            }),
          ],
        ),
    }),
  )
}

const dialogs = () => Array.from(document.querySelectorAll<HTMLDialogElement>('dialog'))
const opened = () => dialogs().filter(dialog => dialog.open).length
const byId = (id: string) => document.getElementById(id)!
const settle = () => new Promise(resolve => setTimeout(resolve, 150))

test('Escape closes the inner dialog only, and focus returns to each opener in turn', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(byId('open-outer')).not.toBeNull())
    await userEvent.click(byId('open-outer'))
    await vi.waitFor(() => expect(opened()).toBe(1))
    await userEvent.click(byId('open-inner'))
    await vi.waitFor(() => expect(opened()).toBe(2))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(opened()).toBe(1))
    await vi.waitFor(() => expect(document.activeElement).toBe(byId('open-inner')))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(opened()).toBe(0))
    await vi.waitFor(() => expect(document.activeElement).toBe(byId('open-outer')))
  } finally {
    handle.dispose()
  }
})

test('a trigger removed while its dialog is open leaves focus on the body when it closes (today)', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(byId('open-outer')).not.toBeNull())
    await userEvent.click(byId('open-outer'))
    await vi.waitFor(() => expect(opened()).toBe(1))
    await userEvent.click(byId('hide-trigger'))
    await vi.waitFor(() => expect(document.getElementById('open-outer')).toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(opened()).toBe(0))
    await settle()
    expect(document.activeElement).toBe(document.body)
  } finally {
    handle.dispose()
  }
})
