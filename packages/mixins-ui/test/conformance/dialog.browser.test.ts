/**
 * `Conformance.dialog` against the shipped Dialog and against dialogs
 * assembled from primitives, each with a second dialog opened from the first.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import { mapMessages, type Command } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Conformance } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Dialog, DialogSlots, Recipes } from '../../src/index.js'
import * as HandBuilt from './dialog.handBuilt.js'
import { harness } from './harness.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(DialogSlots)(Recipes.Dialog({}))

const Model = Schema.Struct({ outer: UiDialog.Model, inner: UiDialog.Model })
type Model = typeof Model.Type

type Message =
  | { readonly _tag: 'GotOuter'; readonly message: UiDialog.Message }
  | { readonly _tag: 'GotInner'; readonly message: UiDialog.Message }
  | { readonly _tag: 'OpenedOuter' }
  | { readonly _tag: 'OpenedInner' }

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

const mountShipped = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'conformance-dialog'
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
        model: { outer: UiDialog.init({ id: 'outer' }), inner: UiDialog.init({ id: 'inner' }) },
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
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.button([h.Id('open-outer'), h.OnClick({ _tag: 'OpenedOuter' })], ['Open outer']),
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

const byId = (id: string) => document.getElementById(id)

const spec = {
  name: 'Outer',
  trigger: () => byId('open-outer'),
  open: async () => {
    await harness.press('{Enter}')
  },
  nested: {
    name: 'Inner',
    trigger: () => byId('open-inner'),
    open: async () => {
      await harness.press('{Enter}')
    },
  },
}

test.each([
  ['the shipped Dialog', mountShipped],
  ['dialogs assembled from primitives', HandBuilt.mount],
] as const)('%s conform, one over another', async (_, mount) => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(byId('open-outer')).not.toBeNull())
    const result = await Conformance.dialog(harness, spec)
    expect(Conformance.failures(result)).toEqual([])
    expect(result.length).toBeGreaterThan(8)
  } finally {
    handle.dispose()
  }
})
